import { query, queryOne, withTransaction } from '../config/db.js'
import AppError from '../utils/AppError.js'
import * as alertService from './alert.service.js'

// ============================================================
// helper
// ============================================================
function mapReceipt(row) {
  if (!row) return null
  return {
    receiptId: row.ReceiptId,
    receiptDate: row.ReceiptDate,
    totalAmount: Number(row.TotalAmount),
    status: row.Status,
    note: row.Note,
    supplier: { supplierId: row.SupplierId, supplierName: row.SupplierName },
    employee: { employeeId: row.EmployeeId, employeeName: row.EmployeeName },
    lineCount: row.LineCount,
  }
}

function mapReceiptLine(row) {
  if (!row) return null
  return {
    lineId: row.LineId,
    medicineId: row.MedicineId,
    medicineName: row.MedicineName,
    batchId: row.BatchId,
    quantity: row.Quantity,
    unitCost: Number(row.UnitCost),
    lineTotal: Number(row.LineTotal),
    importDate: row.ImportDate,
    expiryDate: row.ExpiryDate,
    currentQty: row.CurrentQty,
  }
}

// sinh ReceiptId moi: PN000001, PN000002, ...
function genNextReceiptId(maxId) {
  if (!maxId) return 'PN000001'
  const num = parseInt(maxId.slice(2), 10) + 1
  return 'PN' + String(num).padStart(6, '0')
}

// sinh BatchId tu ReceiptId + index dong, dam bao unique (UQ_RL_Batch)
function genBatchId(receiptId, index) {
  return `${receiptId}-L${String(index + 1).padStart(2, '0')}`
}

