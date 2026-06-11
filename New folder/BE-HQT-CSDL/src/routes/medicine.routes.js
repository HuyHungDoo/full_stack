import { Router } from 'express'
import * as ctrl from '../controllers/medicine.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(authenticate)

// route co duong dan cu the phai dat truoc /:id
router.get('/:id/batches', ctrl.getBatches)
router.get('/:id/stock', ctrl.getStock)
router.get('/:id', ctrl.getById)
router.get('/', ctrl.getAll)

router.post('/', requireRole('ADMIN'), ctrl.create)
router.patch('/:id/deactivate', requireRole('ADMIN'), ctrl.deactivate)
router.patch('/:id', requireRole('ADMIN'), ctrl.update)

export default router
