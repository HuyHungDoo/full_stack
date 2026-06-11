import { Router } from 'express'
import * as ctrl from '../controllers/stockWriteOff.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(authenticate)

// /expiring phai dat TRUOC /:id de Express khong nham
// xem lo het han - bat ky user nao login deu xem duoc (de canh bao tu UI)
router.get('/expiring', ctrl.getExpiring)

// con lai chi ADMIN
router.use(requireRole('ADMIN'))

router.get('/', ctrl.getAll)
router.get('/:id', ctrl.getById)
router.post('/', ctrl.create)

export default router
