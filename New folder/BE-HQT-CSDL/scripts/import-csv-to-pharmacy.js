import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { getPool, closePool, sql } from '../src/config/db.js'

const CSV_DIR = process.argv[2] || 'C:\\Users\\ADMIN\\Downloads\\output'
const BULK_BATCH_SIZE = 1000

function normalizeRow(row) {
  const normalized = {}
  for (const [key, value] of Object.entries(row)) {
    normalized[key.replace(/^\uFEFF/, '')] = value
  }
  return normalized
}

function readCsv(fileName) {
  const filePath = path.join(CSV_DIR, fileName)
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  }).map(normalizeRow)
}

function emptyToNull(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function toBit(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback
  const text = String(value).trim().toLowerCase()
  if (text === '0' || text === 'false') return 0
  return 1
}

function toNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toDate(value) {
  const text = emptyToNull(value)
  if (!text) return null
  return text.slice(0, 10)
}

function toDateTime(value) {
  const text = emptyToNull(value)
  if (!text) return null
  return text.slice(0, 19).replace('T', ' ')
}

function chunk(items, size) {
  const result = []
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size))
  return result
}

function dedupeManufacturers(rows) {
  const keptByName = new Map()
  const idRemap = new Map()
  const kept = []

  for (const row of rows) {
    const key = row.ManufacturerName.toLowerCase()
    const existing = keptByName.get(key)
    if (!existing) {
      keptByName.set(key, row)
      kept.push(row)
      continue
    }
    idRemap.set(row.ManufacturerId, existing.ManufacturerId)
  }

  return { rows: kept, idRemap }
}

function remapManufacturerId(id, idRemap) {
  if (!id) return null
  return idRemap.get(id) || id
}

async function exec(pool, queryText) {
  await pool.request().query(queryText)
}

function columnSqlType(columnName) {
  if (/^(IsActive|IsRoot)$/i.test(columnName)) return sql.Bit
  if (/(Qty|Quantity|MinStock|StockSnapshot)$/i.test(columnName)) return sql.Int
  if (/(Price|Amount|Cost|Spent|Refund|Total)/i.test(columnName)) return sql.Decimal(18, 2)
  if (/^(ImportDate|ExpiryDate|HireDate)$/i.test(columnName)) return sql.Date
  if (/Date|CreatedAt/i.test(columnName)) return sql.DateTime2(0)
  if (/Name|Note|Reason|Ingredient|Usage|Dosage|Route|Address|Gender|Status|AlertType|ProductType|Snapshot|Email|Hash|Username/i.test(columnName)) {
    return sql.NVarChar(sql.MAX)
  }
  return sql.VarChar(255)
}

async function insertBatches(pool, tableName, columns, rows) {
  if (!rows.length) {
    console.log(`  skip ${tableName} (0 rows)`)
    return
  }

  let inserted = 0

  for (const batch of chunk(rows, BULK_BATCH_SIZE)) {
    const table = new sql.Table(tableName)
    table.create = false
    for (const column of columns) {
      table.columns.add(column, columnSqlType(column), { nullable: true })
    }

    for (const row of batch) {
      table.rows.add(...columns.map((column) => row[column] ?? null))
    }

    const request = pool.request()
    request.timeout = 300000
    await request.bulk(table)
    inserted += batch.length
    if (inserted % 5000 === 0 || inserted === rows.length) {
      process.stdout.write(`\r  ${tableName}: ${inserted}/${rows.length}`)
    }
  }
  process.stdout.write(`\r  ${tableName}: ${inserted}/${rows.length}\n`)
}

