import { query, queryOne } from '../config/db.js'
import AppError from '../utils/AppError.js'

// ID dac biet danh cho khach le (mua khong de lai SDT)
const WALK_IN_CUSTOMER_ID = 'KH000000'

// ============================================================
// helper
// ============================================================
function mapCustomer(row) {
  if (!row) return null
  return {
    customerId: row.CustomerId,
    customerName: row.CustomerName,
    phone: row.Phone,
    gender: row.Gender,
    totalSpent: Number(row.TotalSpent),
    createdAt: row.CreatedAt,
  }
}

function genNextCustomerId(maxId) {
  if (!maxId) return 'KH000001'
  const num = parseInt(maxId.slice(2), 10) + 1
  return 'KH' + String(num).padStart(6, '0')
}

// ============================================================
// API
// ============================================================
export async function getAll(filters = {}) {
  const conditions = [`CustomerId <> @walkInId`]
  const params = { walkInId: WALK_IN_CUSTOMER_ID }

  if (filters.search) {
    conditions.push(`(CustomerName LIKE N'%' + @search + N'%' OR Phone LIKE '%' + @search + '%')`)
    params.search = filters.search
  }

  const sql = `
    SELECT CustomerId, CustomerName, Phone, Gender, TotalSpent, CreatedAt
    FROM dbo.Customer
    WHERE ${conditions.join(' AND ')}
    ORDER BY TotalSpent DESC
  `
  const rows = await query(sql, params)
  return rows.map(mapCustomer)
}

export async function getById(customerId) {
  if (customerId === WALK_IN_CUSTOMER_ID) {
    throw new AppError('Khách lẻ không có hồ sơ riêng', 400, 'WALK_IN_CUSTOMER')
  }

  const row = await queryOne(
    'SELECT CustomerId, CustomerName, Phone, Gender, TotalSpent, CreatedAt FROM dbo.Customer WHERE CustomerId = @id',
    { id: customerId }
  )
  if (!row) {
    throw new AppError('Không tìm thấy khách hàng', 404, 'CUSTOMER_NOT_FOUND')
  }
  return mapCustomer(row)
}

export async function getInvoices(customerId) {
  // kiem tra customer co ton tai
  const cust = await queryOne(
    'SELECT 1 AS x FROM dbo.Customer WHERE CustomerId = @id',
    { id: customerId }
  )
  if (!cust) {
    throw new AppError('Không tìm thấy khách hàng', 404, 'CUSTOMER_NOT_FOUND')
  }

  const rows = await query(
    `SELECT i.InvoiceId, i.InvoiceDate, i.TotalAmount, i.Status,
            COUNT(l.LineId) AS ItemCount,
            e.FullName AS EmployeeName
     FROM dbo.SalesInvoice i
     JOIN dbo.Employee e ON e.EmployeeId = i.EmployeeId
     LEFT JOIN dbo.SalesInvoiceLine l ON l.InvoiceId = i.InvoiceId
     WHERE i.CustomerId = @id
     GROUP BY i.InvoiceId, i.InvoiceDate, i.TotalAmount, i.Status, e.FullName
     ORDER BY i.InvoiceDate DESC`,
    { id: customerId }
  )

  return rows.map(r => ({
    invoiceId: r.InvoiceId,
    invoiceDate: r.InvoiceDate,
    totalAmount: Number(r.TotalAmount),
    status: r.Status,
    itemCount: r.ItemCount,
    employeeName: r.EmployeeName,
  }))
}

export async function lookup(phone) {
  const row = await queryOne(
    `SELECT CustomerId, CustomerName, Phone, Gender, TotalSpent, CreatedAt
     FROM dbo.Customer
     WHERE Phone = @phone AND CustomerId <> @walkInId`,
    { phone, walkInId: WALK_IN_CUSTOMER_ID }
  )
  return row ? mapCustomer(row) : null
}

export async function update(customerId, data) {
  if (customerId === WALK_IN_CUSTOMER_ID) {
    throw new AppError('Không thể chỉnh sửa khách lẻ', 400, 'CANNOT_UPDATE_WALK_IN')
  }

  const cust = await queryOne(
    'SELECT 1 AS x FROM dbo.Customer WHERE CustomerId = @id',
    { id: customerId }
  )
  if (!cust) {
    throw new AppError('Không tìm thấy khách hàng', 404, 'CUSTOMER_NOT_FOUND')
  }

  const sets = []
  const params = { id: customerId }
  if (data.customerName !== undefined) { sets.push('CustomerName = @name'); params.name = data.customerName }
  if (data.gender !== undefined)       { sets.push('Gender = @gender');     params.gender = data.gender }

  if (sets.length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }

  await query(
    `UPDATE dbo.Customer SET ${sets.join(', ')} WHERE CustomerId = @id`,
    params
  )

  return await getById(customerId)
}

// ============================================================
// Upsert khach hang tu hoa don ban hang
// Dung BOI salesInvoice.service trong transaction
// Truyen { tx, txOne } cua transaction de chay chung context
// ============================================================
export async function upsertFromInvoice({ tx, txOne }, info) {
  // khong co SDT -> khach le
  if (!info.phone) {
    return WALK_IN_CUSTOMER_ID
  }

  // tim KH co SDT nay chua
  const existing = await txOne(
    'SELECT CustomerId, CustomerName FROM dbo.Customer WHERE Phone = @phone',
    { phone: info.phone }
  )

  if (existing) {
    // co roi -> cap nhat ten neu khac
    if (info.customerName && info.customerName !== existing.CustomerName) {
      await tx(
        'UPDATE dbo.Customer SET CustomerName = @name WHERE CustomerId = @id',
        { name: info.customerName, id: existing.CustomerId }
      )
    }
    return existing.CustomerId
  }

  // chua co -> tao moi
  const maxRow = await txOne(
    `SELECT MAX(CustomerId) AS MaxId
     FROM dbo.Customer
     WHERE CustomerId LIKE 'KH______' AND CustomerId <> @walkInId`,
    { walkInId: WALK_IN_CUSTOMER_ID }
  )
  const newId = genNextCustomerId(maxRow?.MaxId)

  await tx(
    `INSERT INTO dbo.Customer (CustomerId, CustomerName, Phone, Gender, TotalSpent)
     VALUES (@id, @name, @phone, @gender, 0)`,
    {
      id: newId,
      name: info.customerName || 'Khách hàng',
      phone: info.phone,
      gender: info.gender || null,
    }
  )

  return newId
}
