import api from './client'
import { formatLocalDate } from '../utils/dateUtils'

const VALID_GROUP_BY = ['day', 'week', 'month']
const VALID_COMPARE_WITH = ['prev_period', 'prev_year']
const VALID_TREND_GRANULARITY = ['daily', 'weekly', 'monthly']
const VALID_TREND_METRIC = ['revenue', 'orders', 'aov']
const VALID_PRODUCT_SORT = ['revenue', 'quantity', 'profit']
const VALID_CUSTOMER_SORT = ['revenue', 'frequency', 'aov']
const VALID_INVENTORY_BREAKDOWN = ['category', 'supplier', 'none']
const VALID_FORECAST_MODEL = ['linear', 'seasonal']
const VALID_STOCK_LOSS_GROUP_BY = ['product', 'category', 'month']
const VALID_ABC_CLASS = ['A', 'B', 'C']
const VALID_XYZ_CLASS = ['X', 'Y', 'Z']
const VALID_MATRIX_SORT_BY = ['revenue', 'inventoryValue', 'daysOfStock', 'currentQty']
const VALID_MATRIX_BREAKDOWN = ['category', 'supplier', 'abcClass', 'xyzClass', 'none']

function requireDateRange(params) {
  if (!params?.startDate || !params?.endDate) {
    throw new Error('startDate and endDate are required')
  }
}

function requireDate(params) {
  if (!params?.date) {
    throw new Error('date is required')
  }
}

function assertOneOf(name, value, allowed) {
  if (value != null && !allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  }
}

function compactParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

async function getAnalytics(endpoint, params = {}) {
  const res = await api.get(`/analytics-agent/${endpoint}`, {
    params: compactParams(params),
  })
  return res.data?.data ?? res.data
}

export async function getAnalyticsMeta() {
  const res = await api.get('/analytics-agent/meta')
  return res.data?.data ?? res.data
}

export async function chatWithAnalyticsAgent({ message } = {}) {
  if (!message?.trim()) {
    throw new Error('message is required')
  }

  const res = await api.post('/analytics-agent/chat', { message: message.trim() })
  return res.data?.data ?? res.data
}

export async function getSalesSummary({
  startDate,
  endDate,
  groupBy = 'day',
  compareWith = 'prev_period',
} = {}) {
  requireDateRange({ startDate, endDate })
  assertOneOf('groupBy', groupBy, VALID_GROUP_BY)
  assertOneOf('compareWith', compareWith, VALID_COMPARE_WITH)

  return getAnalytics('sales-summary', { startDate, endDate, groupBy, compareWith })
}

export async function getMatrixDistribution({
  startDate,
  endDate,
  includeInventoryValue = true,
} = {}) {
  requireDateRange({ startDate, endDate })
 
  return getAnalytics('matrix-distribution', {
    startDate,
    endDate,
    includeInventoryValue: Boolean(includeInventoryValue),
  })
}

export async function getProductsByMatrix({
  abcClass,
  xyzClass,
  startDate,
  endDate,
  includeInventory = true,
  sortBy = 'revenue',
  limit = 50,
} = {}) {
  if (!abcClass) throw new Error('abcClass is required')
  if (!xyzClass) throw new Error('xyzClass is required')
 
  assertOneOf('abcClass', abcClass, VALID_ABC_CLASS)
  assertOneOf('xyzClass', xyzClass, VALID_XYZ_CLASS)
  assertOneOf('sortBy', sortBy, VALID_MATRIX_SORT_BY)
 
  // nếu truyền 1 trong 2 date thì bắt buộc phải có cả 2
  if ((startDate && !endDate) || (!startDate && endDate)) {
    throw new Error('Both startDate and endDate are required when specifying a date range')
  }
 
  return getAnalytics('matrix-products', {
    abcClass,
    xyzClass,
    startDate,
    endDate,
    includeInventory: Boolean(includeInventory),
    sortBy,
    limit: Number(limit || 50),
  })
}

export async function getSalesByHour({ date, aggregateDays = 1 } = {}) {
  requireDate({ date })

  return getAnalytics('sales-by-hour', {
    date,
    aggregateDays: Number(aggregateDays || 1),
  })
}

export async function getSalesTrend({
  startDate,
  endDate,
  granularity = 'monthly',
  metric = 'revenue',
} = {}) {
  requireDateRange({ startDate, endDate })
  assertOneOf('granularity', granularity, VALID_TREND_GRANULARITY)
  assertOneOf('metric', metric, VALID_TREND_METRIC)

  return getAnalytics('sales-trend', { startDate, endDate, granularity, metric })
}

export async function getTopProducts({
  startDate,
  endDate,
  sortBy = 'profit',
  categoryName,
  limit = 10,
} = {}) {
  requireDateRange({ startDate, endDate })
  assertOneOf('sortBy', sortBy, VALID_PRODUCT_SORT)

  return getAnalytics('top-products', {
    startDate,
    endDate,
    sortBy,
    categoryName,
    limit: Number(limit || 10),
  })
}

export async function getCategoryRevenue({
  startDate,
  endDate,
  compareWith = 'prev_period',
} = {}) {
  requireDateRange({ startDate, endDate })
  assertOneOf('compareWith', compareWith, ['prev_period'])

  return getAnalytics('category-revenue', { startDate, endDate, compareWith })
}

export async function getCustomerOverview({ startDate, endDate } = {}) {
  requireDateRange({ startDate, endDate })

  return getAnalytics('customer-overview', { startDate, endDate })
}

export async function getTopCustomers({
  startDate,
  endDate,
  sortBy = 'revenue',
  limit = 20,
} = {}) {
  requireDateRange({ startDate, endDate })
  assertOneOf('sortBy', sortBy, VALID_CUSTOMER_SORT)

  return getAnalytics('top-customers', {
    startDate,
    endDate,
    sortBy,
    limit: Number(limit || 20),
  })
}

export async function getRFMSegments({
  asOfDate = formatLocalDate(),
  segments,
  includeList = false,
} = {}) {
  return getAnalytics('rfm-segments', {
    asOfDate,
    segments: Array.isArray(segments) ? segments.join(',') : segments,
    includeList: Boolean(includeList),
  })
}

export async function getLowStockAlerts({ categoryName, supplierKey } = {}) {
  return getAnalytics('low-stock-alerts', { categoryName, supplierKey })
}

export async function getInventoryValue({ breakdown = 'none' } = {}) {
  assertOneOf('breakdown', breakdown, VALID_INVENTORY_BREAKDOWN)

  return getAnalytics('inventory-value', { breakdown })
}

export async function getStockLossSummary({
  startDate,
  endDate,
  groupBy = 'month',
} = {}) {
  requireDateRange({ startDate, endDate })
  assertOneOf('groupBy', groupBy, VALID_STOCK_LOSS_GROUP_BY)

  return getAnalytics('stock-loss-summary', { startDate, endDate, groupBy })
}

export async function forecastRevenue({
  forecastDays = 30,
  model = 'linear',
} = {}) {
  assertOneOf('model', model, VALID_FORECAST_MODEL)

  return getAnalytics('forecast-revenue', {
    forecastDays: Number(forecastDays || 30),
    model,
  })
}

export const analyticsAgentTools = {
  chatWithAnalyticsAgent,
  getSalesSummary,
  getSalesByHour,
  getSalesTrend,
  getTopProducts,
  getCategoryRevenue,
  getCustomerOverview,
  getTopCustomers,
  getRFMSegments,
  getLowStockAlerts,
  getInventoryValue,
  getStockLossSummary,
  forecastRevenue,
  getMatrixDistribution,
  getProductsByMatrix
}