async function seedBaseData(pool) {
  await exec(pool, `
    IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleId = 'ADMIN')
      INSERT INTO dbo.Role (RoleId, RoleName, Description)
      VALUES ('ADMIN', N'Quản trị viên', N'Chủ nhà thuốc / Admin toàn hệ thống');

    IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleId = 'STAFF')
      INSERT INTO dbo.Role (RoleId, RoleName, Description)
      VALUES ('STAFF', N'Nhân viên bán hàng', N'Bán hàng tại quầy, tạo hóa đơn');

    IF NOT EXISTS (SELECT 1 FROM dbo.Unit)
      INSERT INTO dbo.Unit (UnitId, UnitName) VALUES
        ('VIEN', N'Viên'), ('VI', N'Vỉ'), ('HOP', N'Hộp'), ('CHAI', N'Chai'),
        ('GOI', N'Gói'), ('LO', N'Lọ'), ('TUYP', N'Tuýp'), ('CAI', N'Cái');
  `)
}

async function clearTransactionalData(pool) {
  console.log('Clearing existing data...')
  await exec(pool, `
    DELETE FROM dbo.Notification;
    DELETE FROM dbo.InventoryAlert;
    DELETE FROM dbo.StockWriteOffLine;
    DELETE FROM dbo.StockWriteOff;
    DELETE FROM dbo.SalesReturnLine;
    DELETE FROM dbo.SalesReturn;
    DELETE FROM dbo.SalesInvoiceLine;
    DELETE FROM dbo.SalesInvoice;
    DELETE FROM dbo.PurchaseReceiptLine;
    DELETE FROM dbo.PurchaseReceipt;
    DELETE FROM dbo.MedicineBatch;
    DELETE FROM dbo.Medicine;
    DELETE FROM dbo.Customer;
    DELETE FROM dbo.Employee;
    DELETE FROM dbo.Manufacturer;
    DELETE FROM dbo.Supplier;
    DELETE FROM dbo.MedicineCategory;
  `)
}

