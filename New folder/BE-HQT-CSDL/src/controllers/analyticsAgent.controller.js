import { z } from 'zod'
import * as analyticsService from '../services/analyticsAgent.service.js'
import { chatWithAnalyticsAgent as runAnalyticsChatAgent } from '../services/analyticsChatAgent.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

const dateField = z.string().regex(dateRegex, 'Ngay phai co dang YYYY-MM-DD')
const boolField = z.preprocess(value => {
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}, z.boolean())

const rangeSchema = z.object({
  startDate: dateField,
  endDate: dateField,
})

const salesSummarySchema = rangeSchema.extend({
  groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
  compareWith: z.enum(['prev_period', 'prev_year']).optional().default('prev_period'),
})

const salesByHourSchema = z.object({
  date: dateField,
  aggregateDays: z.coerce.number().int().min(1).max(365).optional().default(1),
})

const salesTrendSchema = rangeSchema.extend({
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional().default('monthly'),
  metric: z.enum(['revenue', 'orders', 'aov']).optional().default('revenue'),
})

const topProductsSchema = rangeSchema.extend({
  sortBy: z.enum(['revenue', 'quantity', 'profit']).optional().default('profit'),
  categoryName: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
})

const categoryRevenueSchema = rangeSchema.extend({
  compareWith: z.enum(['prev_period']).optional().default('prev_period'),
})

const topCustomersSchema = rangeSchema.extend({
  sortBy: z.enum(['revenue', 'frequency', 'aov']).optional().default('revenue'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

const rfmSegmentsSchema = z.object({
  asOfDate: dateField.optional().default(() => new Date().toISOString().slice(0, 10)),
  segments: z.string().optional(),
  includeList: boolField.optional().default(false),
})

const lowStockAlertsSchema = z.object({
  categoryName: z.string().min(1).optional(),
  supplierKey: z.string().min(1).optional(),
})

const inventoryValueSchema = z.object({
  breakdown: z.enum(['category', 'supplier', 'none']).optional().default('none'),
})

const stockLossSummarySchema = rangeSchema.extend({
  groupBy: z.enum(['product', 'category', 'month']).optional().default('month'),
})

const forecastRevenueSchema = z.object({
  forecastDays: z.coerce.number().int().min(1).max(365).optional().default(30),
  model: z.enum(['linear', 'seasonal']).optional().default('linear'),
})

const matrixDistributionSchema = rangeSchema.extend({
  includeInventoryValue: boolField.optional().default(true),
})

const matrixProductsSchema = z.object({
  abcClass: z.enum(['A', 'B', 'C']),
  xyzClass: z.enum(['X', 'Y', 'Z']),
  startDate: dateField.optional(),
  endDate: dateField.optional(),
  includeInventory: boolField.optional().default(true),
  sortBy: z.enum(['revenue', 'inventoryValue', 'daysOfStock', 'currentQty']).optional().default('revenue'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
}).refine(data => (!data.startDate && !data.endDate) || (data.startDate && data.endDate), {
  message: 'startDate va endDate phai duoc truyen cung nhau',
})

const chatSchema = z.object({
  message: z.string().trim().min(1, 'message la bat buoc').max(2000, 'message qua dai'),
})

function validate(schema, payload) {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

function checkRange(startDate, endDate) {
  if (new Date(startDate) > new Date(endDate)) {
    throw new AppError('startDate phai nho hon hoac bang endDate', 400, 'INVALID_DATE_RANGE')
  }
}

function endpoint(schema, serviceFn, range = true) {
  return catchAsync(async (req, res) => {
    const params = validate(schema, req.query)
    if (range || (params.startDate && params.endDate)) checkRange(params.startDate, params.endDate)
    const data = await serviceFn(params)
    res.json({ success: true, data })
  })
}

export const getSalesSummary = endpoint(salesSummarySchema, analyticsService.getSalesSummary)
export const getSalesByHour = endpoint(salesByHourSchema, analyticsService.getSalesByHour, false)
export const getSalesTrend = endpoint(salesTrendSchema, analyticsService.getSalesTrend)
export const getTopProducts = endpoint(topProductsSchema, analyticsService.getTopProducts)
export const getCategoryRevenue = endpoint(categoryRevenueSchema, analyticsService.getCategoryRevenue)
export const getCustomerOverview = endpoint(rangeSchema, analyticsService.getCustomerOverview)
export const getTopCustomers = endpoint(topCustomersSchema, analyticsService.getTopCustomers)
export const getRFMSegments = endpoint(rfmSegmentsSchema, analyticsService.getRFMSegments, false)
export const getLowStockAlerts = endpoint(lowStockAlertsSchema, analyticsService.getLowStockAlerts, false)
export const getInventoryValue = endpoint(inventoryValueSchema, analyticsService.getInventoryValue, false)
export const getStockLossSummary = endpoint(stockLossSummarySchema, analyticsService.getStockLossSummary)
export const forecastRevenue = endpoint(forecastRevenueSchema, analyticsService.forecastRevenue, false)
export const getMatrixDistribution = endpoint(matrixDistributionSchema, analyticsService.getMatrixDistribution)
export const getProductsByMatrix = endpoint(matrixProductsSchema, analyticsService.getProductsByMatrix, false)

export const chatWithAnalyticsAgent = catchAsync(async (req, res) => {
  const params = validate(chatSchema, req.body)
  const data = await runAnalyticsChatAgent(params)
  res.json({ success: true, data })
})
