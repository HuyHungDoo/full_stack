import { Router } from 'express'
import * as ctrl from '../controllers/alert.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(authenticate)

// ============================================================
// ALERTS
// ============================================================
router.get('/alerts', ctrl.getAlerts)
router.get('/alerts/:id', ctrl.getAlertById)
router.patch('/alerts/:id/resolve', requireRole('ADMIN'), ctrl.resolveAlert)
router.patch('/alerts/:id/reject', requireRole('ADMIN'), ctrl.rejectAlert)

// ============================================================
// NOTIFICATIONS
// /read-all phai dat TRUOC /:id/read de Express khong nham
// ============================================================
router.get('/notifications', ctrl.getNotifications)
router.patch('/notifications/read-all', ctrl.markAllRead)
router.patch('/notifications/:id/read', ctrl.markRead)

export default router