async function importAll(pool) {
  console.log(`Reading CSV from: ${CSV_DIR}`)

  const medicineCategories = readCsv('MedicineCategory.csv').map((row) => ({
    CategoryId: row.CategoryId,
    CategoryName: row.CategoryName,
    Description: null,
  }))

  const suppliers = readCsv('Supplier.csv').map((row) => ({
    SupplierId: row.SupplierId,
    SupplierName: row.SupplierName,
    Email: emptyToNull(row.Email),
    Address: emptyToNull(row.Address),
    IsActive: 1,
  }))

  const manufacturerSource = readCsv('Manufacturer.csv').map((row) => ({
    ManufacturerId: row.ManufacturerId,
    ManufacturerName: row.ManufacturerName,
    Country: emptyToNull(row.Country),
  }))
  const { rows: manufacturers, idRemap: manufacturerIdRemap } = dedupeManufacturers(manufacturerSource)
  if (manufacturerIdRemap.size > 0) {
    console.log(`  deduped manufacturers: ${manufacturerSource.length} -> ${manufacturers.length}`)
  }

  const employees = readCsv('Employee.csv').map((row) => ({
    EmployeeId: row.EmployeeId,
    FullName: row.FullName,
    Phone: emptyToNull(row.Phone),
    Email: row.Email,
    Username: row.Username,
    PasswordHash: row.PasswordHash,
    RoleId: row.RoleId,
    IsActive: toBit(row.IsActive, 1),
    IsRoot: row.EmployeeId === 'NV001' ? 1 : 0,
    HireDate: toDate(row.HireDate),
  }))

  const customers = readCsv('Customer.csv').map((row) => ({
    CustomerId: row.CustomerId,
    CustomerName: row.CustomerName,
    Phone: emptyToNull(row.Phone),
    Gender: emptyToNull(row.Gender),
    TotalSpent: toNumber(row.TotalSpent, 0),
    CreatedAt: toDateTime(row.CreatedAt) || toDateTime(new Date().toISOString()),
  }))

  const medicines = readCsv('Medicine.csv').map((row) => ({
    MedicineId: row.MedicineId,
    MedicineName: row.MedicineName,
    CategoryId: emptyToNull(row.CategoryId),
    UnitId: row.UnitId,
    ManufacturerId: remapManufacturerId(emptyToNull(row.ManufacturerId), manufacturerIdRemap),
    ProductType: row.ProductType,
    DrugRegistrationCode: emptyToNull(row.DrugRegistrationCode),
    ListPrice: toNumber(row.ListPrice, 0),
    MinStock: toNumber(row.MinStock, 0),
    IsActive: toBit(row.IsActive, 1),
    Ingredient: emptyToNull(row.Ingredient),
    Usage: emptyToNull(row.Usage),
    Dosage: emptyToNull(row.Dosage),
    Route: emptyToNull(row.Route),
  }))

  const medicineBatches = readCsv('MedicineBatch.csv').map((row) => ({
    BatchId: row.BatchId,
    MedicineId: row.MedicineId,
    ImportPrice: toNumber(row.ImportPrice, 0),
    ImportDate: toDate(row.ImportDate),
    ExpiryDate: toDate(row.ExpiryDate),
    InitialQty: toNumber(row.InitialQty, 0),
    CurrentQty: toNumber(row.CurrentQty, 0),
    SupplierId: emptyToNull(row.SupplierId),
    ManufacturerId: remapManufacturerId(emptyToNull(row.ManufacturerId), manufacturerIdRemap),
    Note: null,
  }))

  const purchaseReceipts = readCsv('PurchaseReceipt.csv').map((row) => ({
    ReceiptId: row.ReceiptId,
    SupplierId: row.SupplierId,
    EmployeeId: row.EmployeeId,
    ReceiptDate: toDateTime(row.ReceiptDate) || toDateTime(new Date().toISOString()),
    TotalAmount: toNumber(row.TotalAmount, 0),
    Status: row.Status || 'COMPLETED',
    Note: null,
  }))

  const purchaseReceiptLines = readCsv('PurchaseReceiptLine.csv').map((row) => ({
    LineId: row.LineId,
    ReceiptId: row.ReceiptId,
    MedicineId: row.MedicineId,
    BatchId: row.BatchId,
    Quantity: toNumber(row.Quantity, 0),
    UnitCost: toNumber(row.UnitCost, 0),
    LineTotal: toNumber(row.LineTotal, 0),
  }))

  const salesInvoices = readCsv('SalesInvoice.csv').map((row) => ({
    InvoiceId: row.InvoiceId,
    EmployeeId: row.EmployeeId,
    CustomerId: row.CustomerId,
    CustomerNameSnapshot: row.CustomerNameSnapshot,
    PhoneSnapshot: emptyToNull(row.PhoneSnapshot),
    InvoiceDate: toDateTime(row.InvoiceDate) || toDateTime(new Date().toISOString()),
    TotalAmount: toNumber(row.TotalAmount, 0),
    Status: row.Status || 'COMPLETED',
    Note: emptyToNull(row.Note),
  }))

  const salesInvoiceLines = readCsv('SalesInvoiceLine.csv').map((row) => ({
    LineId: row.LineId,
    InvoiceId: row.InvoiceId,
    MedicineId: row.MedicineId,
    BatchId: row.BatchId,
    MedicineNameSnapshot: row.MedicineNameSnapshot,
    UnitNameSnapshot: row.UnitNameSnapshot,
    Quantity: toNumber(row.Quantity, 0),
    UnitPrice: toNumber(row.UnitPrice, 0),
    LineTotal: toNumber(row.LineTotal, 0),
    CostPriceSnapshot: toNumber(row.CostPriceSnapshot, 0),
  }))

  const salesReturns = readCsv('SalesReturn.csv').map((row) => ({
    ReturnId: row.ReturnId,
    InvoiceId: row.InvoiceId,
    EmployeeId: row.EmployeeId,
    ReturnDate: toDateTime(row.ReturnDate) || toDateTime(new Date().toISOString()),
    TotalRefund: toNumber(row.TotalRefund, 0),
    Reason: emptyToNull(row.Reason),
    Status: row.Status || 'COMPLETED',
  }))

  const salesReturnLines = readCsv('SalesReturnLine.csv').map((row) => ({
    LineId: row.LineId,
    ReturnId: row.ReturnId,
    InvoiceLineId: row.InvoiceLineId,
    Quantity: toNumber(row.Quantity, 0),
    RefundAmount: toNumber(row.RefundAmount, 0),
    Reason: emptyToNull(row.Reason),
  }))

  const stockWriteOffs = readCsv('StockWriteOff.csv').map((row) => ({
    WriteOffId: row.WriteOffId,
    EmployeeId: row.EmployeeId,
    WriteOffDate: toDateTime(row.WriteOffDate) || toDateTime(new Date().toISOString()),
    TotalCost: toNumber(row.TotalCost, 0),
    Reason: emptyToNull(row.Reason),
    Status: row.Status || 'COMPLETED',
  }))

  const stockWriteOffLines = readCsv('StockWriteOffLine.csv').map((row) => ({
    LineId: row.LineId,
    WriteOffId: row.WriteOffId,
    BatchId: row.BatchId,
    MedicineId: row.MedicineId,
    Quantity: toNumber(row.Quantity, 0),
    UnitCost: toNumber(row.UnitCost, 0),
    LineCost: toNumber(row.LineCost, 0),
    Reason: emptyToNull(row.Reason),
  }))

  const inventoryAlerts = readCsv('InventoryAlert.csv').map((row) => ({
    AlertId: row.AlertId,
    MedicineId: row.MedicineId,
    AlertType: row.AlertType,
    StockSnapshot: toNumber(row.StockSnapshot, 0),
    MinStock: toNumber(row.MinStock, 0),
    Note: emptyToNull(row.Note),
    Status: row.Status || 'PENDING',
    CreatedBy: emptyToNull(row.CreatedBy),
    CreatedAt: toDateTime(new Date().toISOString()),
  }))

  console.log('Importing...')
  await insertBatches(pool, 'dbo.MedicineCategory', ['CategoryId', 'CategoryName', 'Description'], medicineCategories)
  await insertBatches(pool, 'dbo.Supplier', ['SupplierId', 'SupplierName', 'Email', 'Address', 'IsActive'], suppliers)
  await insertBatches(pool, 'dbo.Manufacturer', ['ManufacturerId', 'ManufacturerName', 'Country'], manufacturers)
  await insertBatches(pool, 'dbo.Employee', ['EmployeeId', 'FullName', 'Phone', 'Email', 'Username', 'PasswordHash', 'RoleId', 'IsActive', 'IsRoot', 'HireDate'], employees)
  await insertBatches(pool, 'dbo.Customer', ['CustomerId', 'CustomerName', 'Phone', 'Gender', 'TotalSpent', 'CreatedAt'], customers)
  await insertBatches(pool, 'dbo.Medicine', ['MedicineId', 'MedicineName', 'CategoryId', 'UnitId', 'ManufacturerId', 'ProductType', 'DrugRegistrationCode', 'ListPrice', 'MinStock', 'IsActive', 'Ingredient', 'Usage', 'Dosage', 'Route'], medicines)
  await insertBatches(pool, 'dbo.MedicineBatch', ['BatchId', 'MedicineId', 'ImportPrice', 'ImportDate', 'ExpiryDate', 'InitialQty', 'CurrentQty', 'SupplierId', 'ManufacturerId', 'Note'], medicineBatches)
  await insertBatches(pool, 'dbo.PurchaseReceipt', ['ReceiptId', 'SupplierId', 'EmployeeId', 'ReceiptDate', 'TotalAmount', 'Status', 'Note'], purchaseReceipts)
  await insertBatches(pool, 'dbo.PurchaseReceiptLine', ['LineId', 'ReceiptId', 'MedicineId', 'BatchId', 'Quantity', 'UnitCost', 'LineTotal'], purchaseReceiptLines)
  await insertBatches(pool, 'dbo.SalesInvoice', ['InvoiceId', 'EmployeeId', 'CustomerId', 'CustomerNameSnapshot', 'PhoneSnapshot', 'InvoiceDate', 'TotalAmount', 'Status', 'Note'], salesInvoices)
  await insertBatches(pool, 'dbo.SalesInvoiceLine', ['LineId', 'InvoiceId', 'MedicineId', 'BatchId', 'MedicineNameSnapshot', 'UnitNameSnapshot', 'Quantity', 'UnitPrice', 'LineTotal', 'CostPriceSnapshot'], salesInvoiceLines)
  await insertBatches(pool, 'dbo.SalesReturn', ['ReturnId', 'InvoiceId', 'EmployeeId', 'ReturnDate', 'TotalRefund', 'Reason', 'Status'], salesReturns)
  await insertBatches(pool, 'dbo.SalesReturnLine', ['LineId', 'ReturnId', 'InvoiceLineId', 'Quantity', 'RefundAmount', 'Reason'], salesReturnLines)
  await insertBatches(pool, 'dbo.StockWriteOff', ['WriteOffId', 'EmployeeId', 'WriteOffDate', 'TotalCost', 'Reason', 'Status'], stockWriteOffs)
  await insertBatches(pool, 'dbo.StockWriteOffLine', ['LineId', 'WriteOffId', 'BatchId', 'MedicineId', 'Quantity', 'UnitCost', 'LineCost', 'Reason'], stockWriteOffLines)
  await insertBatches(pool, 'dbo.InventoryAlert', ['AlertId', 'MedicineId', 'AlertType', 'StockSnapshot', 'MinStock', 'Note', 'Status', 'CreatedBy', 'CreatedAt'], inventoryAlerts)
}

