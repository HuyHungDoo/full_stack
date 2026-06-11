import { Router } from 'express'
import * as ctrl from '../controllers/analyticsAgent.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

router.use(authenticate, requireRole('ADMIN'))

router.post('/chat', ctrl.chatWithAnalyticsAgent)
router.get('/sales-summary', ctrl.getSalesSummary)
router.get('/matrix-distribution', ctrl.getMatrixDistribution)
router.get('/matrix-products', ctrl.getProductsByMatrix)
router.get('/sales-by-hour', ctrl.getSalesByHour)
router.get('/sales-trend', ctrl.getSalesTrend)
router.get('/top-products', ctrl.getTopProducts)
router.get('/category-revenue', ctrl.getCategoryRevenue)
router.get('/customer-overview', ctrl.getCustomerOverview)
router.get('/top-customers', ctrl.getTopCustomers)
router.get('/rfm-segments', ctrl.getRFMSegments)
router.get('/low-stock-alerts', ctrl.getLowStockAlerts)
router.get('/inventory-value', ctrl.getInventoryValue)
router.get('/stock-loss-summary', ctrl.getStockLossSummary)
router.get('/forecast-revenue', ctrl.forecastRevenue)

export default router
