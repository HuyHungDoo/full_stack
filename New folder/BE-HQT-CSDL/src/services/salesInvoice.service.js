import crypto from 'crypto'
import { query, queryOne, withTransaction } from '../config/db.js'
import AppError from '../utils/AppError.js'
import * as customerService from './customer.service.js'
import * as alertService from './alert.service.js'

const WALK_IN_CUSTOMER_ID = 'KH000000'

// ============================================================
// helpers
// ============================================================
function mapInvoice(row) {
  if (!row) return null
  return {
    invoiceId: row.InvoiceId,
    employeeId: row.EmployeeId,
    employeeName: row.EmployeeName,
    customerId: row.CustomerId,
    customerNameSnapshot: row.CustomerNameSnapshot,
    phoneSnapshot: row.PhoneSnapshot,
    invoiceDate: row.InvoiceDate,
    totalAmount: Number(row.TotalAmount),
    grossProfit: row.GrossProfit !== undefined && row.GrossProfit !== null ? Number(row.GrossProfit) : 0,
    status: row.Status,
    note: row.Note,
  }
}

function mapLine(row) {
  return {
    lineId: row.LineId,
    medicineId: row.MedicineId,
    batchId: row.BatchId,
    medicineNameSnapshot: row.MedicineNameSnapshot,
    unitNameSnapshot: row.UnitNameSnapshot,
    quantity: row.Quantity,
    unitPrice: Number(row.UnitPrice),
    lineTotal: Number(row.LineTotal),
    costPriceSnapshot: Number(row.CostPriceSnapshot),
    lineProfit: Number(row.LineTotal) - row.Quantity * Number(row.CostPriceSnapshot),
  }
}

function genNextInvoiceId(maxId) {
  if (!maxId) return 'HD000001'
  const num = parseInt(maxId.slice(2), 10) + 1
  return 'HD' + String(num).padStart(6, '0')
}