// ============================================================
// API
// ============================================================
export async function getAll(filters = {}) {
  const conditions = []
  const params = {}

  if (filters.supplierId) {
    conditions.push('r.SupplierId = @supplierId')
    params.supplierId = filters.supplierId
  }
  if (filters.from) {
    conditions.push('r.ReceiptDate >= @from')
    params.from = filters.from
  }
  if (filters.to) {
    conditions.push('r.ReceiptDate <= @to')
    params.to = filters.to
  }
  if (filters.status) {
    conditions.push('r.Status = @status')
    params.status = filters.status
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

  const sql = `
    SELECT r.ReceiptId, r.ReceiptDate, r.TotalAmount, r.Status, r.Note,
           s.SupplierId, s.SupplierName,
           e.EmployeeId, e.FullName AS EmployeeName,
           (SELECT COUNT(*) FROM dbo.PurchaseReceiptLine WHERE ReceiptId = r.ReceiptId) AS LineCount
    FROM dbo.PurchaseReceipt r
    JOIN dbo.Supplier s ON s.SupplierId = r.SupplierId
    JOIN dbo.Employee e ON e.EmployeeId = r.EmployeeId
    ${where}
    ORDER BY r.ReceiptDate DESC
  `

  const rows = await query(sql, params)
  return rows.map(mapReceipt)
}

export async function getById(receiptId) {
  const header = await queryOne(
    `SELECT r.ReceiptId, r.ReceiptDate, r.TotalAmount, r.Status, r.Note,
            s.SupplierId, s.SupplierName,
            e.EmployeeId, e.FullName AS EmployeeName,
            (SELECT COUNT(*) FROM dbo.PurchaseReceiptLine WHERE ReceiptId = r.ReceiptId) AS LineCount
     FROM dbo.PurchaseReceipt r
     JOIN dbo.Supplier s ON s.SupplierId = r.SupplierId
     JOIN dbo.Employee e ON e.EmployeeId = r.EmployeeId
     WHERE r.ReceiptId = @id`,
    { id: receiptId }
  )
  if (!header) {
    throw new AppError('Không tìm thấy phiếu nhập', 404, 'RECEIPT_NOT_FOUND')
  }

  const lines = await query(
    `SELECT l.LineId, l.Quantity, l.UnitCost, l.LineTotal,
            m.MedicineId, m.MedicineName,
            b.BatchId, b.ImportDate, b.ExpiryDate, b.CurrentQty
     FROM dbo.PurchaseReceiptLine l
     JOIN dbo.Medicine m ON m.MedicineId = l.MedicineId
     JOIN dbo.MedicineBatch b ON b.BatchId = l.BatchId
     WHERE l.ReceiptId = @id
     ORDER BY m.MedicineName`,
    { id: receiptId }
  )

  return {
    ...mapReceipt(header),
    lines: lines.map(mapReceiptLine),
  }
}

export async function create(data, employeeId) {
  // ====== Validate ngoai transaction ======

  // check supplier
  const supplier = await queryOne(
    'SELECT IsActive FROM dbo.Supplier WHERE SupplierId = @id',
    { id: data.supplierId }
  )
  if (!supplier) {
    throw new AppError(`Nhà cung cấp "${data.supplierId}" không tồn tại`, 400, 'SUPPLIER_NOT_FOUND')
  }
  if (!supplier.IsActive) {
    throw new AppError(`Nhà cung cấp "${data.supplierId}" đã ngừng hoạt động`, 400, 'SUPPLIER_INACTIVE')
  }

  // check tat ca medicine ton tai va active
  for (const line of data.lines) {
    const med = await queryOne(
      'SELECT IsActive FROM dbo.Medicine WHERE MedicineId = @id',
      { id: line.medicineId }
    )
    if (!med) {
      throw new AppError(`Thuốc "${line.medicineId}" không tồn tại`, 400, 'MEDICINE_NOT_FOUND')
    }
    if (!med.IsActive) {
      throw new AppError(`Thuốc "${line.medicineId}" đã ngừng kinh doanh`, 400, 'MEDICINE_INACTIVE')
    }

    // check manufacturer cua line neu co
    if (line.manufacturerId) {
      const mf = await queryOne(
        'SELECT 1 AS x FROM dbo.Manufacturer WHERE ManufacturerId = @id',
        { id: line.manufacturerId }
      )
      if (!mf) {
        throw new AppError(`Hãng sản xuất "${line.manufacturerId}" không tồn tại`, 400, 'MANUFACTURER_NOT_FOUND')
      }
    }
  }

  // xac dinh ngay nhap
  const receiptDate = data.receiptDate ? new Date(data.receiptDate) : new Date()
  const importDateStr = receiptDate.toISOString().slice(0, 10) // YYYY-MM-DD

  // check ExpiryDate cua tung lo > ImportDate
  for (const line of data.lines) {
    if (line.expiryDate <= importDateStr) {
      throw new AppError(
        `Hạn sử dụng (${line.expiryDate}) phải sau ngày nhập (${importDateStr})`,
        400,
        'INVALID_EXPIRY_DATE'
      )
    }
  }

  // ====== Transaction ======
  const newReceiptId = await withTransaction(async ({ tx, txOne }) => {
    // sinh ReceiptId
    const maxRow = await txOne('SELECT MAX(ReceiptId) AS MaxId FROM dbo.PurchaseReceipt')
    const receiptId = genNextReceiptId(maxRow?.MaxId)

    // 1. insert header (TotalAmount tam thoi = 0)
    await tx(
      `INSERT INTO dbo.PurchaseReceipt
         (ReceiptId, SupplierId, EmployeeId, ReceiptDate, TotalAmount, Status, Note)
       VALUES
         (@id, @supplierId, @employeeId, @date, 0, N'COMPLETED', @note)`,
      {
        id: receiptId,
        supplierId: data.supplierId,
        employeeId,
        date: receiptDate,
        note: data.note || null,
      }
    )

    // 2. insert tung dong (kem tao lo moi)
    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i]
      const batchId = genBatchId(receiptId, i)
      const lineTotal = line.quantity * line.importPrice

      // 2a. tao lo moi
      await tx(
        `INSERT INTO dbo.MedicineBatch
           (BatchId, MedicineId, ImportPrice, ImportDate, ExpiryDate,
            InitialQty, CurrentQty, SupplierId, ManufacturerId, Note)
         VALUES
           (@batchId, @medicineId, @importPrice, @importDate, @expiryDate,
            @qty, @qty, @supplierId, @manufacturerId, NULL)`,
        {
          batchId,
          medicineId: line.medicineId,
          importPrice: line.importPrice,
          importDate: importDateStr,
          expiryDate: line.expiryDate,
          qty: line.quantity,
          supplierId: data.supplierId,
          manufacturerId: line.manufacturerId || null,
        }
      )

      // 2b. tao dong phieu nhap
      await tx(
        `INSERT INTO dbo.PurchaseReceiptLine
           (LineId, ReceiptId, MedicineId, BatchId, Quantity, UnitCost, LineTotal)
         VALUES
           (CONVERT(varchar(40), NEWID()), @receiptId, @medicineId, @batchId, @qty, @unitCost, @lineTotal)`,
        {
          receiptId,
          medicineId: line.medicineId,
          batchId,
          qty: line.quantity,
          unitCost: line.importPrice,
          lineTotal,
        }
      )
    }

    // 3. cap nhat TotalAmount = SUM(LineTotal)
    await tx(
      `UPDATE dbo.PurchaseReceipt
       SET TotalAmount = (SELECT SUM(LineTotal) FROM dbo.PurchaseReceiptLine WHERE ReceiptId = @id)
       WHERE ReceiptId = @id`,
      { id: receiptId }
    )

    return receiptId
  })

  // sau commit: nhap hang vao -> ton tang -> co the resolve LOW_STOCK alert
  try {
    const uniqueMedIds = [...new Set(data.lines.map(l => l.medicineId))]
    for (const id of uniqueMedIds) {
      alertService.checkAndCreateLowStockAlert(id).catch(() => {})
    }
  } catch (err) {
    console.error('Loi check alert sau nhap hang:', err.message)
  }

  return await getById(newReceiptId)
}

