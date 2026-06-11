import crypto from 'crypto'
import { query, queryOne, withTransaction } from '../config/db.js'
import AppError from '../utils/AppError.js'
import * as alertService from './alert.service.js'

// ============================================================
// helpers
// ============================================================
function mapWriteOff(row) {
  if (!row) return null
  return {
    writeOffId: row.WriteOffId,
    employeeId: row.EmployeeId,
    employeeName: row.EmployeeName,
    writeOffDate: row.WriteOffDate,
    totalCost: Number(row.TotalCost),
    reason: row.Reason,
    status: row.Status,
    lineCount: row.LineCount,
  }
}

function mapWriteOffLine(row) {
  return {
    lineId: row.LineId,
    batchId: row.BatchId,
    medicineId: row.MedicineId,
    medicineName: row.MedicineName,
    unitName: row.UnitName,
    quantity: row.Quantity,
    unitCost: Number(row.UnitCost),
    lineCost: Number(row.LineCost),
    reason: row.Reason,
    expiryDate: row.ExpiryDate,
  }
}

function mapExpiringBatch(row) {
  return {
    batchId: row.BatchId,
    medicineId: row.MedicineId,
    medicineName: row.MedicineName,
    unitName: row.UnitName,
    supplierName: row.SupplierName,
    importPrice: Number(row.ImportPrice),
    importDate: row.ImportDate,
    expiryDate: row.ExpiryDate,
    currentQty: row.CurrentQty,
    expiryStatus: row.ExpiryStatus,
    daysUntilExpiry: row.DaysUntilExpiry,
    estimatedLoss: Number(row.EstimatedLoss),
  }
}

function genNextWriteOffId(maxId) {
  if (!maxId) return 'HH000001'
  const num = parseInt(maxId.slice(2), 10) + 1
  return 'HH' + String(num).padStart(6, '0')
}

// ============================================================
// API
// ============================================================
export async function getExpiring(filters = {}) {
  const daysAhead = Number.isFinite(filters.daysAhead) ? filters.daysAhead : 30

  const rows = await query(
    `SELECT b.BatchId, b.MedicineId, b.ImportPrice, b.ImportDate,
            b.ExpiryDate, b.CurrentQty,
            m.MedicineName,
            u.UnitName,
            s.SupplierName,
            CASE WHEN b.ExpiryDate < CAST(GETDATE() AS DATE) THEN 'EXPIRED'
                 ELSE 'NEAR_EXPIRY' END AS ExpiryStatus,
            DATEDIFF(DAY, CAST(GETDATE() AS DATE), b.ExpiryDate) AS DaysUntilExpiry,
            b.CurrentQty * b.ImportPrice AS EstimatedLoss
     FROM dbo.MedicineBatch b
     JOIN dbo.Medicine m ON m.MedicineId = b.MedicineId
     JOIN dbo.Unit u ON u.UnitId = m.UnitId
     LEFT JOIN dbo.Supplier s ON s.SupplierId = b.SupplierId
     WHERE b.CurrentQty > 0
       AND b.ExpiryDate <= DATEADD(DAY, @daysAhead, CAST(GETDATE() AS DATE))
     ORDER BY b.ExpiryDate ASC`,
    { daysAhead }
  )

  return rows.map(mapExpiringBatch)
}

