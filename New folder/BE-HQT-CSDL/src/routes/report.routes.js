import { Router } from 'express'
import * as ctrl from '../controllers/report.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

// tat ca bao cao chi ADMIN xem duoc
router.use(authenticate, requireRole('ADMIN'))

router.get('/profit-loss', ctrl.getProfitLoss)
router.get('/revenue', ctrl.getRevenue)
router.get('/top-medicines', ctrl.getTopMedicines)
router.get('/inventory-value', ctrl.getInventoryValue)
router.get('/disposal-cost', ctrl.getDisposalCost)

export default router