export async function cancel(receiptId) {
  const receipt = await queryOne(
    'SELECT Status FROM dbo.PurchaseReceipt WHERE ReceiptId = @id',
    { id: receiptId }
  )
  if (!receipt) {
    throw new AppError('Không tìm thấy phiếu nhập', 404, 'RECEIPT_NOT_FOUND')
  }
  if (receipt.Status === 'CANCELLED') {
    throw new AppError('Phiếu nhập đã bị hủy trước đó', 400, 'ALREADY_CANCELLED')
  }

  // kiem tra cac lo trong phieu chua bi ban hoac huy
  const sold = await queryOne(
    `SELECT COUNT(*) AS cnt
     FROM dbo.PurchaseReceiptLine rl
     JOIN dbo.SalesInvoiceLine il ON il.BatchId = rl.BatchId
     WHERE rl.ReceiptId = @id`,
    { id: receiptId }
  )
  if (sold.cnt > 0) {
    throw new AppError(
      'Không thể hủy phiếu vì có lô đã được bán ra',
      400,
      'BATCH_ALREADY_SOLD'
    )
  }

  const disposed = await queryOne(
    `SELECT COUNT(*) AS cnt
     FROM dbo.PurchaseReceiptLine rl
     JOIN dbo.StockWriteOffLine wl ON wl.BatchId = rl.BatchId
     WHERE rl.ReceiptId = @id`,
    { id: receiptId }
  )
  if (disposed.cnt > 0) {
    throw new AppError(
      'Không thể hủy phiếu vì có lô đã được hủy hàng',
      400,
      'BATCH_ALREADY_DISPOSED'
    )
  }

  // transaction: dua CurrentQty cac lo ve 0 va set status = CANCELLED
  await withTransaction(async ({ tx }) => {
    await tx(
      `UPDATE dbo.MedicineBatch
       SET CurrentQty = 0
       WHERE BatchId IN (
         SELECT BatchId FROM dbo.PurchaseReceiptLine WHERE ReceiptId = @id
       )`,
      { id: receiptId }
    )

    await tx(
      `UPDATE dbo.PurchaseReceipt SET Status = N'CANCELLED' WHERE ReceiptId = @id`,
      { id: receiptId }
    )
  })
}
