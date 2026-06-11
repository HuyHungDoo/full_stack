import Groq from 'groq-sdk'
import AppError from '../utils/AppError.js'
import { queryOne } from '../config/datamartDb.js'
import {
  forecastRevenue,
  getCategoryRevenue,
  getCustomerOverview,
  getInventoryValue,
  getLowStockAlerts,
  getMatrixDistribution,
  getProductsByMatrix,
  getRFMSegments,
  getSalesByHour,
  getSalesSummary,
  getSalesTrend,
  getStockLossSummary,
  getTopCustomers,
  getTopProducts,
} from './analyticsAgent.service.js'

const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'

const toolHandlers = {
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
  getProductsByMatrix,
}

// ─── Tool definitions (unchanged) ────────────────────────────────────────────

const dateProperty = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Date in YYYY-MM-DD format',
}

const rangeProperties = {
  startDate: dateProperty,
  endDate: dateProperty,
}

const analyticsTools = [
  {
    type: 'function',
    function: {
      name: 'getSalesSummary',
      description: 'Summarize revenue, orders, quantity, profit, AOV, and comparison for a date range.',
      parameters: {
        type: 'object',
        properties: {
          ...rangeProperties,
          groupBy: { type: 'string', enum: ['day', 'week', 'month'] },
          compareWith: { type: 'string', enum: ['prev_period', 'prev_year'] },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSalesByHour',
      description: 'Analyze orders and revenue by hour for one date or a recent rolling range ending at that date.',
      parameters: {
        type: 'object',
        properties: {
          date: dateProperty,
          aggregateDays: { type: 'integer', minimum: 1, maximum: 365 },
        },
        required: ['date'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSalesTrend',
      description: 'Return revenue, order, or AOV trend series for a date range.',
      parameters: {
        type: 'object',
        properties: {
          ...rangeProperties,
          granularity: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          metric: { type: 'string', enum: ['revenue', 'orders', 'aov'] },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTopProducts',
      description: 'Find top medicines/products by revenue, quantity, or profit in a date range.',
      parameters: {
        type: 'object',
        properties: {
          ...rangeProperties,
          sortBy: { type: 'string', enum: ['revenue', 'quantity', 'profit'] },
          categoryName: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCategoryRevenue',
      description: 'Compare revenue and profit by product category for a date range.',
      parameters: {
        type: 'object',
        properties: {
          ...rangeProperties,
          compareWith: { type: 'string', enum: ['prev_period'] },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getCustomerOverview',
      description: 'Summarize active customers, new customers, revenue per customer, and orders per customer.',
      parameters: {
        type: 'object',
        properties: rangeProperties,
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTopCustomers',
      description: 'Find top customers by revenue, purchase frequency, or average order value.',
      parameters: {
        type: 'object',
        properties: {
          ...rangeProperties,
          sortBy: { type: 'string', enum: ['revenue', 'frequency', 'aov'] },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRFMSegments',
      description: 'Segment customers by recency, frequency, and monetary value.',
      parameters: {
        type: 'object',
        properties: {
          asOfDate: dateProperty,
          segments: { type: 'string', description: 'Comma-separated segment ids if filtering is needed.' },
          includeList: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLowStockAlerts',
      description: 'List products with low stock using the latest inventory snapshot.',
      parameters: {
        type: 'object',
        properties: {
          categoryName: { type: 'string' },
          supplierKey: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getInventoryValue',
      description: 'Summarize current inventory value and quantity, optionally by category or supplier.',
      parameters: {
        type: 'object',
        properties: {
          breakdown: { type: 'string', enum: ['category', 'supplier', 'none'] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getStockLossSummary',
      description: 'Summarize stock loss quantity and value by product, category, or month.',
      parameters: {
        type: 'object',
        properties: {
          ...rangeProperties,
          groupBy: { type: 'string', enum: ['product', 'category', 'month'] },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forecastRevenue',
      description: 'Forecast revenue for upcoming days from historical sales data.',
      parameters: {
        type: 'object',
        properties: {
          forecastDays: { type: 'integer', minimum: 1, maximum: 365 },
          model: { type: 'string', enum: ['linear', 'seasonal'] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getMatrixDistribution',
      description: 'Summarize ABC/XYZ product matrix distribution for a date range.',
      parameters: {
        type: 'object',
        properties: {
          ...rangeProperties,
          includeInventoryValue: { type: 'boolean' },
        },
        required: ['startDate', 'endDate'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getProductsByMatrix',
      description: 'List products in a specific ABC/XYZ matrix cell.',
      parameters: {
        type: 'object',
        properties: {
          abcClass: { type: 'string', enum: ['A', 'B', 'C'] },
          xyzClass: { type: 'string', enum: ['X', 'Y', 'Z'] },
          ...rangeProperties,
          includeInventory: { type: 'boolean' },
          sortBy: { type: 'string', enum: ['revenue', 'inventoryValue', 'daysOfStock', 'currentQty'] },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
        required: ['abcClass', 'xyzClass'],
        additionalProperties: false,
      },
    },
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new AppError('GROQ_API_KEY chua duoc cau hinh tren backend', 500, 'GROQ_API_KEY_MISSING')
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

function safeJsonParse(value, toolName) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (err) {
    console.warn(`[safeJsonParse] Malformed JSON args for tool "${toolName}":`, value, err.message)
    return null
  }
}

function todayUtcText() {
  return new Date().toISOString().slice(0, 10)
}

function dateAdd(date, days) {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function getLatestSalesDate() {
  const row = await queryOne(
    `SELECT CONVERT(VARCHAR(10), MAX(d.FullDate), 23) AS LatestDate
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey`
  )
  return row?.LatestDate || todayUtcText()
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// ─── Date range parsing ───────────────────────────────────────────────────────

/**
 * Parse cụm thời gian từ câu hỏi tiếng Việt/Anh sang { startDate, endDate }.
 *
 * Ưu tiên:
 *  1. Ngày cụ thể dạng YYYY-MM-DD hoặc DD/MM/YYYY
 *  2. Khoảng cụ thể "từ X đến Y"
 *  3. Cụm tương đối: hôm nay, hôm qua, tuần này, tháng này, quý này, năm này
 *     và các biến thể "trước" / "trước đó"
 *  4. Khoảng N ngày/tuần/tháng: "7 ngày qua", "3 tháng gần đây"
 *  5. Tháng/quý/năm cụ thể: "tháng 3", "tháng 3/2024", "Q1 2024"
 *  6. Fallback: 30 ngày kết thúc tại latestDate
 *
 * @param {string} message  - câu hỏi gốc
 * @param {string} refDate  - mốc "hôm nay" (thường là latestDate từ DB)
 * @returns {{ startDate: string, endDate: string, label: string }}
 */
function parseDateRange(message, refDate) {
  const n = normalizeText(message)
  const ref = new Date(`${refDate}T00:00:00.000Z`)

  // Lấy thứ trong tuần (0=Sun ... 6=Sat), ISO week bắt đầu từ Thứ Hai
  const dayOfWeek = ref.getUTCDay() // 0=CN, 1=T2...6=T7
  const isoDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 0=T2 ... 6=CN

  function fmt(d) {
    return d.toISOString().slice(0, 10)
  }

  function addDays(d, days) {
    const r = new Date(d)
    r.setUTCDate(r.getUTCDate() + days)
    return r
  }

  function startOfMonth(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  }

  function endOfMonth(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  }

  function startOfQuarter(d) {
    const q = Math.floor(d.getUTCMonth() / 3)
    return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1))
  }

  function endOfQuarter(d) {
    const q = Math.floor(d.getUTCMonth() / 3)
    return new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0))
  }

  function startOfYear(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  }

  function endOfYear(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), 11, 31))
  }

  function result(start, end, label) {
    return { startDate: fmt(start), endDate: fmt(end), label }
  }

  // 1. Khoảng cụ thể dạng ISO "từ YYYY-MM-DD đến YYYY-MM-DD"
  const isoRange = n.match(
    /(?:tu|from)?\s*(\d{4}-\d{2}-\d{2})\s*(?:den|to|-|–)\s*(\d{4}-\d{2}-\d{2})/
  )
  if (isoRange) {
    return result(new Date(`${isoRange[1]}T00:00:00.000Z`), new Date(`${isoRange[2]}T00:00:00.000Z`), `${isoRange[1]} → ${isoRange[2]}`)
  }

  // 2. Khoảng cụ thể dạng DD/MM/YYYY
  const dmyRange = n.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:den|to|-|–)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/
  )
  if (dmyRange) {
    const s = new Date(Date.UTC(+dmyRange[3], +dmyRange[2] - 1, +dmyRange[1]))
    const e = new Date(Date.UTC(+dmyRange[6], +dmyRange[5] - 1, +dmyRange[4]))
    return result(s, e, `${dmyRange[1]}/${dmyRange[2]}/${dmyRange[3]} → ${dmyRange[4]}/${dmyRange[5]}/${dmyRange[6]}`)
  }

  // 3. Ngày đơn dạng ISO YYYY-MM-DD
  const isoSingle = message.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoSingle) {
    const d = new Date(`${isoSingle[1]}T00:00:00.000Z`)
    return result(d, d, isoSingle[1])
  }

  // 4. Ngày đơn dạng DD/MM/YYYY hoặc DD/MM
  const dmySingle = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/)
  if (dmySingle) {
    const year = dmySingle[3] ? +dmySingle[3] : ref.getUTCFullYear()
    const d = new Date(Date.UTC(year, +dmySingle[2] - 1, +dmySingle[1]))
    return result(d, d, `${dmySingle[1]}/${dmySingle[2]}/${year}`)
  }

  // 5. "N ngày qua / gần đây / trước"
  const nDays = n.match(/(\d+)\s*ngay\s*(?:qua|gan day|truoc|gan nhat|vua qua)/)
  if (nDays) {
    const days = +nDays[1]
    return result(addDays(ref, -(days - 1)), ref, `${days} ngày qua`)
  }

  // 6. "N tuần qua"
  const nWeeks = n.match(/(\d+)\s*tuan\s*(?:qua|gan day|truoc|gan nhat)/)
  if (nWeeks) {
    const days = +nWeeks[1] * 7
    return result(addDays(ref, -(days - 1)), ref, `${nWeeks[1]} tuần qua`)
  }

  // 7. "N tháng qua / gần đây"
  const nMonths = n.match(/(\d+)\s*thang\s*(?:qua|gan day|truoc|gan nhat|vua qua)/)
  if (nMonths) {
    const months = +nMonths[1]
    const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - months + 1, 1))
    return result(start, ref, `${months} tháng qua`)
  }

  // 8. "hôm nay" / "today"
  if (/\b(hom nay|today|ngay hom nay)\b/.test(n)) {
    return result(ref, ref, 'hôm nay')
  }

  // 9. "hôm qua" / "yesterday"
  if (/\b(hom qua|yesterday|ngay hom qua)\b/.test(n)) {
    const yesterday = addDays(ref, -1)
    return result(yesterday, yesterday, 'hôm qua')
  }

  // 10. "tuần này" / "this week"
  if (/\b(tuan nay|this week|trong tuan)\b/.test(n)) {
    const start = addDays(ref, -isoDay)         // Thứ Hai
    const end = addDays(start, 6)               // Chủ Nhật
    const clampedEnd = end > ref ? ref : end    // không vượt refDate
    return result(start, clampedEnd, 'tuần này')
  }

  // 11. "tuần trước" / "last week"
  if (/\b(tuan truoc|last week|tuan vua qua)\b/.test(n)) {
    const thisMonday = addDays(ref, -isoDay)
    const lastMonday = addDays(thisMonday, -7)
    const lastSunday = addDays(thisMonday, -1)
    return result(lastMonday, lastSunday, 'tuần trước')
  }

  // 12. "tháng này" / "this month"
  if (/\b(thang nay|this month|trong thang)\b/.test(n)) {
    const start = startOfMonth(ref)
    const end = endOfMonth(ref)
    const clampedEnd = end > ref ? ref : end
    return result(start, clampedEnd, 'tháng này')
  }

  // 13. "tháng trước" / "last month"
  if (/\b(thang truoc|last month|thang vua qua)\b/.test(n)) {
    const prevMonth = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1))
    return result(startOfMonth(prevMonth), endOfMonth(prevMonth), 'tháng trước')
  }

  // 14. "quý này" / "this quarter"
  if (/\b(quy nay|this quarter|trong quy)\b/.test(n)) {
    const start = startOfQuarter(ref)
    const end = endOfQuarter(ref)
    const clampedEnd = end > ref ? ref : end
    return result(start, clampedEnd, 'quý này')
  }

  // 15. "quý trước" / "last quarter"
  if (/\b(quy truoc|last quarter|quy vua qua)\b/.test(n)) {
    const prevQStart = new Date(Date.UTC(ref.getUTCFullYear(), Math.floor(ref.getUTCMonth() / 3) * 3 - 3, 1))
    const prevQEnd = endOfQuarter(prevQStart)
    return result(prevQStart, prevQEnd, 'quý trước')
  }

  // 16. "năm này" / "this year"
  if (/\b(nam nay|this year|trong nam)\b/.test(n)) {
    const start = startOfYear(ref)
    const end = endOfYear(ref)
    const clampedEnd = end > ref ? ref : end
    return result(start, clampedEnd, 'năm này')
  }

  // 17. "năm trước" / "last year"
  if (/\b(nam truoc|last year|nam ngoai)\b/.test(n)) {
    const prev = new Date(Date.UTC(ref.getUTCFullYear() - 1, 0, 1))
    return result(startOfYear(prev), endOfYear(prev), 'năm trước')
  }

  // 18a. Khoảng "từ tháng X đến tháng Y" (cùng năm hoặc khác năm)
  const monthRange = n.match(
    /(?:tu\s+)?thang\s*(\d{1,2})(?:\s*(?:nam|\/)\s*(\d{4}))?\s*(?:den|toi|-)\s*thang\s*(\d{1,2})(?:\s*(?:nam|\/)\s*(\d{4}))?/
  )
  if (monthRange) {
    const y1 = +(monthRange[2] || ref.getUTCFullYear())
    const y2 = +(monthRange[4] || y1)
    const dStart = new Date(Date.UTC(y1, +monthRange[1] - 1, 1))
    const dEnd   = new Date(Date.UTC(y2, +monthRange[3] - 1, 1))
    return result(startOfMonth(dStart), endOfMonth(dEnd), `tháng ${monthRange[1]}/${y1} → tháng ${monthRange[3]}/${y2}`)
  }

  // 18. Tháng cụ thể có năm: "tháng 3 năm 2024", "tháng 3/2024", "03/2024"
  const monthYear = n.match(
    /thang\s*(\d{1,2})(?:\s*(?:nam|\/)\s*(\d{4}))?|(\d{1,2})\/(\d{4})/
  )
  if (monthYear) {
    const month = +(monthYear[1] || monthYear[3]) - 1
    const year = +(monthYear[2] || monthYear[4] || ref.getUTCFullYear())
    if (month >= 0 && month <= 11 && year >= 2000) {
      const d = new Date(Date.UTC(year, month, 1))
      return result(startOfMonth(d), endOfMonth(d), `tháng ${month + 1}/${year}`)
    }
  }

  // 19. Quý cụ thể: "Q1 2024", "quý 1 2024", "quý 2/2024"
  const quarterYear = n.match(
    /(?:q|quy)\s*([1-4])(?:\s*(?:nam|\/|\s)\s*(\d{4}))?/
  )
  if (quarterYear) {
    const q = +quarterYear[1] - 1
    const year = +(quarterYear[2] || ref.getUTCFullYear())
    const qStart = new Date(Date.UTC(year, q * 3, 1))
    return result(qStart, endOfQuarter(qStart), `Q${q + 1}/${year}`)
  }

  // 20. Năm cụ thể: "năm 2024", "2024"
  const yearOnly = n.match(/(?:nam\s*)?(?<!\d)(20\d{2})(?!\d)/)
  if (yearOnly) {
    const year = +yearOnly[1]
    const d = new Date(Date.UTC(year, 0, 1))
    return result(startOfYear(d), endOfYear(d), `năm ${year}`)
  }

  // Fallback: 30 ngày kết thúc tại refDate
  return result(addDays(ref, -29), ref, '30 ngày gần nhất')
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function money(value) {
  return Number(value || 0).toLocaleString('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  })
}

function quantity(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function dataLagNote(latestDate, refDate) {
  if (latestDate < refDate) {
    return ` _(Lưu ý: dữ liệu mới nhất trong hệ thống là ${latestDate})_`
  }
  return ''
}

// ─── Summarizers — thay thế toàn bộ các hàm summarize hiện có ───────────────

function summarizeTopProducts(rows, range, sortBy = 'quantity') {
  if (!rows?.length) return `Chưa có dữ liệu trong khoảng ${range.startDate} đến ${range.endDate}.`
  const labelMap = { quantity: 'bán nhiều nhất', revenue: 'doanh thu cao nhất', profit: 'lợi nhuận cao nhất' }
  const lines = rows.slice(0, 10).map((item, i) => {
    const name = item.productName || item.medicineName || item.productKey
    return `${i + 1}. ${name}: ${quantity(item.quantitySold ?? item.quantity)} sp, DT ${money(item.revenue)}, LN ${money(item.profit)}`
  })
  return `Top thuốc ${labelMap[sortBy] || 'bán chạy'} (${range.startDate} → ${range.endDate}):\n${lines.join('\n')}`
}

function summarizeLowStock(rows) {
  if (!rows?.length) return 'Hiện chưa có sản phẩm tồn kho thấp.'
  const lines = rows.slice(0, 10).map((item, i) => {
    const name = item.productName || item.medicineName || item.productKey
    return `${i + 1}. ${name}: còn ${quantity(item.currentQty)}, tối thiểu ${quantity(item.minStock)}, thiếu ${quantity(item.shortageQty)}`
  })
  return `Thuốc cần chú ý tồn kho:\n${lines.join('\n')}`
}

function summarizeMatrixProducts(rows, abcClass, xyzClass, range) {
  if (!rows?.length) return `Chưa có sản phẩm nhóm ${abcClass}${xyzClass} trong khoảng ${range.startDate} → ${range.endDate}.`
  const lines = rows.slice(0, 10).map((item, i) => {
    const name = item.productName || item.medicineName || item.productKey
    const stock = item.currentQty !== undefined ? `, tồn ${quantity(item.currentQty)}` : ''
    return `${i + 1}. ${name}: DT ${money(item.revenue)}, bán ${quantity(item.quantitySold ?? item.quantity)}${stock}`
  })
  return `Sản phẩm nhóm ${abcClass}${xyzClass} (${range.startDate} → ${range.endDate}):\n${lines.join('\n')}`
}

function summarizeSales(data) {
  const revenue = data?.metrics?.revenue
  const orders  = data?.metrics?.orders
  const profit  = data?.metrics?.profit
  const delta   = revenue?.deltaPercent == null
    ? 'chưa đủ dữ liệu kỳ so sánh'
    : `${revenue.deltaPercent >= 0 ? '+' : ''}${revenue.deltaPercent}% so với kỳ trước`
  return `Doanh thu: ${money(revenue?.current)} (${delta}). Số đơn: ${quantity(orders?.current)}. Lợi nhuận: ${money(profit?.current)}.`
}

// BUG-1/2/3: summarizeTrend tính % đúng từ first→last, không lấy từ getSalesSummary
function summarizeTrend(rows, metric) {
  if (!rows?.length) return 'Chưa có dữ liệu xu hướng.'
  const labelMap = { revenue: 'Doanh thu', orders: 'Số đơn', aov: 'AOV' }
  const label    = labelMap[metric] || 'Giá trị'
  const getVal   = r => metric === 'orders' ? r.orders : metric === 'aov' ? r.aov : r.revenue
  const fmtVal   = v => (metric === 'revenue' || metric === 'aov') ? money(v) : quantity(v)

  const firstVal = getVal(rows[0])
  const lastVal  = getVal(rows[rows.length - 1])
  // BUG-2 fix: tính chiều đúng — lastVal so với firstVal
  const pct = firstVal > 0 ? (((lastVal - firstVal) / firstVal) * 100).toFixed(1) : null
  const trend = pct !== null ? ` (${Number(pct) >= 0 ? '+' : ''}${pct}% từ đầu đến cuối kỳ)` : ''

  const lines = rows.map(r => `  ${r.period}: ${fmtVal(getVal(r))}`)
  return `${label} theo kỳ${trend}:\n${lines.join('\n')}`
}

// BUG-8: stock loss theo đúng groupBy
function summarizeStockLoss(rows, groupBy) {
  if (!rows?.length) return 'Chưa có dữ liệu hủy hàng / thất thoát trong kỳ.'
  const labelMap = { category: 'nhóm sản phẩm', product: 'sản phẩm', month: 'tháng' }
  const lines = rows.slice(0, 10).map((r, i) =>
    `${i + 1}. ${r.groupName || r.key}: ${quantity(r.lossQty)} sp, giá trị hủy ${money(r.lossValue)}`
  )
  return `Hủy hàng theo ${labelMap[groupBy] || groupBy}:\n${lines.join('\n')}`
}

// BUG-6: inventory value có breakdown
function summarizeInventoryValue(data) {
  if (!data?.groups?.length) return 'Chưa có dữ liệu giá trị tồn kho.'
  const lines = data.groups.map((g, i) =>
    `${i + 1}. ${g.name}: ${quantity(g.currentQty)} sp, giá trị ${money(g.inventoryValue)} (${g.sharePercent}%)`
  )
  return `Giá trị tồn kho (tổng ${money(data.totalValue)}):\n${lines.join('\n')}`
}

// BUG-5: sort category theo % tăng trưởng
function summarizeCategoryGrowth(rows) {
  if (!rows?.length) return 'Chưa có dữ liệu tăng trưởng danh mục.'
  const sorted = [...rows]
    .filter(r => r.previousRevenue > 0)
    .sort((a, b) => (b.revenueChangePercent ?? -Infinity) - (a.revenueChangePercent ?? -Infinity))
  if (!sorted.length) return 'Chưa đủ dữ liệu kỳ trước để tính tăng trưởng.'
  const lines = sorted.slice(0, 10).map((r, i) => {
    const pct = r.revenueChangePercent != null ? `${r.revenueChangePercent >= 0 ? '+' : ''}${r.revenueChangePercent}%` : 'N/A'
    return `${i + 1}. ${r.categoryName}: ${money(r.revenue)} (${pct}), LN ${money(r.profit)}`
  })
  return `Danh mục tăng trưởng tốt nhất (so với kỳ trước):\n${lines.join('\n')}`
}

// BUG-9/10: format matrix distribution rõ ràng thay vì JSON.stringify
function summarizeMatrixDistribution(rows, range) {
  if (!rows?.length) return 'Chưa có dữ liệu phân bố ma trận ABC/XYZ.'
  const totalRevenue   = rows.reduce((s, r) => s + (r.revenue ?? 0), 0)
  const totalInventory = rows.reduce((s, r) => s + (r.inventoryValue ?? 0), 0)

  const byAbc = {}
  for (const r of rows) {
    if (!byAbc[r.abcClass]) byAbc[r.abcClass] = []
    byAbc[r.abcClass].push(r)
  }

  const lines = []
  for (const abc of ['A', 'B', 'C']) {
    const cells = byAbc[abc] || []
    if (!cells.length) continue
    const abcRev   = cells.reduce((s, r) => s + (r.revenue ?? 0), 0)
    const abcInv   = cells.reduce((s, r) => s + (r.inventoryValue ?? 0), 0)
    const abcCount = cells.reduce((s, r) => s + (r.productCount ?? 0), 0)
    const revShare = totalRevenue > 0 ? ((abcRev / totalRevenue) * 100).toFixed(1) : 0
    lines.push(`Nhóm ${abc} — ${abcCount} SP, ${revShare}% doanh thu, tồn kho ${money(abcInv)}:`)
    for (const cell of cells.sort((a, b) => a.xyzClass.localeCompare(b.xyzClass))) {
      const invShare = totalInventory > 0 ? ((cell.inventoryValue ?? 0) / totalInventory * 100).toFixed(1) : 0
      lines.push(`  ${abc}${cell.xyzClass}: ${cell.productCount} SP — DT ${money(cell.revenue)} (${(cell.revenueShare ?? 0).toFixed(1)}%), tồn kho ${money(cell.inventoryValue ?? 0)} (${invShare}%)`)
    }
  }
  return `Phân bố ma trận ABC/XYZ (${range.startDate} → ${range.endDate}):\n${lines.join('\n')}`
}

// ─── Intent classifier — thay thế toàn bộ hàm classifyIntent ─────────────────

function classifyIntent(normalized) {
  // BUG-1 fix: matrix regex — loại false positive "ay" trong "gần đây"
  // Chỉ chấp nhận [abc][xyz] khi đứng sau keyword hoặc đứng HOÀN TOÀN độc lập (word boundary cả 2 phía, không liền ký tự a-z)
  const rawMatrixCell =
    normalized.match(/(?:nhom|nhóm|groups?|matrix|o)\s+([abc])\s*([xyz])/) ||
    normalized.match(/(?<![a-z])([abc])([xyz])(?![a-z])/)

  // Xác nhận lại: loại các match nằm giữa từ
  const validMatrixCell = (() => {
    if (!rawMatrixCell) return null
    const matched = rawMatrixCell[0].trim()
    const idx     = normalized.indexOf(matched)
    const before  = idx > 0 ? normalized[idx - 1] : ' '
    const after   = normalized[idx + matched.length]
    if (/[a-z0-9]/.test(before) || (after && /[a-z0-9]/.test(after))) return null
    return rawMatrixCell
  })()

  // BUG-9/10 fix: "phân bổ tồn kho theo ABC XYZ" → mentionsMatrixAnalysis
  const mentionsMatrixAnalysis =
    (normalized.includes('ma tran') || normalized.includes('abc') || normalized.includes('xyz')) &&
    (normalized.includes('phan tich') || normalized.includes('phan bo') ||
     normalized.includes('phan phoi') || normalized.includes('thong ke') ||
     normalized.includes('ton kho theo'))

  // BUG-8 fix: detect hủy hàng/thất thoát chính xác
  const isStockLossQuery =
    normalized.includes('huy hang') || normalized.includes('that thoat') ||
    normalized.includes('hang huy') || normalized.includes('hang hong') ||
    normalized.includes('mat hang') ||
    (normalized.includes('huy') && (normalized.includes('thuoc') || normalized.includes('nhom') || normalized.includes('san pham')))

  // BUG-6 fix: tách "giá trị tồn kho" khỏi "tồn kho thấp/sắp hết"
  const mentionsInventoryValue =
    (normalized.includes('gia tri') && normalized.includes('ton kho')) ||
    (normalized.includes('ton kho') && normalized.includes('danh muc')) ||
    (normalized.includes('ton kho') && normalized.includes('theo') && !normalized.includes('abc') && !normalized.includes('xyz'))

  const mentionsLowStock =
    !mentionsInventoryValue && !isStockLossQuery && (
      normalized.includes('sap het') ||
      normalized.includes('het hang') ||
      normalized.includes('can chu y') ||
      (normalized.includes('ton kho') &&
        !normalized.includes('gia tri') &&
        !normalized.includes('theo') &&
        !normalized.includes('abc') &&
        !normalized.includes('xyz'))
    )

  // BUG-3 fix: "khách hàng" không phải product context; "hàng" chỉ tính nếu không trong cụm khác
  const isProductContext = normalized.includes('thuoc') || normalized.includes('san pham') || normalized.includes('sp')
  const hangIsProduct    = normalized.includes('hang') &&
    !normalized.includes('khach hang') && !normalized.includes('huy hang') &&
    !normalized.includes('that thoat') && !normalized.includes('hang hong')

  const isCustomerContext  = normalized.includes('khach hang') || normalized.includes('khach')
  // BUG-3 fix: "mua nhiều nhất" với khách hàng → frequency
  const mentionsFrequency  = isCustomerContext &&
    (normalized.includes('mua nhieu') || normalized.includes('tan suat') || normalized.includes('mua nhieu nhat'))

  // BUG-5 fix: "tăng trưởng" + nhóm/danh mục → getCategoryRevenue
  const isCategoryContext =
    normalized.includes('danh muc') ||
    normalized.includes('nhom thuoc') ||
    normalized.includes('theo nhom') ||
    normalized.includes('nhom hang') ||
    (normalized.includes('tang truong') && (normalized.includes('nhom') || normalized.includes('san pham')))

  // BUG-1/2/3 fix: trend intent — "xu hướng", "theo tháng", "gần đây", "AOV"
  const isTrendQuery =
    normalized.includes('xu huong') ||
    normalized.includes('theo thang') ||
    normalized.includes('theo tuan') ||
    normalized.includes('thay doi') ||
    normalized.includes('bien dong') ||
    normalized.includes('gan day') ||
    (normalized.includes('tu thang') && normalized.includes('den thang')) ||
    normalized.includes('aov')

  const isForecastQuery =
    normalized.includes('du bao') || normalized.includes('forecast') ||
    normalized.includes('du kien') || normalized.includes('co the dat')

  const isRFMQuery =
    normalized.includes('rfm') ||
    (normalized.includes('phan nhom') && normalized.includes('khach')) ||
    (normalized.includes('phan khuc') && normalized.includes('khach'))

  const mentionsTop     = normalized.includes('ban chay') || normalized.includes('top ') ||
    normalized.includes('cao nhat') || normalized.includes('nhieu nhat')
  const mentionsProfit  = normalized.includes('loi nhuan')
  const mentionsRevenue = normalized.includes('doanh thu') || normalized.includes('don hang') || normalized.includes('so don')

  // BUG-4 fix: "bán chạy" mặc định → quantity; chỉ đổi sang revenue/profit khi có từ khóa rõ
  const topProductsSortBy =
    mentionsProfit ? 'profit' :
    (normalized.includes('doanh thu cao') || normalized.includes('revenue')) ? 'revenue' :
    'quantity'

  const isTopProductsQuery =
    !isCategoryContext && !isCustomerContext && !isStockLossQuery && !isTrendQuery &&
    (
      (mentionsTop && (isProductContext || hangIsProduct)) ||
      (normalized.includes('ban chay') && (isProductContext || hangIsProduct))
    )

  const isRevenueSummaryQuery =
    !isForecastQuery && !isTrendQuery &&
    (mentionsRevenue || mentionsProfit) &&
    !isTopProductsQuery && !mentionsMatrixAnalysis &&
    !isCategoryContext && !isStockLossQuery && !isCustomerContext

  return {
    validMatrixCell,
    mentionsMatrixAnalysis,
    mentionsLowStock,
    mentionsInventoryValue,
    isStockLossQuery,
    isTrendQuery,
    isForecastQuery,
    isRFMQuery,
    isTopProductsQuery,
    topProductsSortBy,
    isRevenueSummaryQuery,
    isCategoryContext,
    isCustomerContext,
    mentionsFrequency,
    mentionsRevenue,
    mentionsProfit,
    isProductContext,
  }
}

// ─── Deterministic router — thay thế toàn bộ hàm runDeterministicIntent ──────

async function runDeterministicIntent(message, latestDate) {
  const normalized = normalizeText(message)
  const range      = { startDate: dateAdd(latestDate, -29), endDate: latestDate }

  const explicitDateMention  = /\d{4}-\d{2}-\d{2}/.test(message)
  const dataRelativePhrases  = ['tuan nay', 'thang nay', 'ky nay', 'hom nay', 'ky truoc', 'thang truoc']
  const askedDataRelative    = dataRelativePhrases.some(p => normalized.includes(p))
  const intent               = classifyIntent(normalized)

  // Block câu hỏi dùng thời gian tương đối về dữ liệu đã có (không block forecast)
  if (askedDataRelative && !explicitDateMention && !intent.isForecastQuery) {
    return {
      answer: `Dữ liệu mới nhất trong datamart là ${latestDate}. Tôi có thể báo cáo khoảng ${range.startDate} → ${range.endDate}. Bạn có muốn tiếp tục không?`,
      toolCalls: [],
    }
  }

  // 1. Matrix cell → danh sách sản phẩm
  if (intent.validMatrixCell) {
    const abcClass = intent.validMatrixCell[1].toUpperCase()
    const xyzClass = intent.validMatrixCell[2].toUpperCase()
    const data = await getProductsByMatrix({ abcClass, xyzClass, ...range, includeInventory: true, sortBy: 'revenue', limit: 10 })
    return {
      answer: summarizeMatrixProducts(data, abcClass, xyzClass, range),
      toolCalls: [{ toolName: 'getProductsByMatrix', args: { abcClass, xyzClass, ...range, includeInventory: true }, hasData: data.length > 0 }],
    }
  }

  // 2. Matrix distribution — BUG-9/10 fix
  if (intent.mentionsMatrixAnalysis) {
    const data = await getMatrixDistribution({ ...range, includeInventoryValue: true })
    return {
      answer: summarizeMatrixDistribution(data, range),
      toolCalls: [{ toolName: 'getMatrixDistribution', args: { ...range, includeInventoryValue: true }, hasData: data.length > 0 }],
    }
  }

  // 3. Low stock
  if (intent.mentionsLowStock) {
    const data = await getLowStockAlerts({})
    return {
      answer: summarizeLowStock(data),
      toolCalls: [{ toolName: 'getLowStockAlerts', args: {}, hasData: data.length > 0 }],
    }
  }

  // 4. Inventory value — BUG-6 fix: breakdown đúng theo câu hỏi
  if (intent.mentionsInventoryValue) {
    const breakdown = normalized.includes('danh muc') ? 'category'
      : (normalized.includes('nha cung cap') || normalized.includes('supplier')) ? 'supplier'
      : 'none'
    const data = await getInventoryValue({ breakdown })
    return {
      answer: summarizeInventoryValue(data),
      toolCalls: [{ toolName: 'getInventoryValue', args: { breakdown }, hasData: (data.groups?.length ?? 0) > 0 }],
    }
  }

  // 5. Stock loss — BUG-8 fix: groupBy đúng
  if (intent.isStockLossQuery) {
    const groupBy = (normalized.includes('nhom') || normalized.includes('danh muc')) ? 'category'
      : (normalized.includes('san pham') || normalized.includes('thuoc')) ? 'product'
      : 'month'
    const data = await getStockLossSummary({ ...range, groupBy })
    return {
      answer: summarizeStockLoss(data, groupBy),
      toolCalls: [{ toolName: 'getStockLossSummary', args: { ...range, groupBy }, hasData: data.length > 0 }],
    }
  }

  // 6. RFM
  if (intent.isRFMQuery) {
    const data  = await getRFMSegments({ asOfDate: latestDate, includeList: false })
    const lines = (data.summary || [])
      .sort((a, b) => b.customerCount - a.customerCount)
      .map(s => `• ${s.segment}: ${s.customerCount} KH, doanh thu ${money(s.revenue)}`)
      .join('\n')
    return {
      answer: `Phân nhóm RFM (đến ${latestDate}):\n${lines || 'Chưa có dữ liệu.'}`,
      toolCalls: [{ toolName: 'getRFMSegments', args: { asOfDate: latestDate }, hasData: (data.summary?.length ?? 0) > 0 }],
    }
  }

  // 7. Trend — BUG-1/2/3 fix: route trực tiếp, tính % đúng trong summarizeTrend
  if (intent.isTrendQuery) {
    const metric = normalized.includes('aov') ? 'aov'
      : (normalized.includes('so don') || normalized.includes('don hang')) ? 'orders'
      : 'revenue'
    const granularity = normalized.includes('tuan') ? 'weekly'
      : normalized.includes('ngay') ? 'daily'
      : 'monthly'
    const trendRange = { startDate: dateAdd(latestDate, -179), endDate: latestDate }
    const data = await getSalesTrend({ ...trendRange, granularity, metric })
    return {
      answer: summarizeTrend(data, metric),
      toolCalls: [{ toolName: 'getSalesTrend', args: { ...trendRange, granularity, metric }, hasData: data.length > 0 }],
    }
  }

  // 8. Category growth — BUG-5 fix
  if (intent.isCategoryContext) {
    const data = await getCategoryRevenue({ ...range, compareWith: 'prev_period' })
    return {
      answer: summarizeCategoryGrowth(data),
      toolCalls: [{ toolName: 'getCategoryRevenue', args: { ...range, compareWith: 'prev_period' }, hasData: data.length > 0 }],
    }
  }

  // 9. Top products — BUG-4 fix: sortBy đúng
  if (intent.isTopProductsQuery) {
    const sortBy = intent.topProductsSortBy
    const data   = await getTopProducts({ ...range, sortBy, limit: 10 })
    return {
      answer: summarizeTopProducts(data, range, sortBy),
      toolCalls: [{ toolName: 'getTopProducts', args: { ...range, sortBy, limit: 10 }, hasData: data.length > 0 }],
    }
  }

  // 10. Top customers — BUG-3 fix: "mua nhiều nhất" → frequency
  if (intent.isCustomerContext && intent.mentionsFrequency) {
    const data  = await getTopCustomers({ ...range, sortBy: 'frequency', limit: 10 })
    const lines = data.slice(0, 10).map((c, i) =>
      `${i + 1}. ${c.customerName || c.customerId}: ${c.orderCount} đơn, tổng ${money(c.revenue)}`
    )
    return {
      answer: `Top khách hàng mua nhiều nhất (${range.startDate} → ${range.endDate}):\n${lines.join('\n')}`,
      toolCalls: [{ toolName: 'getTopCustomers', args: { ...range, sortBy: 'frequency', limit: 10 }, hasData: data.length > 0 }],
    }
  }

  // 11. Revenue summary
  if (intent.isRevenueSummaryQuery) {
    const data = await getSalesSummary({ ...range, groupBy: 'day', compareWith: 'prev_period' })
    return {
      answer: summarizeSales(data),
      toolCalls: [{ toolName: 'getSalesSummary', args: { ...range, compareWith: 'prev_period' }, hasData: true }],
    }
  }

  return null
}

// ─── LLM fallback ─────────────────────────────────────────────────────────────

export async function chatWithAnalyticsAgent({ message }) {
  const latestSalesDate = await getLatestSalesDate()

  const deterministic = await runDeterministicIntent(message, latestSalesDate)
  if (deterministic) return deterministic

  const client = getGroqClient()
  const today = todayUtcText()

  const messages = [
    {
      role: 'system',
      content: [
        'Bạn là AI agent phân tích dữ liệu nhà thuốc cho admin.',
        'Trả lời bằng tiếng Việt, ngắn gọn, có số liệu cụ thể từ tool.',
        `Ngày hiện tại: ${today}. Dữ liệu mới nhất trong datamart: ${latestSalesDate}.`,
        'Khi người dùng nhắc thời gian tương đối, hãy convert chính xác sang YYYY-MM-DD:',
        `  - "hôm nay" = ${latestSalesDate}`,
        `  - "hôm qua" = ${dateAdd(latestSalesDate, -1)}`,
        `  - "tuần này" = thứ Hai đến ${latestSalesDate} của tuần hiện tại`,
        `  - "tháng này" = ${latestSalesDate.slice(0, 7)}-01 đến ${latestSalesDate}`,
        `  - "tháng trước" = tháng ${latestSalesDate.slice(0, 7)} trừ 1 tháng`,
        'Nếu không rõ thời gian, dùng 30 ngày kết thúc tại ngày dữ liệu mới nhất.',
        'Không bịa số liệu. Nếu dữ liệu trống, nói rõ chưa có dữ liệu.',
      ].join(' '),
    },
    { role: 'user', content: message },
  ]

  let first
  try {
    first = await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      tools: analyticsTools,
      tool_choice: 'auto',
      temperature: 0.2,
    })
  } catch (err) {
    // Model hallucinated a tool name not in our list → trả về graceful fallback
    if (err.status === 400 && err.error?.error?.code === 'tool_use_failed') {
      return {
        answer: 'Tôi chưa hỗ trợ truy vấn này. Hãy thử hỏi về doanh thu, tồn kho, khách hàng, hoặc sản phẩm bán chạy.',
        toolCalls: [],
      }
    }
    throw err // re-throw lỗi khác
  }

  const assistantMessage = first.choices[0]?.message
  const toolCalls = assistantMessage?.tool_calls || []

  if (!toolCalls.length) {
    return {
      answer: assistantMessage?.content || 'Tôi chưa xác định được báo cáo phù hợp để gọi.',
      toolCalls: [],
    }
  }

  const toolResults = []
  const followUpMessages = [...messages, assistantMessage]

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name
    const handler = toolHandlers[toolName]
    const args = safeJsonParse(toolCall.function?.arguments, toolName)

    if (!handler) {
      const content = { error: 'Tool không được hỗ trợ' }
      toolResults.push({ toolName, args, error: content.error })
      followUpMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(content) })
      continue
    }

    if (args === null) {
      const errMsg = `Không thể parse arguments cho tool "${toolName}".`
      toolResults.push({ toolName, args: null, error: errMsg })
      followUpMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: errMsg }) })
      continue
    }

    try {
      const data = await handler(args)
      toolResults.push({ toolName, args, data })
      followUpMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(data) })
    } catch (error) {
      console.error(`[Tool Error] ${toolName}:`, error)
      const content = { error: error.message || 'Không gọi được tool' }
      toolResults.push({ toolName, args, error: content.error })
      followUpMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(content) })
    }
  }

  const priorContent = assistantMessage?.content
  const synthesisNote = priorContent
    ? `Trợ lý đã có nhận xét ban đầu: "${priorContent}". Hãy kết hợp với kết quả tool để tổng hợp câu trả lời cuối.`
    : 'Tổng hợp kết quả tool thành câu trả lời ngắn gọn cho admin. Ưu tiên insight, con số chính, khuyến nghị hành động nếu phù hợp.'

  const final = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      ...followUpMessages,
      { role: 'system', content: synthesisNote },
    ],
    temperature: 0.2,
  })

  return {
    answer: final.choices[0]?.message?.content || 'Không tạo được câu trả lời phân tích.',
    toolCalls: toolResults.map(r => ({
      toolName: r.toolName,
      args: r.args,
      hasData: Boolean(r.data),
      error: r.error,
    })),
  }
}