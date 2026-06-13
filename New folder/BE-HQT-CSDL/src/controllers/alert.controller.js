import { z } from 'zod'
import * as alertService from '../services/alert.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

const resolveSchema = z.object({
  note: z.string().max(500).optional().nullable(),
})

function validate(schema, body) {
  const parsed = schema.safeParse(body || {})
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

// ============================================================
// ALERTS
// ============================================================
export const getAlerts = catchAsync(async (req, res) => {
  // refresh = true -> tu dong quet expiry truoc khi tra list
  if (req.query.refresh === 'true' && req.user?.roleId === 'ADMIN') {
    await alertService.checkAndCreateExpiryAlerts()
  }

  const filters = {
    status: req.query.status,
    alertType: req.query.alertType,
    medicineId: req.query.medicineId,
  }
  const data = await alertService.getAlerts(filters, req.user)
  res.json({ success: true, data })
})

export const getAlertById = catchAsync(async (req, res) => {
  const data = await alertService.getAlertById(req.params.id)
  res.json({ success: true, data })
})

export const resolveAlert = catchAsync(async (req, res) => {
  const { note } = validate(resolveSchema, req.body)
  const data = await alertService.resolveAlert(req.params.id, req.user.employeeId, note)
  res.json({ success: true, data })
})

export const rejectAlert = catchAsync(async (req, res) => {
  const { note } = validate(resolveSchema, req.body)
  const data = await alertService.rejectAlert(req.params.id, req.user.employeeId, note)
  res.json({ success: true, data })
})

// ============================================================
// NOTIFICATIONS
// ============================================================
export const getNotifications = catchAsync(async (req, res) => {
  const { list, unreadCount } = await alertService.getNotifications(req.user.employeeId)
  res.json({ success: true, data: list, meta: { unreadCount } })
})

export const markRead = catchAsync(async (req, res) => {
  const data = await alertService.markRead(req.params.id, req.user.employeeId)
  res.json({ success: true, data })
})

export const markAllRead = catchAsync(async (req, res) => {
  await alertService.markAllRead(req.user.employeeId)
  res.json({ success: true, data: { updated: true } })
})