export async function getAll(filters = {}) {
  const conditions = []
  const params = {}

  if (filters.from) {
    conditions.push('w.WriteOffDate >= @fromDate')
    params.fromDate = filters.from
  }
  if (filters.to) {
    conditions.push('w.WriteOffDate < DATEADD(day, 1, @toDate)')
    params.toDate = filters.to
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const sql = `
    SELECT w.WriteOffId, w.WriteOffDate, w.TotalCost, w.Reason, w.Status,
           w.EmployeeId,
           e.FullName AS EmployeeName,
           (SELECT COUNT(*) FROM dbo.StockWriteOffLine WHERE WriteOffId = w.WriteOffId) AS LineCount
    FROM dbo.StockWriteOff w
    JOIN dbo.Employee e ON e.EmployeeId = w.EmployeeId
    ${where}
    ORDER BY w.WriteOffDate DESC
  `
  const rows = await query(sql, params)
  return rows.map(mapWriteOff)
}

export async function getById(writeOffId) {
  const header = await queryOne(
    `SELECT w.WriteOffId, w.WriteOffDate, w.TotalCost, w.Reason, w.Status,
            w.EmployeeId, e.FullName AS EmployeeName
     FROM dbo.StockWriteOff w
     JOIN dbo.Employee e ON e.EmployeeId = w.EmployeeId
     WHERE w.WriteOffId = @id`,
    { id: writeOffId }
  )
  if (!header) {
    throw new AppError('Không tìm thấy phiếu hủy', 404, 'WRITE_OFF_NOT_FOUND')
  }

  const lineRows = await query(
    `SELECT l.LineId, l.BatchId, l.MedicineId, l.Quantity, l.UnitCost, l.LineCost, l.Reason,
            m.MedicineName,
            u.UnitName,
            b.ExpiryDate
     FROM dbo.StockWriteOffLine l
     JOIN dbo.MedicineBatch b ON b.BatchId = l.BatchId
     JOIN dbo.Medicine m ON m.MedicineId = l.MedicineId
     JOIN dbo.Unit u ON u.UnitId = m.UnitId
     WHERE l.WriteOffId = @id
     ORDER BY m.MedicineName`,
    { id: writeOffId }
  )

  return { ...mapWriteOff(header), lines: lineRows.map(mapWriteOffLine) }
}

// ============================================================
// CREATE - huy lo hang
// ============================================================
export async function create(data, employeeId) {
  // gop cac dong cung batchId
  const merged = mergeLines(data.lines)

  const writeOffId = await withTransaction(async ({ tx, txOne }) => {
    // ---------------- BUOC 1: sinh WriteOffId ----------------
    const maxRow = await txOne(
      `SELECT MAX(WriteOffId) AS MaxId FROM dbo.StockWriteOff WHERE WriteOffId LIKE 'HH______'`
    )
    const newWriteOffId = genNextWriteOffId(maxRow?.MaxId)

    // ---------------- BUOC 2: INSERT header ----------------
    await tx(
      `INSERT INTO dbo.StockWriteOff
         (WriteOffId, EmployeeId, TotalCost, Reason, Status)
       VALUES (@writeOffId, @employeeId, 0, @reason, 'COMPLETED')`,
      {
        writeOffId: newWriteOffId,
        employeeId,
        reason: data.reason || null,
      }
    )

    // ---------------- BUOC 3: xu ly tung line ----------------
    let totalCost = 0

    for (const line of merged) {
      // lock + lay batch
      const batch = await txOne(
        `SELECT BatchId, MedicineId, ImportPrice, CurrentQty
         FROM dbo.MedicineBatch WITH (UPDLOCK, ROWLOCK)
         WHERE BatchId = @batchId`,
        { batchId: line.batchId }
      )
      if (!batch) {
        throw new AppError(`Không tìm thấy lô ${line.batchId}`, 404, 'BATCH_NOT_FOUND')
      }
      if (line.quantity > batch.CurrentQty) {
        throw new AppError(
          `Số lượng hủy vượt tồn lô ${line.batchId} (tồn ${batch.CurrentQty}, hủy ${line.quantity})`,
          400,
          'INSUFFICIENT_BATCH_QTY'
        )
      }

      const unitCost = Number(batch.ImportPrice)
      const lineCost = line.quantity * unitCost
      const lineId = crypto.randomUUID()

      await tx(
        `INSERT INTO dbo.StockWriteOffLine
           (LineId, WriteOffId, BatchId, MedicineId, Quantity, UnitCost, LineCost, Reason)
         VALUES (@lineId, @writeOffId, @batchId, @medicineId, @qty, @unitCost, @lineCost, @reason)`,
        {
          lineId,
          writeOffId: newWriteOffId,
          batchId: batch.BatchId,
          medicineId: batch.MedicineId,
          qty: line.quantity,
          unitCost,
          lineCost,
          reason: line.reason || null,
        }
      )

      // giam ton lo
      await tx(
        `UPDATE dbo.MedicineBatch SET CurrentQty = CurrentQty - @qty WHERE BatchId = @batchId`,
        { qty: line.quantity, batchId: batch.BatchId }
      )

      totalCost += lineCost
    }

    // ---------------- BUOC 4: update TotalCost ----------------
    await tx(
      `UPDATE dbo.StockWriteOff SET TotalCost = @total WHERE WriteOffId = @id`,
      { total: totalCost, id: newWriteOffId }
    )

    return newWriteOffId
  })

  // sau commit: check lai expiry alerts + low stock cho cac medicine vua huy
  // huy het lo het han -> resolve NEAR_EXPIRY/EXPIRED alert
  // giam ton co the trigger LOW_STOCK alert moi
  try {
    const meds = await query(
      `SELECT DISTINCT MedicineId FROM dbo.StockWriteOffLine WHERE WriteOffId = @id`,
      { id: writeOffId }
    )
    for (const m of meds) {
      alertService.checkAndCreateExpiryAlerts(m.MedicineId).catch(() => {})
      alertService.checkAndCreateLowStockAlert(m.MedicineId).catch(() => {})
    }
  } catch (err) {
    console.error('Loi check alert sau huy hang:', err.message)
  }

  return await getById(writeOffId)
}

function mergeLines(lines) {
  const map = new Map()
  for (const ln of lines) {
    const prev = map.get(ln.batchId)
    if (prev) {
      prev.quantity += ln.quantity
    } else {
      map.set(ln.batchId, { ...ln })
    }
  }
  return [...map.values()]
}