async function printSummary(pool) {
  const summary = await pool.request().query(`
    SELECT 'MedicineCategory' AS [Table], COUNT(*) AS [Rows] FROM dbo.MedicineCategory UNION ALL
    SELECT 'Supplier', COUNT(*) FROM dbo.Supplier UNION ALL
    SELECT 'Manufacturer', COUNT(*) FROM dbo.Manufacturer UNION ALL
    SELECT 'Employee', COUNT(*) FROM dbo.Employee UNION ALL
    SELECT 'Customer', COUNT(*) FROM dbo.Customer UNION ALL
    SELECT 'Medicine', COUNT(*) FROM dbo.Medicine UNION ALL
    SELECT 'MedicineBatch', COUNT(*) FROM dbo.MedicineBatch UNION ALL
    SELECT 'PurchaseReceipt', COUNT(*) FROM dbo.PurchaseReceipt UNION ALL
    SELECT 'PurchaseReceiptLine', COUNT(*) FROM dbo.PurchaseReceiptLine UNION ALL
    SELECT 'SalesInvoice', COUNT(*) FROM dbo.SalesInvoice UNION ALL
    SELECT 'SalesInvoiceLine', COUNT(*) FROM dbo.SalesInvoiceLine UNION ALL
    SELECT 'SalesReturn', COUNT(*) FROM dbo.SalesReturn UNION ALL
    SELECT 'SalesReturnLine', COUNT(*) FROM dbo.SalesReturnLine UNION ALL
    SELECT 'StockWriteOff', COUNT(*) FROM dbo.StockWriteOff UNION ALL
    SELECT 'StockWriteOffLine', COUNT(*) FROM dbo.StockWriteOffLine UNION ALL
    SELECT 'InventoryAlert', COUNT(*) FROM dbo.InventoryAlert
    ORDER BY [Table]
  `)
  console.log('\nImport summary:')
  for (const row of summary.recordset) console.log(`  ${row.Table}: ${row.Rows}`)
}

async function main() {
  if (!fs.existsSync(CSV_DIR)) {
    throw new Error(`CSV folder not found: ${CSV_DIR}`)
  }

  const pool = await getPool()
  pool.config.requestTimeout = 300000
  try {
    await seedBaseData(pool)
    await clearTransactionalData(pool)
    await importAll(pool)
    await printSummary(pool)
    console.log('\nDone.')
  } finally {
    await closePool()
  }
}

main().catch((err) => {
  console.error('\nImport failed:', err.message)
  if (err.precedingErrors?.length) {
    for (const e of err.precedingErrors) console.error(' -', e.message)
  }
  process.exit(1)
})
