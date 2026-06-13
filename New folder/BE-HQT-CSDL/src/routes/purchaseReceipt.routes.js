import { Router } from 'express'
import * as ctrl from '../controllers/purchaseReceipt.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

// chi ADMIN duoc thao tac nhap hang
router.use(authenticate, requireRole('ADMIN'))

router.get('/', ctrl.getAll)
router.get('/:id', ctrl.getById)
router.post('/', ctrl.create)
router.patch('/:id/cancel', ctrl.cancel)

export default router
