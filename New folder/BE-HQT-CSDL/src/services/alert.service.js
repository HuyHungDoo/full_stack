import crypto from 'crypto'
import { query, queryOne } from '../config/db.js'
import AppError from '../utils/AppError.js'

// ============================================================
// helpers
// ============================================================
function severityOf(alertType, stockSnapshot) {
  if (alertType === 'EXPIRED') return 'CRITICAL'
  if (alertType === 'LOW_STOCK' && stockSnapshot === 0) return 'CRITICAL'
  return 'WARNING'
}

function mapAlert(row) {
  if (!row) return null
  return {
    alertId: row.AlertId,
    alertType: row.AlertType,
    severity: row.Severity || severityOf(row.AlertType, row.StockSnapshot),
    status: row.Status,
    medicineId: row.MedicineId,
    medicineName: row.MedicineName,
    stockSnapshot: row.StockSnapshot,
    minStock: row.MinStock,
    note: row.Note,
    createdBy: row.CreatedBy,
    createdAt: row.CreatedAt,
    resolvedBy: row.ResolvedBy,
    resolvedAt: row.ResolvedAt,
    resolutionType: row.ResolutionType,
    resolutionNote: row.ResolutionNote,
  }
}

function mapNotification(row) {
  return {
    notificationId: row.NotificationId,
    message: row.Message,
    isRead: !!row.IsRead,
    createdAt: row.CreatedAt,
  }
}

function fmtDate(d) {
  if (!d) return ''
  if (d instanceof Date) return d.toISOString().split('T')[0]
  return String(d).split('T')[0]
}

function buildAlertWhere(filters = {}, requestUser) {
  const conditions = []
  const params = {}

  let status = filters.status
  if (requestUser?.roleId === 'STAFF') {
    status = 'PENDING'
  } else if (!status) {
    status = 'PENDING'
  }

  if (status && status !== 'ALL') {
    conditions.push('a.Status = @status')
    params.status = status
  }
  if (filters.alertType) {
    conditions.push('a.AlertType = @alertType')
    params.alertType = filters.alertType
  }
  if (filters.medicineId) {
    conditions.push('a.MedicineId = @medicineId')
    params.medicineId = filters.medicineId
  }

  return {
    where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '',
    params,
  }
}

const ALERT_SELECT = `
  SELECT a.AlertId, a.AlertType, a.Status, a.StockSnapshot, a.MinStock, a.Note,
         a.MedicineId, a.CreatedAt, a.ResolvedAt, a.ResolvedBy, a.CreatedBy,
         a.ResolutionType, a.ResolutionNote,
         m.MedicineName,
         CASE
           WHEN a.AlertType = 'EXPIRED' THEN 'CRITICAL'
           WHEN a.AlertType = 'LOW_STOCK' AND a.StockSnapshot = 0 THEN 'CRITICAL'
           ELSE 'WARNING'
         END AS Severity
  FROM dbo.InventoryAlert a
  JOIN dbo.Medicine m ON m.MedicineId = a.MedicineId
`

const ALERT_ORDER = `
  ORDER BY
    CASE
      WHEN a.AlertType = 'EXPIRED' THEN 1
      WHEN a.AlertType = 'LOW_STOCK' AND a.StockSnapshot = 0 THEN 1
      ELSE 2
    END,
    a.CreatedAt DESC
`

function currentStockSql(alias = 'm') {
  return `ISNULL((
    SELECT SUM(b.CurrentQty)
    FROM dbo.MedicineBatch b
    WHERE b.MedicineId = ${alias}.MedicineId
      AND b.ExpiryDate >= CAST(GETDATE() AS DATE)
  ), 0)`
}

