import { Router } from 'express'
import * as ctrl from '../controllers/customer.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(authenticate)

// lookup theo SDT - dung khi ban hang (STAFF + ADMIN)
// dat truoc requireRole va truoc /:id de khong bi conflict
router.post('/lookup', ctrl.lookup)

// con lai chi ADMIN
router.use(requireRole('ADMIN'))

router.get('/', ctrl.getAll)
router.get('/:id/invoices', ctrl.getInvoices)
router.get('/:id', ctrl.getById)
router.patch('/:id', ctrl.update)

export default router
