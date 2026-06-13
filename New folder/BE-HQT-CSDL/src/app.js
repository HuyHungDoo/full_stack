import express from 'express'
import cors from 'cors'

import authRoutes from './routes/auth.routes.js'
import employeeRoutes from './routes/employee.routes.js'
import masterDataRoutes from './routes/masterData.routes.js'
import medicineRoutes from './routes/medicine.routes.js'
import purchaseReceiptRoutes from './routes/purchaseReceipt.routes.js'
import customerRoutes from './routes/customer.routes.js'
import salesInvoiceRoutes from './routes/salesInvoice.routes.js'
import salesReturnRoutes from './routes/salesReturn.routes.js'
import stockWriteOffRoutes from './routes/stockWriteOff.routes.js'
import alertRoutes from './routes/alert.routes.js'
import reportRoutes from './routes/report.routes.js'
import analyticsAgentRoutes from './routes/analyticsAgent.routes.js'

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()

app.use(express.json())
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))

app.get('/', (req, res) => {
  res.json({ success: true, message: 'BACKEND-HQT API is running' })
})

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/employees', employeeRoutes)
app.use('/api', masterDataRoutes)
app.use('/api/medicines', medicineRoutes)
app.use('/api/purchase-receipts', purchaseReceiptRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/sales-invoices', salesInvoiceRoutes)
app.use('/api/sales-returns', salesReturnRoutes)
app.use('/api/stock-writeoffs', stockWriteOffRoutes)
app.use('/api', alertRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/analytics-agent', analyticsAgentRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