export async function getAlertSummary(filters = {}, requestUser) {
  const { where, params } = buildAlertWhere(filters, requestUser)
  const row = await queryOne(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN a.AlertType = 'LOW_STOCK' THEN 1 ELSE 0 END) AS lowStock,
       SUM(CASE WHEN a.AlertType = 'NEAR_EXPIRY' THEN 1 ELSE 0 END) AS nearExpiry,
       SUM(CASE WHEN a.AlertType = 'EXPIRED' THEN 1 ELSE 0 END) AS expired
     FROM dbo.InventoryAlert a
     JOIN dbo.Medicine m ON m.MedicineId = a.MedicineId
     ${where}`,
    params,
  )

  return {
    total: Number(row?.total || 0),
    lowStock: Number(row?.lowStock || 0),
    nearExpiry: Number(row?.nearExpiry || 0),
    expired: Number(row?.expired || 0),
  }
}

// dong bo canh bao PENDING voi ton kho / han dung thuc te
export async function reconcilePendingAlerts() {
  const stockExpr = currentStockSql('m')

  await query(
    `UPDATE a
     SET Status = 'RESOLVED',
         ResolvedAt = SYSUTCDATETIME(),
         ResolutionType = 'ADJUSTMENT',
         ResolutionNote = N'Tự động đóng: tồn kho đã vượt ngưỡng'
     FROM dbo.InventoryAlert a
     INNER JOIN dbo.Medicine m ON m.MedicineId = a.MedicineId
     WHERE a.Status = 'PENDING'
       AND a.AlertType = 'LOW_STOCK'
       AND ${stockExpr} > m.MinStock`,
  )

  await query(
    `UPDATE a
     SET Status = 'RESOLVED',
         ResolvedAt = SYSUTCDATETIME(),
         ResolutionType = 'ADJUSTMENT',
         ResolutionNote = N'Tự động đóng: không còn lô phù hợp'
     FROM dbo.InventoryAlert a
     WHERE a.Status = 'PENDING'
       AND a.AlertType = 'EXPIRED'
       AND NOT EXISTS (
         SELECT 1
         FROM dbo.MedicineBatch b
         WHERE b.MedicineId = a.MedicineId
           AND b.CurrentQty > 0
           AND b.ExpiryDate < CAST(GETDATE() AS DATE)
       )`,
  )

  await query(
    `UPDATE a
     SET Status = 'RESOLVED',
         ResolvedAt = SYSUTCDATETIME(),
         ResolutionType = 'ADJUSTMENT',
         ResolutionNote = N'Tự động đóng: không còn lô phù hợp'
     FROM dbo.InventoryAlert a
     WHERE a.Status = 'PENDING'
       AND a.AlertType = 'NEAR_EXPIRY'
       AND NOT EXISTS (
         SELECT 1
         FROM dbo.MedicineBatch b
         WHERE b.MedicineId = a.MedicineId
           AND b.CurrentQty > 0
           AND b.ExpiryDate >= CAST(GETDATE() AS DATE)
           AND b.ExpiryDate <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))
       )`,
  )

  await query(
    `INSERT INTO dbo.InventoryAlert
       (AlertId, MedicineId, AlertType, StockSnapshot, MinStock, Note, Status)
     SELECT
       NEWID(),
       m.MedicineId,
       'LOW_STOCK',
       ${stockExpr},
       m.MinStock,
       CONCAT(
         N'Tồn kho ',
         m.MedicineId,
         N' - ',
         m.MedicineName,
         N' chỉ còn ',
         CAST(${stockExpr} AS NVARCHAR(20)),
         N' đơn vị (ngưỡng tối thiểu: ',
         CAST(m.MinStock AS NVARCHAR(20)),
         N')'
       ),
       'PENDING'
     FROM dbo.Medicine m
     WHERE m.IsActive = 1
       AND ${stockExpr} <= m.MinStock
       AND NOT EXISTS (
         SELECT 1
         FROM dbo.InventoryAlert a
         WHERE a.MedicineId = m.MedicineId
           AND a.AlertType = 'LOW_STOCK'
           AND a.Status = 'PENDING'
       )`,
  )

  await checkAndCreateExpiryAlerts()
}

// ============================================================
// ALERTS - API
// ============================================================
export async function getAlerts(filters = {}, requestUser, pagination = null) {
  const { where, params } = buildAlertWhere(filters, requestUser)

  const countRow = await queryOne(
    `SELECT COUNT(*) AS total
     FROM dbo.InventoryAlert a
     JOIN dbo.Medicine m ON m.MedicineId = a.MedicineId
     ${where}`,
    params,
  )

  let sql = `${ALERT_SELECT} ${where} ${ALERT_ORDER}`
  const queryParams = { ...params }

  if (pagination) {
    sql += ' OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY'
    queryParams.offset = pagination.offset
    queryParams.limit = pagination.limit
  }

  const rows = await query(sql, queryParams)
  const summary = await getAlertSummary(filters, requestUser)

  return {
    items: rows.map(mapAlert),
    total: Number(countRow?.total || 0),
    summary,
  }
}

export async function getAlertById(alertId) {
  const row = await queryOne(
    `SELECT a.AlertId, a.AlertType, a.Status, a.StockSnapshot, a.MinStock, a.Note,
            a.MedicineId, a.CreatedAt, a.ResolvedAt, a.ResolvedBy, a.CreatedBy,
            a.ResolutionType, a.ResolutionNote,
            m.MedicineName
     FROM dbo.InventoryAlert a
     JOIN dbo.Medicine m ON m.MedicineId = a.MedicineId
     WHERE a.AlertId = @id`,
    { id: alertId }
  )
  if (!row) {
    throw new AppError('Không tìm thấy cảnh báo', 404, 'ALERT_NOT_FOUND')
  }
  return mapAlert(row)
}

export async function resolveAlert(alertId, employeeId, note) {
  const existing = await queryOne(
    `SELECT Status FROM dbo.InventoryAlert WHERE AlertId = @id`,
    { id: alertId }
  )
  if (!existing) {
    throw new AppError('Không tìm thấy cảnh báo', 404, 'ALERT_NOT_FOUND')
  }
  if (existing.Status !== 'PENDING') {
    throw new AppError('Cảnh báo đã được xử lý', 400, 'ALERT_NOT_PENDING')
  }

  await query(
    `UPDATE dbo.InventoryAlert
     SET Status = 'RESOLVED',
         ResolvedAt = SYSUTCDATETIME(),
         ResolvedBy = @employeeId,
         ResolutionType = 'ADJUSTMENT',
         ResolutionNote = @note
     WHERE AlertId = @id`,
    { id: alertId, employeeId, note: note || null }
  )

  return await getAlertById(alertId)
}

export async function rejectAlert(alertId, employeeId, note) {
  const existing = await queryOne(
    `SELECT Status FROM dbo.InventoryAlert WHERE AlertId = @id`,
    { id: alertId }
  )
  if (!existing) {
    throw new AppError('Không tìm thấy cảnh báo', 404, 'ALERT_NOT_FOUND')
  }
  if (existing.Status !== 'PENDING') {
    throw new AppError('Cảnh báo đã được xử lý', 400, 'ALERT_NOT_PENDING')
  }

  await query(
    `UPDATE dbo.InventoryAlert
     SET Status = 'REJECTED',
         ResolvedAt = SYSUTCDATETIME(),
         ResolvedBy = @employeeId,
         ResolutionType = 'REJECT',
         ResolutionNote = @note
     WHERE AlertId = @id`,
    { id: alertId, employeeId, note: note || null }
  )

  return await getAlertById(alertId)
}

// ============================================================
// HOOKS - auto sinh canh bao (goi tu cac service khac)
// ============================================================

// kiem tra ton thap - goi sau khi ban, tra, huy hang
export async function checkAndCreateLowStockAlert(medicineId) {
  try {
    const med = await queryOne(
      `SELECT m.MedicineId, m.MedicineName, m.MinStock,
              ISNULL((SELECT SUM(b.CurrentQty)
                      FROM dbo.MedicineBatch b
                      WHERE b.MedicineId = m.MedicineId
                        AND b.ExpiryDate >= CAST(GETDATE() AS DATE)), 0) AS CurrentStock
       FROM dbo.Medicine m
       WHERE m.MedicineId = @id`,
      { id: medicineId }
    )
    if (!med) return

    const currentStock = Number(med.CurrentStock) || 0
    const minStock = Number(med.MinStock) || 0

    if (currentStock <= minStock) {
      // co the can canh bao
      const existing = await queryOne(
        `SELECT AlertId FROM dbo.InventoryAlert
         WHERE MedicineId = @id AND AlertType = 'LOW_STOCK' AND Status = 'PENDING'`,
        { id: medicineId }
      )
      if (!existing) {
        const alertId = crypto.randomUUID()
        const note = `Tồn kho ${medicineId} - ${med.MedicineName} chỉ còn ${currentStock} đơn vị (ngưỡng tối thiểu: ${minStock})`
        await query(
          `INSERT INTO dbo.InventoryAlert
             (AlertId, MedicineId, AlertType, StockSnapshot, MinStock, Note, Status)
           VALUES (@alertId, @medicineId, 'LOW_STOCK', @stock, @min, @note, 'PENDING')`,
          { alertId, medicineId, stock: currentStock, min: minStock, note }
        )
        const severity = currentStock === 0 ? 'NGHIÊM TRỌNG' : 'CẢNH BÁO'
        await createNotificationForAdmins(
          `[${severity}] Tồn kho thấp: ${med.MedicineName} còn ${currentStock} đơn vị`
        )
      }
    } else {
      // ton du -> resolve canh bao cu (neu co)
      await query(
        `UPDATE dbo.InventoryAlert
         SET Status = 'RESOLVED', ResolvedAt = SYSUTCDATETIME(), ResolutionType = 'RECEIPT'
         WHERE MedicineId = @id AND AlertType = 'LOW_STOCK' AND Status = 'PENDING'`,
        { id: medicineId }
      )
    }
  } catch (err) {
    console.error('Loi check LOW_STOCK cho', medicineId, ':', err.message)
  }
}

// quet toan bo lo hoac mot medicine cu the
// goi khi GET /api/alerts (option refresh=true) hoac sau huy hang
export async function checkAndCreateExpiryAlerts(medicineId = null) {
  try {
    const params = {}
    let extraWhere = ''
    if (medicineId) {
      extraWhere = ' AND b.MedicineId = @medicineId'
      params.medicineId = medicineId
    }

    const batches = await query(
      `SELECT b.BatchId, b.MedicineId, b.ExpiryDate, b.CurrentQty,
              m.MedicineName, m.MinStock,
              CASE WHEN b.ExpiryDate < CAST(GETDATE() AS DATE) THEN 'EXPIRED'
                   ELSE 'NEAR_EXPIRY' END AS Kind
       FROM dbo.MedicineBatch b
       JOIN dbo.Medicine m ON m.MedicineId = b.MedicineId
       WHERE b.CurrentQty > 0
         AND b.ExpiryDate <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))
         ${extraWhere}`,
      params
    )

    // gop theo (MedicineId, Kind)
    const groups = new Map()
    for (const b of batches) {
      const key = `${b.MedicineId}|${b.Kind}`
      if (!groups.has(key)) {
        groups.set(key, {
          medicineId: b.MedicineId,
          medicineName: b.MedicineName,
          minStock: b.MinStock,
          kind: b.Kind,
          batches: [],
        })
      }
      groups.get(key).batches.push(b)
    }

    // tao alert cho moi nhom neu chua co
    for (const g of groups.values()) {
      const existing = await queryOne(
        `SELECT AlertId FROM dbo.InventoryAlert
         WHERE MedicineId = @id AND AlertType = @type AND Status = 'PENDING'`,
        { id: g.medicineId, type: g.kind }
      )
      if (existing) continue

      const batchList = g.batches
        .map(b => `${b.BatchId} (HSD ${fmtDate(b.ExpiryDate)}, tồn ${b.CurrentQty})`)
        .join('; ')
      const note = g.kind === 'EXPIRED'
        ? `${g.medicineName} có lô đã hết hạn: ${batchList}`
        : `${g.medicineName} có lô sắp hết hạn: ${batchList}`
      const totalQty = g.batches.reduce((s, b) => s + b.CurrentQty, 0)
      const alertId = crypto.randomUUID()

      await query(
        `INSERT INTO dbo.InventoryAlert
           (AlertId, MedicineId, AlertType, StockSnapshot, MinStock, Note, Status)
         VALUES (@alertId, @medicineId, @type, @stock, @min, @note, 'PENDING')`,
        {
          alertId,
          medicineId: g.medicineId,
          type: g.kind,
          stock: totalQty,
          min: g.minStock || 0,
          note: note.length > 500 ? note.substring(0, 497) + '...' : note,
        }
      )

      await createNotificationForAdmins(
        g.kind === 'EXPIRED'
          ? `[NGHIÊM TRỌNG] Lô hết hạn: ${g.medicineName}`
          : `[CẢNH BÁO] Lô sắp hết hạn: ${g.medicineName}`
      )
    }

    // neu medicineId cu the -> resolve cac PENDING alert khong con hop le
    if (medicineId) {
      for (const type of ['NEAR_EXPIRY', 'EXPIRED']) {
        const key = `${medicineId}|${type}`
        if (!groups.has(key)) {
          await query(
            `UPDATE dbo.InventoryAlert
             SET Status = 'RESOLVED', ResolvedAt = SYSUTCDATETIME(), ResolutionType = 'ADJUSTMENT'
             WHERE MedicineId = @id AND AlertType = @type AND Status = 'PENDING'`,
            { id: medicineId, type }
          )
        }
      }
    }
  } catch (err) {
    console.error('Loi check expiry alerts:', err.message)
  }
}

// ============================================================
// NOTIFICATIONS - API
// ============================================================
export async function getNotifications(employeeId) {
  const rows = await query(
    `SELECT NotificationId, Message, IsRead, CreatedAt
     FROM dbo.Notification
     WHERE TargetEmployeeId = @id
     ORDER BY CreatedAt DESC`,
    { id: employeeId }
  )
  const countRow = await queryOne(
    `SELECT COUNT(*) AS Unread FROM dbo.Notification
     WHERE TargetEmployeeId = @id AND IsRead = 0`,
    { id: employeeId }
  )
  return {
    list: rows.map(mapNotification),
    unreadCount: countRow?.Unread || 0,
  }
}

export async function markRead(notificationId, employeeId) {
  const noti = await queryOne(
    `SELECT NotificationId, IsRead FROM dbo.Notification
     WHERE NotificationId = @id AND TargetEmployeeId = @empId`,
    { id: notificationId, empId: employeeId }
  )
  if (!noti) {
    throw new AppError('Không tìm thấy thông báo', 404, 'NOTIFICATION_NOT_FOUND')
  }
  await query(
    `UPDATE dbo.Notification SET IsRead = 1
     WHERE NotificationId = @id AND TargetEmployeeId = @empId`,
    { id: notificationId, empId: employeeId }
  )
  return { notificationId, isRead: true }
}

export async function markAllRead(employeeId) {
  const result = await query(
    `UPDATE dbo.Notification SET IsRead = 1
     WHERE TargetEmployeeId = @id AND IsRead = 0`,
    { id: employeeId }
  )
  return { updated: true }
}

// ============================================================
// internal: tao thong bao cho tat ca ADMIN
// ============================================================
async function createNotificationForAdmins(message) {
  try {
    const admins = await query(
      `SELECT EmployeeId FROM dbo.Employee
       WHERE RoleId = 'ADMIN' AND IsActive = 1`
    )
    for (const a of admins) {
      await query(
        `INSERT INTO dbo.Notification (NotificationId, TargetEmployeeId, Message)
         VALUES (@id, @empId, @msg)`,
        { id: crypto.randomUUID(), empId: a.EmployeeId, msg: message }
      )
    }
  } catch (err) {
    console.error('Loi tao notification:', err.message)
  }
}