// ============================================================
// API
// ============================================================
export async function getAll(filters = {}, requestUser) {
  const conditions = []
  const params = {}

  // STAFF chi xem hoa don cua minh
  if (requestUser?.roleId === 'STAFF') {
    conditions.push('i.EmployeeId = @currentEmpId')
    params.currentEmpId = requestUser.employeeId
  }

  if (filters.from) {
    conditions.push('i.InvoiceDate >= @fromDate')
    params.fromDate = filters.from
  }
  if (filters.to) {
    conditions.push('i.InvoiceDate < DATEADD(day, 1, @toDate)')
    params.toDate = filters.to
  }
  if (filters.status) {
    conditions.push('i.Status = @status')
    params.status = filters.status
  }
  if (filters.customerId) {
    conditions.push('i.CustomerId = @customerId')
    params.customerId = filters.customerId
  }
  if (filters.employeeId) {
    conditions.push('i.EmployeeId = @employeeId')
    params.employeeId = filters.employeeId
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const sql = `
    SELECT i.InvoiceId, i.InvoiceDate, i.TotalAmount, i.Status,
           i.CustomerNameSnapshot, i.PhoneSnapshot, i.Note,
           i.CustomerId, i.EmployeeId,
           e.FullName AS EmployeeName,
           (SELECT ISNULL(SUM(l.LineTotal - l.Quantity * l.CostPriceSnapshot), 0)
            FROM dbo.SalesInvoiceLine l WHERE l.InvoiceId = i.InvoiceId) AS GrossProfit
    FROM dbo.SalesInvoice i
    JOIN dbo.Employee e ON e.EmployeeId = i.EmployeeId
    ${where}
    ORDER BY i.InvoiceDate DESC
  `
  const rows = await query(sql, params)
  return rows.map(mapInvoice)
}

export async function getById(invoiceId, requestUser = null) {
  const header = await queryOne(
    `SELECT i.InvoiceId, i.InvoiceDate, i.TotalAmount, i.Status,
            i.CustomerNameSnapshot, i.PhoneSnapshot, i.Note,
            i.CustomerId, i.EmployeeId,
            e.FullName AS EmployeeName,
            (SELECT ISNULL(SUM(l.LineTotal - l.Quantity * l.CostPriceSnapshot), 0)
             FROM dbo.SalesInvoiceLine l WHERE l.InvoiceId = i.InvoiceId) AS GrossProfit
     FROM dbo.SalesInvoice i
     JOIN dbo.Employee e ON e.EmployeeId = i.EmployeeId
     WHERE i.InvoiceId = @id`,
    { id: invoiceId }
  )
  if (!header) {
    throw new AppError('Không tìm thấy hóa đơn', 404, 'INVOICE_NOT_FOUND')
  }

  // STAFF chi xem hoa don cua minh
  if (requestUser?.roleId === 'STAFF' && header.EmployeeId !== requestUser.employeeId) {
    throw new AppError('Bạn không có quyền xem hóa đơn này', 403, 'FORBIDDEN')
  }

  const lineRows = await query(
    `SELECT LineId, MedicineId, BatchId, MedicineNameSnapshot, UnitNameSnapshot,
            Quantity, UnitPrice, LineTotal, CostPriceSnapshot
     FROM dbo.SalesInvoiceLine
     WHERE InvoiceId = @id
     ORDER BY MedicineNameSnapshot`,
    { id: invoiceId }
  )

  return { ...mapInvoice(header), lines: lineRows.map(mapLine) }
}

// ============================================================
// CREATE - nghiep vu cot loi (FIFO + transaction)
// ============================================================
export async function create(data, employeeId) {
  // pre-check don gian: items khong rong (Zod da check) va khong co medicineId trung
  // -> cho phep trung vi co the user muon them 2 lan cung 1 SP (gop lai cung duoc)
  // -> de gop, ta merge truoc khi xu ly
  const merged = mergeItems(data.items)

  const invoiceId = await withTransaction(async ({ tx, txOne }) => {
    // ---------------- BUOC 1: upsert customer ----------------
    const customerId = await customerService.upsertFromInvoice(
      { tx, txOne },
      {
        customerName: data.customerName,
        phone: data.phone,
        gender: data.gender,
      }
    )

    // ---------------- BUOC 2: sinh InvoiceId ----------------
    const maxRow = await txOne(
      `SELECT MAX(InvoiceId) AS MaxId FROM dbo.SalesInvoice WHERE InvoiceId LIKE 'HD______'`
    )
    const newInvoiceId = genNextInvoiceId(maxRow?.MaxId)

    // ---------------- BUOC 3: INSERT header (TotalAmount = 0 tam) ----------------
    const customerNameSnapshot = data.phone
      ? (data.customerName || 'Khách hàng')
      : 'Khách lẻ'

    await tx(
      `INSERT INTO dbo.SalesInvoice
         (InvoiceId, EmployeeId, CustomerId, CustomerNameSnapshot, PhoneSnapshot, TotalAmount, Status, Note)
       VALUES (@invoiceId, @employeeId, @customerId, @customerName, @phone, 0, 'COMPLETED', @note)`,
      {
        invoiceId: newInvoiceId,
        employeeId,
        customerId,
        customerName: customerNameSnapshot,
        phone: data.phone || null,
        note: data.note || null,
      }
    )

    // ---------------- BUOC 4: xu ly tung item ----------------
    // - neu item co batchId -> ban chinh xac lo do (khong FIFO)
    // - neu khong -> FIFO theo HSD gan nhat truoc
    let totalAmount = 0

    for (const item of merged) {
      // 4a. validate medicine
      const med = await txOne(
        `SELECT m.MedicineId, m.MedicineName, m.ListPrice, m.IsActive, u.UnitName
         FROM dbo.Medicine m
         JOIN dbo.Unit u ON u.UnitId = m.UnitId
         WHERE m.MedicineId = @id`,
        { id: item.medicineId }
      )
      if (!med) {
        throw new AppError(`Không tồn tại sản phẩm ${item.medicineId}`, 400, 'MEDICINE_NOT_FOUND')
      }
      if (!med.IsActive) {
        throw new AppError(`Sản phẩm ${med.MedicineName} đã ngừng kinh doanh`, 400, 'MEDICINE_INACTIVE')
      }

      const unitPrice = Number(med.ListPrice)

      // ---------- nhanh 1: co batchId (ban dung lo) ----------
      if (item.batchId) {
        const batch = await txOne(
          `SELECT BatchId, MedicineId, CurrentQty, ImportPrice, ExpiryDate,
                  CASE WHEN ExpiryDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS IsExpired
           FROM dbo.MedicineBatch WITH (UPDLOCK, ROWLOCK)
           WHERE BatchId = @id`,
          { id: item.batchId }
        )
        if (!batch) {
          throw new AppError(`Không tìm thấy lô ${item.batchId}`, 400, 'BATCH_NOT_FOUND')
        }
        if (batch.MedicineId !== item.medicineId) {
          throw new AppError(
            `Lô ${item.batchId} không thuộc sản phẩm ${item.medicineId}`,
            400,
            'BATCH_MEDICINE_MISMATCH'
          )
        }
        if (batch.IsExpired) {
          throw new AppError(
            `Lô ${item.batchId} đã hết hạn, không được phép bán`,
            400,
            'BATCH_EXPIRED'
          )
        }
        if (batch.CurrentQty < item.quantity) {
          throw new AppError(
            `Lô ${item.batchId} không đủ tồn (yêu cầu ${item.quantity}, còn ${batch.CurrentQty})`,
            400,
            'INSUFFICIENT_STOCK'
          )
        }

        const lineId = crypto.randomUUID()
        const lineTotal = item.quantity * unitPrice

        await tx(
          `INSERT INTO dbo.SalesInvoiceLine
             (LineId, InvoiceId, MedicineId, BatchId,
              MedicineNameSnapshot, UnitNameSnapshot,
              Quantity, UnitPrice, LineTotal, CostPriceSnapshot)
           VALUES (@lineId, @invoiceId, @medicineId, @batchId,
                   @medName, @unitName,
                   @qty, @unitPrice, @lineTotal, @costPrice)`,
          {
            lineId,
            invoiceId: newInvoiceId,
            medicineId: item.medicineId,
            batchId: batch.BatchId,
            medName: med.MedicineName,
            unitName: med.UnitName,
            qty: item.quantity,
            unitPrice,
            lineTotal,
            costPrice: Number(batch.ImportPrice),
          }
        )

        await tx(
          `UPDATE dbo.MedicineBatch SET CurrentQty = CurrentQty - @qty WHERE BatchId = @batchId`,
          { qty: item.quantity, batchId: batch.BatchId }
        )

        totalAmount += lineTotal
        continue
      }

      // ---------- nhanh 2: khong co batchId -> FIFO ----------
      const batches = await tx(
        `SELECT BatchId, CurrentQty, ImportPrice
         FROM dbo.MedicineBatch WITH (UPDLOCK, ROWLOCK)
         WHERE MedicineId = @id
           AND CurrentQty > 0
           AND ExpiryDate >= CAST(GETDATE() AS DATE)
         ORDER BY ExpiryDate ASC, BatchId ASC`,
        { id: item.medicineId }
      )

      const totalAvailable = batches.reduce((s, b) => s + b.CurrentQty, 0)
      if (totalAvailable < item.quantity) {
        throw new AppError(
          `Không đủ tồn kho. ${med.MedicineName} yêu cầu ${item.quantity}, hiện có ${totalAvailable}`,
          400,
          'INSUFFICIENT_STOCK'
        )
      }

      let remaining = item.quantity
      for (const b of batches) {
        if (remaining === 0) break
        const taken = Math.min(b.CurrentQty, remaining)
        const lineId = crypto.randomUUID()
        const lineTotal = taken * unitPrice

        await tx(
          `INSERT INTO dbo.SalesInvoiceLine
             (LineId, InvoiceId, MedicineId, BatchId,
              MedicineNameSnapshot, UnitNameSnapshot,
              Quantity, UnitPrice, LineTotal, CostPriceSnapshot)
           VALUES (@lineId, @invoiceId, @medicineId, @batchId,
                   @medName, @unitName,
                   @qty, @unitPrice, @lineTotal, @costPrice)`,
          {
            lineId,
            invoiceId: newInvoiceId,
            medicineId: item.medicineId,
            batchId: b.BatchId,
            medName: med.MedicineName,
            unitName: med.UnitName,
            qty: taken,
            unitPrice,
            lineTotal,
            costPrice: Number(b.ImportPrice),
          }
        )

        await tx(
          `UPDATE dbo.MedicineBatch SET CurrentQty = CurrentQty - @qty WHERE BatchId = @batchId`,
          { qty: taken, batchId: b.BatchId }
        )

        totalAmount += lineTotal
        remaining -= taken
      }
    }

    // ---------------- BUOC 5: update TotalAmount ----------------
    await tx(
      `UPDATE dbo.SalesInvoice SET TotalAmount = @total WHERE InvoiceId = @id`,
      { total: totalAmount, id: newInvoiceId }
    )

    // ---------------- BUOC 6: update TotalSpent (KH khong phai khach le) ----------------
    if (customerId !== WALK_IN_CUSTOMER_ID && totalAmount > 0) {
      await tx(
        `UPDATE dbo.Customer
         SET TotalSpent = TotalSpent + @amount
         WHERE CustomerId = @customerId`,
        { amount: totalAmount, customerId }
      )
    }

    return newInvoiceId
  })

  // ---------------- BUOC 7 (ngoai transaction): check ton thap ----------------
  // fire-and-forget, khong block response
  const uniqueMedIds = [...new Set(data.items.map(i => i.medicineId))]
  for (const id of uniqueMedIds) {
    alertService.checkAndCreateLowStockAlert(id).catch(err => {
      console.error('Loi khi check ton thap cho', id, err.message)
    })
  }

  return await getById(invoiceId)
}

// gop cac dong cung (medicineId, batchId) thanh 1
// - cung medicineId va deu khong co batchId -> gop
// - cung medicineId va cung batchId -> gop
// - khac nhau ve batchId (vd 1 dong co, 1 dong khong) -> KHONG gop
function mergeItems(items) {
  const map = new Map()
  for (const it of items) {
    const key = it.medicineId + '|' + (it.batchId || '')
    const prev = map.get(key)
    if (prev) {
      prev.quantity += it.quantity
    } else {
      map.set(key, {
        medicineId: it.medicineId,
        batchId: it.batchId || null,
        quantity: it.quantity,
      })
    }
  }
  return [...map.values()]
}

// ============================================================
// CANCEL - hoan tat ca ton lo
// ============================================================
export async function cancel(invoiceId) {
  await withTransaction(async ({ tx, txOne }) => {
    const inv = await txOne(
      `SELECT InvoiceId, CustomerId, TotalAmount, Status
       FROM dbo.SalesInvoice WITH (UPDLOCK, ROWLOCK)
       WHERE InvoiceId = @id`,
      { id: invoiceId }
    )
    if (!inv) {
      throw new AppError('Không tìm thấy hóa đơn', 404, 'INVOICE_NOT_FOUND')
    }
    if (inv.Status === 'CANCELLED') {
      throw new AppError('Hóa đơn đã hủy trước đó', 400, 'ALREADY_CANCELLED')
    }
    if (inv.Status === 'RETURNED') {
      throw new AppError('Hóa đơn đã có phiếu trả, không thể hủy', 400, 'ALREADY_RETURNED')
    }
    if (inv.Status !== 'COMPLETED') {
      throw new AppError('Hóa đơn không ở trạng thái hợp lệ để hủy', 400, 'INVALID_STATUS')
    }

    // check khong co phieu tra hoan thanh
    const ret = await txOne(
      `SELECT TOP 1 ReturnId FROM dbo.SalesReturn
       WHERE InvoiceId = @id AND Status = 'COMPLETED'`,
      { id: invoiceId }
    )
    if (ret) {
      throw new AppError('Hóa đơn đã có phiếu trả, không thể hủy', 400, 'HAS_RETURN')
    }

    // hoan ton vao tung lo
    const lines = await tx(
      `SELECT BatchId, Quantity FROM dbo.SalesInvoiceLine WHERE InvoiceId = @id`,
      { id: invoiceId }
    )
    for (const line of lines) {
      await tx(
        `UPDATE dbo.MedicineBatch SET CurrentQty = CurrentQty + @qty WHERE BatchId = @batchId`,
        { qty: line.Quantity, batchId: line.BatchId }
      )
    }

    // tru lai TotalSpent (clamp 0 phong CK constraint)
    if (inv.CustomerId !== WALK_IN_CUSTOMER_ID && Number(inv.TotalAmount) > 0) {
      await tx(
        `UPDATE dbo.Customer
         SET TotalSpent = CASE WHEN TotalSpent >= @amount THEN TotalSpent - @amount ELSE 0 END
         WHERE CustomerId = @customerId`,
        { amount: inv.TotalAmount, customerId: inv.CustomerId }
      )
    }

    // doi status
    await tx(
      `UPDATE dbo.SalesInvoice SET Status = 'CANCELLED' WHERE InvoiceId = @id`,
      { id: invoiceId }
    )
  })

  return await getById(invoiceId)
}
