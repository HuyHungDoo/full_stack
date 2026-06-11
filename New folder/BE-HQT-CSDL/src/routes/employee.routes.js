import { Router } from 'express'
import * as employeeController from '../controllers/employee.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

// tat ca routes deu can dang nhap
router.use(authenticate)

// doi mat khau: ai cung doi duoc cua minh, ADMIN doi cua nguoi khac
// dat o tren cung de khong bi requireRole('ADMIN') chan
router.patch('/:id/password', employeeController.changePassword)

// cac thao tac CRUD con lai chi ADMIN
router.use(requireRole('ADMIN'))

router.get('/', employeeController.getAll)
router.get('/:id', employeeController.getById)
router.post('/', employeeController.create)
router.patch('/:id', employeeController.update)
router.delete('/:id', employeeController.deactivate)

export default router
