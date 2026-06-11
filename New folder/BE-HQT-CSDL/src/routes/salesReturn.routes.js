import { Router } from 'express'
import * as ctrl from '../controllers/salesReturn.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(authenticate)

// Nhan vien tai quay co the lap phieu tra hang khi khach mang hang den hoan.
router.post('/', requireRole('ADMIN', 'STAFF'), ctrl.create)

// Danh sach/chi tiet phieu tra van gioi han ADMIN de tranh mo rong du lieu tra hang.
router.get('/', requireRole('ADMIN'), ctrl.getAll)
router.get('/:id', requireRole('ADMIN'), ctrl.getById)

export default router
