import crypto from 'crypto'
import { query, queryOne, withTransaction } from '../config/db.js'
import AppError from '../utils/AppError.js'
import * as alertService from './alert.service.js'

const WALK_IN_CUSTOMER_ID = 'KH000000'

// ============================================================
// helpers
// ============================================================
function mapReturn(row) {
  if (!row) return null
  return {
    returnId: row.ReturnId,
    invoiceId: row.InvoiceId,
    employeeId: row.EmployeeId,
    employeeName: row.EmployeeName,
    returnDate: row.ReturnDate,
    totalRefund: Number(row.TotalRefund),
    reason: row.Reason,
    status: row.Status,
    lineCount: row.LineCount,
  }
}

function mapReturnLine(row) {
  return {
    lineId: row.LineId,
    invoiceLineId: row.InvoiceLineId,
    medicineId: row.MedicineId,
    batchId: row.BatchId,
    medicineNameSnapshot: row.MedicineNameSnapshot,
    unitNameSnapshot: row.UnitNameSnapshot,
    quantity: row.Quantity,
    unitPrice: Number(row.UnitPrice),
    refundAmount: Number(row.RefundAmount),
    reason: row.Reason,
  }
}

function genNextReturnId(maxId) {
  if (!maxId) return 'TR000001'
  const num = parseInt(maxId.slice(2), 10) + 1
  return 'TR' + String(num).padStart(6, '0')
}

