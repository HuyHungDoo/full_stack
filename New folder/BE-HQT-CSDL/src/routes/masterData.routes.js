import { Router } from 'express'
import * as ctrl from '../controllers/masterData.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

// tat ca routes can dang nhap
router.use(authenticate)

// ====== Unit ======
router.get('/units', ctrl.getUnits)
router.post('/units', requireRole('ADMIN'), ctrl.createUnit)

// ====== Category (nhom thuoc) ======
router.get('/categories', ctrl.getCategories)
router.post('/categories', requireRole('ADMIN'), ctrl.createCategory)
router.patch('/categories/:id', requireRole('ADMIN'), ctrl.updateCategory)
router.delete('/categories/:id', requireRole('ADMIN'), ctrl.deleteCategory)

// ====== Supplier (nha cung cap) - chi ADMIN ======
router.get('/suppliers', requireRole('ADMIN'), ctrl.getSuppliers)
router.post('/suppliers', requireRole('ADMIN'), ctrl.createSupplier)
router.patch('/suppliers/:id', requireRole('ADMIN'), ctrl.updateSupplier)
router.delete('/suppliers/:id', requireRole('ADMIN'), ctrl.deactivateSupplier)

// ====== Manufacturer (hang san xuat) ======
router.get('/manufacturers', ctrl.getManufacturers)
router.post('/manufacturers', requireRole('ADMIN'), ctrl.createManufacturer)
router.patch('/manufacturers/:id', requireRole('ADMIN'), ctrl.updateManufacturer)

export default router
