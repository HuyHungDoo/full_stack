import { Router } from 'express'
import * as ctrl from '../controllers/salesInvoice.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(authenticate)

// STAFF + ADMIN: ban hang, xem danh sach va chi tiet (STAFF chi xem cua minh - check trong service)
router.get('/', ctrl.getAll)
router.get('/:id', ctrl.getById)
router.post('/', ctrl.create)

// chi ADMIN moi duoc huy
router.patch('/:id/cancel', requireRole('ADMIN'), ctrl.cancel)

export default router