// ============================================================
// API
// ============================================================
export async function getAll(filters = {}) {
  const conditions = []
  const params = {}

  if (filters.invoiceId) {
    conditions.push('r.InvoiceId = @invoiceId')
    params.invoiceId = filters.invoiceId
  }
  if (filters.from) {
    conditions.push('r.ReturnDate >= @fromDate')
    params.fromDate = filters.from
  }
  if (filters.to) {
    conditions.push('r.ReturnDate < DATEADD(day, 1, @toDate)')
    params.toDate = filters.to
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const sql = `
    SELECT r.ReturnId, r.ReturnDate, r.TotalRefund, r.Reason, r.Status,
           r.InvoiceId, r.EmployeeId,
           e.FullName AS EmployeeName,
           (SELECT COUNT(*) FROM dbo.SalesReturnLine WHERE ReturnId = r.ReturnId) AS LineCount
    FROM dbo.SalesReturn r
    JOIN dbo.Employee e ON e.EmployeeId = r.EmployeeId
    ${where}
    ORDER BY r.ReturnDate DESC
  `
  const rows = await query(sql, params)
  return rows.map(mapReturn)
}

export async function getById(returnId) {
  const header = await queryOne(
    `SELECT r.ReturnId, r.ReturnDate, r.TotalRefund, r.Reason, r.Status,
            r.InvoiceId, r.EmployeeId,
            e.FullName AS EmployeeName
     FROM dbo.SalesReturn r
     JOIN dbo.Employee e ON e.EmployeeId = r.EmployeeId
     WHERE r.ReturnId = @id`,
    { id: returnId }
  )
  if (!header) {
    throw new AppError('Không tìm thấy phiếu trả', 404, 'RETURN_NOT_FOUND')
  }

  const lineRows = await query(
    `SELECT rl.LineId, rl.InvoiceLineId, rl.Quantity, rl.RefundAmount, rl.Reason,
            il.MedicineNameSnapshot, il.UnitNameSnapshot, il.UnitPrice,
            il.BatchId, il.MedicineId
     FROM dbo.SalesReturnLine rl
     JOIN dbo.SalesInvoiceLine il ON il.LineId = rl.InvoiceLineId
     WHERE rl.ReturnId = @id`,
    { id: returnId }
  )

  return { ...mapReturn(header), lines: lineRows.map(mapReturnLine) }
}

// ============================================================
// CREATE - nghiep vu chinh
// ============================================================
export async function create(data, employeeId) {
  const returnId = await withTransaction(async ({ tx, txOne }) => {
    // ---------------- BUOC 1: validate Invoice ----------------
    const invoice = await txOne(
      `SELECT InvoiceId, CustomerId, Status, TotalAmount
       FROM dbo.SalesInvoice WITH (UPDLOCK, ROWLOCK)
       WHERE InvoiceId = @id`,
      { id: data.invoiceId }
    )
    if (!invoice) {
      throw new AppError('Không tìm thấy hóa đơn', 404, 'INVOICE_NOT_FOUND')
    }
    if (invoice.Status === 'CANCELLED') {
      throw new AppError('Không thể trả hàng của hóa đơn đã hủy', 400, 'INVOICE_CANCELLED')
    }

    // ---------------- BUOC 2: validate tung dong tra ----------------
    // gop cac dong cung invoiceLineId
    const merged = mergeLines(data.lines)
    const validatedLines = []

    for (const line of merged) {
      // 2a. lay invoice line goc
      const invLine = await txOne(
        `SELECT LineId, InvoiceId, MedicineId, BatchId, Quantity, UnitPrice, LineTotal
         FROM dbo.SalesInvoiceLine
         WHERE LineId = @id`,
        { id: line.invoiceLineId }
      )
      if (!invLine) {
        throw new AppError(`Không tìm thấy dòng hóa đơn ${line.invoiceLineId}`, 400, 'INVOICE_LINE_NOT_FOUND')
      }
      if (invLine.InvoiceId !== data.invoiceId) {
        throw new AppError('Dòng hóa đơn không thuộc hóa đơn này', 400, 'LINE_INVOICE_MISMATCH')
      }

      // 2b. tong da tra truoc do
      const prev = await txOne(
        `SELECT ISNULL(SUM(rl.Quantity), 0) AS TotalReturned
         FROM dbo.SalesReturnLine rl
         JOIN dbo.SalesReturn r ON r.ReturnId = rl.ReturnId
         WHERE rl.InvoiceLineId = @id AND r.Status = 'COMPLETED'`,
        { id: line.invoiceLineId }
      )
      const totalReturnedSoFar = prev?.TotalReturned ?? 0

      // 2c. khong duoc vuot
      if (totalReturnedSoFar + line.quantity > invLine.Quantity) {
        throw new AppError(
          `Số lượng trả vượt quá số đã mua (đã trả ${totalReturnedSoFar}, đã mua ${invLine.Quantity})`,
          400,
          'RETURN_QTY_EXCEEDED'
        )
      }

      // 2d. refundAmount <= UnitPrice * quantity
      const maxRefund = Number(invLine.UnitPrice) * line.quantity
      if (line.refundAmount > maxRefund) {
        throw new AppError(
          `Số tiền hoàn vượt quá giá bán (tối đa ${maxRefund})`,
          400,
          'REFUND_AMOUNT_EXCEEDED'
        )
      }

      validatedLines.push({ ...line, batchId: invLine.BatchId, medicineId: invLine.MedicineId })
    }

    // ---------------- BUOC 3: sinh ReturnId ----------------
    const maxRow = await txOne(
      `SELECT MAX(ReturnId) AS MaxId FROM dbo.SalesReturn WHERE ReturnId LIKE 'TR______'`
    )
    const newReturnId = genNextReturnId(maxRow?.MaxId)

    // ---------------- BUOC 4: INSERT SalesReturn header ----------------
    await tx(
      `INSERT INTO dbo.SalesReturn
         (ReturnId, InvoiceId, EmployeeId, TotalRefund, Reason, Status)
       VALUES (@returnId, @invoiceId, @employeeId, 0, @reason, 'COMPLETED')`,
      {
        returnId: newReturnId,
        invoiceId: data.invoiceId,
        employeeId,
        reason: data.reason || null,
      }
    )

    // ---------------- BUOC 5: INSERT lines + hoan ton ve lo goc ----------------
    let totalRefund = 0
    for (const line of validatedLines) {
      const lineId = crypto.randomUUID()

      await tx(
        `INSERT INTO dbo.SalesReturnLine
           (LineId, ReturnId, InvoiceLineId, Quantity, RefundAmount, Reason)
         VALUES (@lineId, @returnId, @invoiceLineId, @qty, @refund, @reason)`,
        {
          lineId,
          returnId: newReturnId,
          invoiceLineId: line.invoiceLineId,
          qty: line.quantity,
          refund: line.refundAmount,
          reason: line.reason || null,
        }
      )

      // hoan ton ve dung lo goc
      await tx(
        `UPDATE dbo.MedicineBatch SET CurrentQty = CurrentQty + @qty WHERE BatchId = @batchId`,
        { qty: line.quantity, batchId: line.batchId }
      )

      totalRefund += line.refundAmount
    }

    // ---------------- BUOC 6: update TotalRefund ----------------
    await tx(
      `UPDATE dbo.SalesReturn SET TotalRefund = @total WHERE ReturnId = @id`,
      { total: totalRefund, id: newReturnId }
    )

    // ---------------- BUOC 7: tru TotalSpent KH ----------------
    if (invoice.CustomerId !== WALK_IN_CUSTOMER_ID && totalRefund > 0) {
      await tx(
        `UPDATE dbo.Customer
         SET TotalSpent = CASE WHEN TotalSpent >= @amount THEN TotalSpent - @amount ELSE 0 END
         WHERE CustomerId = @customerId`,
        { amount: totalRefund, customerId: invoice.CustomerId }
      )
    }

    // ---------------- BUOC 8: kiem tra HD da tra het chua ----------------
    const aggregate = await txOne(
      `SELECT ISNULL(SUM(il.Quantity), 0) AS TotalSold,
              ISNULL(SUM(ar.Qty), 0) AS TotalReturned
       FROM dbo.SalesInvoiceLine il
       LEFT JOIN (
         SELECT rl.InvoiceLineId, SUM(rl.Quantity) AS Qty
         FROM dbo.SalesReturnLine rl
         JOIN dbo.SalesReturn r ON r.ReturnId = rl.ReturnId
         WHERE r.Status = 'COMPLETED'
         GROUP BY rl.InvoiceLineId
       ) ar ON ar.InvoiceLineId = il.LineId
       WHERE il.InvoiceId = @invoiceId`,
      { invoiceId: data.invoiceId }
    )

    if (aggregate && aggregate.TotalReturned >= aggregate.TotalSold && aggregate.TotalSold > 0) {
      await tx(
        `UPDATE dbo.SalesInvoice SET Status = 'RETURNED' WHERE InvoiceId = @id`,
        { id: data.invoiceId }
      )
    }

    return newReturnId
  })

  // sau commit: check lai LOW_STOCK cho cac medicine vua duoc hoan ton
  // (co the resolve canh bao cu vi ton vua tang)
  try {
    const meds = await query(
      `SELECT DISTINCT il.MedicineId
       FROM dbo.SalesReturnLine rl
       JOIN dbo.SalesInvoiceLine il ON il.LineId = rl.InvoiceLineId
       WHERE rl.ReturnId = @id`,
      { id: returnId }
    )
    for (const m of meds) {
      alertService.checkAndCreateLowStockAlert(m.MedicineId).catch(() => {})
    }
  } catch (err) {
    console.error('Loi check alert sau tra hang:', err.message)
  }

  return await getById(returnId)
}

// gop cac dong cung invoiceLineId
function mergeLines(lines) {
  const map = new Map()
  for (const ln of lines) {
    const prev = map.get(ln.invoiceLineId)
    if (prev) {
      prev.quantity += ln.quantity
      prev.refundAmount += ln.refundAmount
      // giu reason dau tien
    } else {
      map.set(ln.invoiceLineId, { ...ln })
    }
  }
  return [...map.values()]
}
