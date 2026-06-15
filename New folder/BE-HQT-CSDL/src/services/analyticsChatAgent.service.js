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
          compareWith: { type: 'string', enum: ['prev_period', 'prev_year', 'prev_month', 'prev_week', 'prev_quarter'] },
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

async function getSalesDateBounds() {
  const row = await queryOne(
    `SELECT
        CONVERT(VARCHAR(10), MIN(CAST(d.FullDate AS DATE)), 23) AS EarliestDate,
        CONVERT(VARCHAR(10), MAX(CAST(d.FullDate AS DATE)), 23) AS LatestDate
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey`
  )
  const latest = row?.LatestDate || todayUtcText()
  const earliest = row?.EarliestDate || latest
  return { earliest, latest }
}

async function getLatestSalesDate() {
  const { latest } = await getSalesDateBounds()
  return latest
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
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
 *  6. Fallback: toàn bộ dữ liệu datamart (hoặc 90 ngày nếu chưa có mốc sớm nhất)
 *
 * @param {string} message  - câu hỏi gốc
 * @param {string} refDate  - mốc "hôm nay" (thường là latestDate từ DB)
 * @param {string} [earliestDate] - ngày bán sớm nhất trong datamart
 * @returns {{ startDate: string, endDate: string, label: string }}
 */
function parseDateRange(message, refDate, earliestDate = null) {
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
    let s = new Date(start)
    let e = new Date(end)
    if (e > ref) e = new Date(ref)
    if (s > ref) s = new Date(ref)
    if (s > e) {
      const tmp = s
      s = e
      e = tmp
    }
    return { startDate: fmt(s), endDate: fmt(e), label }
  }

  // 1. Khoảng cụ thể dạng ISO "từ YYYY-MM-DD đến YYYY-MM-DD"
  const isoRange = n.match(
    /(?:tu|from)?\s*(\d{4}-\d{2}-\d{2})\s*(?:den|dén|to|-|–)\s*(\d{4}-\d{2}-\d{2})/
  )
  if (isoRange) {
    return result(new Date(`${isoRange[1]}T00:00:00.000Z`), new Date(`${isoRange[2]}T00:00:00.000Z`), `${isoRange[1]} → ${isoRange[2]}`)
  }

  // 1b. Khoảng ISO trên message gốc (giữ dấu tiếng Việt "đến")
  const isoRangeRaw = message.match(
    /(?:từ|tu|from)\s*(\d{4}-\d{2}-\d{2})\s*(?:đến|den|to|-|–)\s*(\d{4}-\d{2}-\d{2})/i
  )
  if (isoRangeRaw) {
    return result(
      new Date(`${isoRangeRaw[1]}T00:00:00.000Z`),
      new Date(`${isoRangeRaw[2]}T00:00:00.000Z`),
      `${isoRangeRaw[1]} → ${isoRangeRaw[2]}`,
    )
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

  // 3. Ngày đơn dạng ISO YYYY-MM-DD (bỏ qua nếu câu hỏi có khoảng "từ ... đến ...")
  const isoSingle =
    !/(?:đến|den|to)\s*\d{4}-\d{2}-\d{2}/i.test(message) &&
    message.match(/\b(\d{4}-\d{2}-\d{2})\b/)
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

  // 7b. "theo tháng gần đây" / "tháng gần đây" (không ghi số)
  if (
    /\b(theo\s+)?thang\s*(gan day|gan nhat|vua qua|moi day)\b/.test(n) ||
    (/\b(gan day|gan nhat|vua qua|moi day)\b/.test(n) && /\bthang\b/.test(n))
  ) {
    const months = 6
    const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (months - 1), 1))
    return result(start, ref, `${months} tháng gần đây`)
  }

  // 7c. "gần đây" chung (không chỉ định đơn vị)
  if (/\b(gan day|gan nhat|vua qua|moi day)\b/.test(n)) {
    return result(addDays(ref, -89), ref, '90 ngày gần nhất')
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

  // 18a. Khoảng "từ tháng 6-2023 đến tháng 9-2024" / "tháng 6/2023 → tháng 9/2024"
  const monthRangeSep = String.raw`(?:den|toi|->|\u2192|-)`
  const monthYearRange = n.match(
    new RegExp(String.raw`(?:tu\s+)?thang\s*(\d{1,2})\s*[-\/]\s*(\d{4})\s*${monthRangeSep}\s*thang\s*(\d{1,2})\s*[-\/]\s*(\d{4})`),
  )
  if (monthYearRange) {
    const y1 = +monthYearRange[2]
    const y2 = +monthYearRange[4]
    const dStart = new Date(Date.UTC(y1, +monthYearRange[1] - 1, 1))
    const dEnd = new Date(Date.UTC(y2, +monthYearRange[3] - 1, 1))
    return result(startOfMonth(dStart), endOfMonth(dEnd), `tháng ${monthYearRange[1]}/${y1} → tháng ${monthYearRange[3]}/${y2}`)
  }

  // 18b. Khoảng "từ tháng X đến tháng Y" (cùng năm hoặc khác năm)
  const monthRange = n.match(
    new RegExp(String.raw`(?:tu\s+)?thang\s*(\d{1,2})(?:\s*(?:nam|\/|-)\s*(\d{4}))?\s*${monthRangeSep}\s*thang\s*(\d{1,2})(?:\s*(?:nam|\/|-)\s*(\d{4}))?`),
  )
  if (monthRange) {
    const y1 = +(monthRange[2] || ref.getUTCFullYear())
    const y2 = +(monthRange[4] || y1)
    const dStart = new Date(Date.UTC(y1, +monthRange[1] - 1, 1))
    const dEnd   = new Date(Date.UTC(y2, +monthRange[3] - 1, 1))
    return result(startOfMonth(dStart), endOfMonth(dEnd), `tháng ${monthRange[1]}/${y1} → tháng ${monthRange[3]}/${y2}`)
  }

  // 18c. Tháng cụ thể có năm: "tháng 3 năm 2024", "tháng 6-2023", "03/2024"
  const monthYear = !new RegExp(String.raw`${monthRangeSep}\s*thang`).test(n) && n.match(
    /thang\s*(\d{1,2})(?:\s*(?:nam|\/|-)\s*(\d{4}))?|(\d{1,2})\/(\d{4})/,
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

  // 21. Toàn bộ / tất cả dữ liệu có trong datamart
  if (/\b(toan bo|tat ca|all time|toan ky|ca ky|full data|toan thoi gian)\b/.test(n)) {
    const start = earliestDate
      ? new Date(`${earliestDate}T00:00:00.000Z`)
      : addDays(ref, -89)
    return result(start, ref, 'toàn bộ dữ liệu')
  }

  // Fallback: ưu tiên toàn bộ datamart; không có mốc sớm thì 90 ngày
  if (earliestDate && earliestDate < refDate) {
    return result(
      new Date(`${earliestDate}T00:00:00.000Z`),
      ref,
      'toàn bộ dữ liệu',
    )
  }
  return result(addDays(ref, -89), ref, '90 ngày gần nhất')
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

function summarizeTopProducts(rows, range, latestDate, { sortBy = 'revenue', limit = 5 } = {}) {
  const lag = dataLagNote(latestDate, range.endDate)
  const rangeLabel = range.label || `${range.startDate} → ${range.endDate}`

  if (!rows?.length) {
    return `Chưa có dữ liệu sản phẩm trong khoảng ${range.startDate} đến ${range.endDate}.${lag}`
  }

  const header = sortBy === 'quantity'
    ? `Top ${limit} thuốc bán chạy (${rangeLabel}):`
    : sortBy === 'profit'
      ? `Top ${limit} sản phẩm lợi nhuận cao nhất (${rangeLabel}):`
      : `Top ${limit} sản phẩm doanh thu cao nhất (${rangeLabel}):`

  const lines = rows.slice(0, limit).map((item, i) => {
    const name = item.productName || item.medicineName || item.productKey
    return `${i + 1}. ${name}: ${quantity(item.quantitySold || item.quantity)} sp, doanh thu ${money(item.revenue)}, lợi nhuận ${money(item.profit)}`
  })

  return `${header}${lag}\n${lines.join('\n')}`
}

function summarizeLowStock(rows, latestDate) {
  if (!rows?.length) return 'Hiện chưa có sản phẩm tồn kho thấp theo snapshot mới nhất.'
  const lines = rows.slice(0, 5).map((item, i) => {
    const name = item.productName || item.medicineName || item.productKey
    return `${i + 1}. ${name}: còn ${quantity(item.currentQty)}, tối thiểu ${quantity(item.minStock)}, thiếu ${quantity(item.shortageQty)}`
  })
  return `Các thuốc cần chú ý tồn kho (snapshot ${latestDate}):\n${lines.join('\n')}`
}

function summarizeMatrixProducts(rows, abcClass, xyzClass, range, latestDate) {
  const lag = dataLagNote(latestDate, range.endDate)
  if (!rows?.length) {
    return `Chưa có sản phẩm thuộc nhóm ${abcClass}${xyzClass} trong khoảng ${range.startDate} đến ${range.endDate}.${lag}`
  }
  const lines = rows.slice(0, 10).map((item, i) => {
    const name = item.productName || item.medicineName || item.productKey
    const stockText = item.currentQty !== undefined ? `, tồn ${quantity(item.currentQty)}` : ''
    return `${i + 1}. ${name}: doanh thu ${money(item.revenue)}, bán ${quantity(item.quantitySold || item.quantity)}${stockText}`
  })
  return `Sản phẩm nhóm ${abcClass}${xyzClass} (${range.label || `${range.startDate} → ${range.endDate}`}):${lag}\n${lines.join('\n')}`
}

function recentMonthsRange(latestDate, months = 6) {
  const ref = new Date(`${latestDate}T00:00:00.000Z`)
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (months - 1), 1))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: latestDate,
    label: `${months} tháng gần đây`,
  }
}

function lastCompleteYearRange(latestDate) {
  const ref = new Date(`${latestDate}T00:00:00.000Z`)
  const year = ref.getUTCFullYear() - 1
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    label: `năm ${year}`,
  }
}

function resolveCategoryRevenueRange(range, normalized, latestDate) {
  if (range.label !== 'toàn bộ dữ liệu') return range
  if (/tang truong|dang tang|tot nhat/.test(normalized)) {
    return lastCompleteYearRange(latestDate)
  }
  if (/so sanh/.test(normalized)) {
    return recentMonthsRange(latestDate, 6)
  }
  return range
}

function formatCategoryGrowth(row) {
  if (row.revenueChangePercent != null) {
    const sign = row.revenueChangePercent > 0 ? '+' : ''
    return `${sign}${row.revenueChangePercent}%`
  }
  if (row.revenue > 0 && !row.previousRevenue) return 'mới phát sinh'
  return 'n/a'
}

function summarizeCategoryRevenue(data, range, { growthFocus = false } = {}) {
  let rows = [...(data || [])]
  if (growthFocus) {
    rows = rows
      .filter((row) => row.revenueChangePercent != null && row.revenueChangePercent > 0)
      .sort((a, b) => b.revenueChangePercent - a.revenueChangePercent)
  }

  const rangeLabel = formatSalesRangeLabel(range)
  const header = growthFocus
    ? `Nhóm sản phẩm tăng trưởng tốt (${rangeLabel} so với kỳ trước):`
    : /so sanh/.test(normalizeText(String(range.label || ''))) || rangeLabel.includes('→')
      ? `So sánh doanh thu theo nhóm thuốc (${rangeLabel}):`
      : `Doanh thu theo danh mục (${rangeLabel}):`

  if (growthFocus && !rows.length) {
    return `Không có nhóm sản phẩm tăng trưởng dương trong ${rangeLabel} so với kỳ trước.`
  }

  if (!rows.length) {
    return `Chưa có dữ liệu doanh thu theo danh mục (${rangeLabel}).`
  }

  const lines = rows.slice(0, 8).map((row, index) => {
    const growthText = formatCategoryGrowth(row)
    if (growthFocus) {
      return `${index + 1}. ${row.categoryName}: ${growthText} — doanh thu ${money(row.revenue)}`
    }
    return `${index + 1}. ${row.categoryName}: ${money(row.revenue)} (${growthText})`
  })

  return `${header}\n${lines.join('\n')}`
}

function resolveTrendRange(range, normalized, latestDate) {
  if (range.label !== 'toàn bộ dữ liệu') return range
  if (/\bthang\b/.test(normalized) || /\b(aov|doanh thu|revenue)\b/.test(normalized)) {
    return recentMonthsRange(latestDate, 6)
  }
  return {
    startDate: addDays(latestDate, -89),
    endDate: latestDate,
    label: '90 ngày gần nhất',
  }
}

function formatTrendPeriod(period) {
  if (!period) return 'N/A'
  const text = String(period)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 7)
  return text
}

function formatOverallTrend(rows, formatValue) {
  if (!rows?.length || rows.length < 2) return 'Xu hướng: Chưa đủ dữ liệu'

  const first = rows[0]
  const last = rows[rows.length - 1]
  if (last.value === first.value) {
    return `Xu hướng: Ổn định (${formatValue(first.value)} → ${formatValue(last.value)})`
  }

  const direction = last.value > first.value ? 'Tăng' : 'Giảm'
  if (first.value > 0) {
    const deltaPercent = Number(((last.value - first.value) / first.value * 100).toFixed(2))
    const sign = deltaPercent > 0 ? '+' : ''
    return `Xu hướng: ${direction} (${sign}${deltaPercent}%, ${formatValue(first.value)} → ${formatValue(last.value)})`
  }

  return `Xu hướng: ${direction} (${formatValue(first.value)} → ${formatValue(last.value)})`
}

function summarizeSalesTrend(rows, range, metric, latestDate) {
  const lag = dataLagNote(latestDate, range.endDate)
  const metricLabel = metric === 'aov' ? 'AOV' : metric === 'orders' ? 'Số đơn' : 'Doanh thu'
  const formatValue = (value) => (metric === 'orders' ? quantity(value) : money(value))
  const rangeLabel = formatSalesRangeLabel(range)

  if (!rows?.length) {
    return `Chưa có dữ liệu xu hướng ${metricLabel} (${rangeLabel}).${lag}`
  }

  const displayLimit = rows.length <= 24 ? rows.length : 12
  const points = rows.length <= 24 ? rows : rows.slice(-displayLimit)
  const trendLine = formatOverallTrend(rows, formatValue)
  const lines = points.map((row) => `• ${formatTrendPeriod(row.period)}: ${formatValue(row.value)}`)

  let changeLine = ''
  if (rows.length >= 2) {
    const previous = rows[rows.length - 2]
    const latest = rows[rows.length - 1]
    if (previous.value > 0) {
      const deltaPercent = Number(((latest.value - previous.value) / previous.value * 100).toFixed(2))
      const sign = deltaPercent > 0 ? '+' : ''
      changeLine = `\n${metricLabel} kỳ gần nhất ${sign}${deltaPercent}% so với kỳ trước (${formatValue(previous.value)} → ${formatValue(latest.value)}).`
    } else if (latest.value > 0) {
      changeLine = `\n${metricLabel} kỳ gần nhất: mới phát sinh (kỳ trước: ${formatValue(0)}).`
    }
  }

  return `Xu hướng ${metricLabel} theo tháng (${rangeLabel}):${lag}\n${trendLine}\n${lines.join('\n')}${changeLine}`
}

function formatCompareDelta(metric, { inline = false } = {}) {
  if (metric?.deltaPercent != null) {
    const sign = metric.deltaPercent > 0 ? '+' : ''
    const text = `${sign}${metric.deltaPercent}% so với kỳ trước`
    return inline ? ` (${text.replace(' so với kỳ trước', ' so kỳ trước')})` : text
  }

  const current = Number(metric?.current ?? 0)
  const previous = Number(metric?.previous ?? 0)
  if (current > 0 && previous === 0) {
    return inline ? ' (mới phát sinh, kỳ trước: 0 đ)' : 'mới phát sinh (kỳ trước: 0 đ)'
  }
  if (current === 0 && previous > 0) {
    return inline ? ' (-100% so kỳ trước)' : '-100% so với kỳ trước'
  }
  if (current === 0 && previous === 0) {
    return inline ? ' (không phát sinh)' : 'không phát sinh (kỳ trước: 0 đ)'
  }
  return inline ? '' : 'chưa đủ dữ liệu kỳ so sánh'
}

function formatSalesRangeLabel(range) {
  if (range.label?.includes('→')) return range.label
  if (range.startDate === range.endDate) return range.label || range.startDate
  if (range.label && !/^\d{4}-\d{2}-\d{2}$/.test(range.label)) return range.label
  return `${range.startDate} → ${range.endDate}`
}

function resolveCompareWith(range) {
  const label = normalizeText(range.label || '')
  if (/\b(thang nay|thang truoc|trong thang)\b/.test(label)) return 'prev_month'
  if (/\b(tuan nay|tuan truoc|trong tuan)\b/.test(label)) return 'prev_week'
  if (/\b(quy nay|quy truoc|trong quy)\b/.test(label)) return 'prev_quarter'
  if (/\b(nam nay|nam truoc|trong nam)\b/.test(label)) return 'prev_year'
  return 'prev_period'
}

function summarizeInventoryValue(data, breakdown) {
  if (!data?.groups?.length) {
    return 'Chưa có dữ liệu giá trị tồn kho.'
  }

  if (breakdown === 'none') {
    return `Giá trị tồn kho: tổng ${money(data.totalValue)}, ${quantity(data.totalQty)} đơn vị.`
  }

  const breakdownLabel = breakdown === 'category' ? 'danh mục' : 'nhà cung cấp'
  const lines = data.groups.slice(0, 10).map((group, index) =>
    `${index + 1}. ${group.name}: ${money(group.inventoryValue)} (${group.sharePercent}%), ${quantity(group.currentQty)} đơn vị, ${quantity(group.productCount)} SP`,
  )

  return `Giá trị tồn kho theo ${breakdownLabel} (tổng ${money(data.totalValue)}, ${quantity(data.totalQty)} đơn vị):\n${lines.join('\n')}`
}

function summarizeSales(data, range, latestDate) {
  const lag = dataLagNote(latestDate, range.endDate)
  const revenue = data?.metrics?.revenue
  const orders = data?.metrics?.orders
  const profit = data?.metrics?.profit
  const aov = data?.metrics?.aov
  const delta = formatCompareDelta(revenue)
  const lines = [
    `Doanh thu ${formatSalesRangeLabel(range)}: ${money(revenue?.current)}, ${delta}.${lag}`,
    `Số đơn: ${quantity(orders?.current)}. Lợi nhuận gộp: ${money(profit?.current)}.`,
  ]
  if (aov?.current != null) {
    lines.push(`AOV: ${money(aov.current)}${formatCompareDelta(aov, { inline: true })}.`)
  }
  return lines.join('\n')
}

// ─── Intent classification ────────────────────────────────────────────────────

function classifyIntent(normalized) {
  const isProductContext = /thuoc|san pham|\bsp\b|hang hoa/.test(normalized)
  const mentionsTop = /ban chay|top\b|cao nhat|nhieu nhat|hang dau/.test(normalized)
  const mentionsProfit = /loi nhuan/.test(normalized)
  const mentionsRevenue = /doanh thu|don hang|so don/.test(normalized)

  const matrixCellMatch =
    normalized.match(/(?:nhom|matrix)\s+([abc])\s*([xyz])/i) ||
    normalized.match(/(?<![a-z])([abc])([xyz])(?![a-z])/i)

  const mentionsMatrixAnalysis =
    (normalized.includes('ma tran') || normalized.includes('abc') || normalized.includes('xyz')) &&
    (normalized.includes('phan tich') || normalized.includes('phan bo') || normalized.includes('phan phoi') || normalized.includes('thong ke'))

  // Tách rõ: "giá trị tồn kho" vs "tồn kho thấp/hết hàng"
  const mentionsInventoryValue =
    /gia tri ton kho|inventory value|ton kho hien tai|ton kho theo/.test(normalized)

  const mentionsLowStock =
    !mentionsInventoryValue &&
    /sap het|het hang|can chu y|ton kho thap|low stock|thieu hang/.test(normalized)

  const isCategoryGroupingQuery =
    /danh muc|category|theo nhom|nhom thuoc|nhom san pham|nhom hang|theo danh muc/.test(normalized)

  const mentionsCategoryRevenue =
    (isCategoryGroupingQuery ||
      (/\bnhom\b/.test(normalized) && !isProductContext)) &&
    (mentionsRevenue || mentionsProfit || /tang truong|so sanh|tot nhat|cao nhat/.test(normalized))

  const mentionsStockLoss =
    /huy hang|hao hut|mat hang|xuat huy|stock loss|thua kien|bi huy|that thoat|tieu huy/.test(normalized)

  // Nhận diện intent tương lai → forecastRevenue (phải check TRƯỚC revenue summary)
  const mentionsFuture =
    /du bao|forecast|du kien|uoc tinh|co the dat|tuan sau|thang toi|nam toi|ngay toi|sap toi|tuong lai/.test(normalized)

  const mentionsCustomer =
    /khach hang|customer/.test(normalized) &&
    !/ban chay/.test(normalized)

  const mentionsTopCustomer =
    (/khach hang|customer|\bkh\b/.test(normalized)) &&
    (/top|nhieu nhat|cao nhat|hang dau|mua nhieu/.test(normalized))

  const mentionsAov = /\baov\b|gia tri don trung binh|average order/.test(normalized)

  const isTopProductsQuery =
    !isCategoryGroupingQuery &&
    ((mentionsTop && isProductContext) ||
    (mentionsTop && (mentionsRevenue || mentionsProfit)) ||
    (isProductContext && (mentionsRevenue || mentionsProfit) &&
      !/tong|bao cao/.test(normalized)))

  const mentionsTrend =
    (/xu huong|trend|theo (thang|tuan|ngay)|bieu do|thay doi|bien dong|ra sao/.test(normalized)) &&
    (mentionsRevenue || mentionsAov)

  const isAovQuery = mentionsAov && !mentionsTrend && !isTopProductsQuery

  const mentionsSalesByHour =
    /gio nao|khung gio|theo gio/.test(normalized) &&
    (mentionsRevenue || /ban|doanh thu|don hang/.test(normalized))

  const isRevenueSummaryQuery =
    (mentionsRevenue || mentionsProfit || isAovQuery) &&
    !isTopProductsQuery &&
    !mentionsMatrixAnalysis &&
    !mentionsCategoryRevenue &&
    !mentionsTrend &&
    !mentionsFuture

  const isRFMQuery =
  normalized.includes('rfm') ||
  (normalized.includes('phan nhom') && normalized.includes('khach')) ||
  (normalized.includes('phan khuc') && normalized.includes('khach')) ||
  normalized.includes('recency') || normalized.includes('frequency') || normalized.includes('monetary')

  return {
    matrixCellMatch,
    mentionsMatrixAnalysis,
    mentionsLowStock,
    mentionsInventoryValue,
    mentionsCategoryRevenue,
    mentionsStockLoss,
    mentionsCustomer,
    mentionsTopCustomer,
    mentionsTrend,
    mentionsFuture,
    mentionsAov,
    isAovQuery,
    mentionsSalesByHour,
    isTopProductsQuery,
    isRevenueSummaryQuery,
    mentionsProfit,
    isProductContext,
    isRFMQuery,
  }
}

// ─── Deterministic intent router ─────────────────────────────────────────────

async function runDeterministicIntent(message, latestDate, earliestDate = null) {
  const normalized = normalizeText(message)

  // Parse range từ câu hỏi, dùng latestDate làm mốc "hôm nay"
  const range = parseDateRange(message, latestDate, earliestDate)
  const intent = classifyIntent(normalized)

  // 1a. Forecast — phải check TRƯỚC revenue summary để "tuần sau/tháng tới" không bị nhầm
  if (intent.mentionsFuture) {
    // Đọc số ngày dự báo từ câu hỏi nếu có
    const daysMatch = normalizeText(message).match(/(\d+)\s*ngay/)
    const weeksMatch = normalizeText(message).match(/(\d+)\s*tuan/)
    const monthsMatch = normalizeText(message).match(/(\d+)\s*thang/)
    const forecastDays = daysMatch ? +daysMatch[1]
      : weeksMatch ? +weeksMatch[1] * 7
      : monthsMatch ? +monthsMatch[1] * 30
      : /tuan sau/.test(normalized) ? 7
      : /thang toi/.test(normalized) ? 30
      : /nam toi/.test(normalized) ? 365
      : 30
    const args = { forecastDays: Math.min(forecastDays, 365), model: 'linear' }
    const data = await forecastRevenue(args)
    const totalFmt = money(data.totalForecastRevenue)
    const avgFmt = money(data.averageDailyRevenue)
    return {
      answer: `Dự báo doanh thu ${forecastDays} ngày tới: tổng khoảng ${totalFmt}, trung bình ${avgFmt}/ngày.`,
      toolCalls: [{ toolName: 'forecastRevenue', args, hasData: Boolean(data.forecast?.length) }],
    }
  }

  // 1. Matrix cell
  if (intent.matrixCellMatch) {
    const abcClass = intent.matrixCellMatch[1].toUpperCase()
    const xyzClass = intent.matrixCellMatch[2].toUpperCase()
    const args = { abcClass, xyzClass, startDate: range.startDate, endDate: range.endDate, includeInventory: true, sortBy: 'revenue', limit: 10 }
    const data = await getProductsByMatrix(args)
    return {
      answer: summarizeMatrixProducts(data, abcClass, xyzClass, range, latestDate),
      toolCalls: [{ toolName: 'getProductsByMatrix', args, hasData: data.length > 0 }],
    }
  }

  // 2. Matrix distribution
  if (intent.mentionsMatrixAnalysis) {
    const args = { startDate: range.startDate, endDate: range.endDate, includeInventoryValue: true }
    const data = await getMatrixDistribution(args)
    return {
      answer: `Phân bổ ABC/XYZ (${range.label}):\n${JSON.stringify(data)}`,
      toolCalls: [{ toolName: 'getMatrixDistribution', args, hasData: data.length > 0 }],
    }
  }

  if (intent.isRFMQuery) {
  const today = todayUtcText()
  const data = await getRFMSegments({ asOfDate: latestDate, includeList: false })
  const lines = (data.summary || [])
    .sort((a, b) => b.customerCount - a.customerCount)
    .map(s => `• ${s.segment}: ${s.customerCount} KH, doanh thu ${money(s.revenue)}`)
    .join('\n')
  return {
    answer: `Phân nhóm RFM khách hàng (tính đến ${latestDate}):\n${lines || 'Chưa có dữ liệu phân nhóm.'}`,
    toolCalls: [{ toolName: 'getRFMSegments', args: { asOfDate: latestDate, includeList: false }, hasData: (data.summary?.length ?? 0) > 0 }],
  }
}

  // 3. Low stock (không cần date range)
  if (intent.mentionsLowStock) {
    const data = await getLowStockAlerts({})
    return {
      answer: summarizeLowStock(data, latestDate),
      toolCalls: [{ toolName: 'getLowStockAlerts', args: {}, hasData: data.length > 0 }],
    }
  }

  // 4b. Product count — "hiện có bao nhiêu sản phẩm/mặt hàng/SKU?"
  const isProductCountQuery =
    /bao nhieu (san pham|thuoc|mat hang|sku|loai)|tong so (san pham|thuoc|mat hang|sku)|hien co (san pham|thuoc)|so luong (san pham|thuoc|mat hang)/.test(normalized) &&
    !intent.mentionsLowStock && !intent.isTopProductsQuery

  if (isProductCountQuery) {
    const breakdown = /danh muc|nhom/.test(normalized) ? 'category' : 'none'
    const args = { breakdown }
    const data = await getInventoryValue(args)
    const totalProducts = data.groups.reduce((s, g) => s + g.productCount, 0)
    const lag = dataLagNote(latestDate, latestDate)
    if (breakdown === 'category') {
      const lines = data.groups.map((g, i) => `${i + 1}. ${g.name}: ${quantity(g.productCount)} sản phẩm`)
      return {
        answer: `Số sản phẩm theo danh mục (tổng ${quantity(totalProducts)}):${lag}\n${lines.join('\n')}`,
        toolCalls: [{ toolName: 'getInventoryValue', args, hasData: totalProducts > 0 }],
      }
    }
    return {
      answer: `Hiện có ${quantity(totalProducts)} sản phẩm/SKU trong kho (theo snapshot tồn kho mới nhất).${lag}`,
      toolCalls: [{ toolName: 'getInventoryValue', args, hasData: totalProducts > 0 }],
    }
  }

  // 4. Inventory value
  if (intent.mentionsInventoryValue) {
    const breakdown = /danh muc|category|theo nhom/.test(normalized) ? 'category'
      : /nha cung cap|supplier/.test(normalized) ? 'supplier'
      : 'none'
    const args = { breakdown }
    const data = await getInventoryValue(args)
    return {
      answer: summarizeInventoryValue(data, breakdown),
      toolCalls: [{ toolName: 'getInventoryValue', args, hasData: Boolean(data.totalValue) }],
    }
  }

  // 5. Stock loss
  if (intent.mentionsStockLoss) {
    const groupBy = /\bnhom\b|danh muc/.test(normalized) ? 'category'
      : /san pham|thuoc/.test(normalized) ? 'product'
      : 'month'
    const args = { startDate: range.startDate, endDate: range.endDate, groupBy }
    const data = await getStockLossSummary(args)
    const total = data.reduce((s, r) => s + r.lossValue, 0)
    return {
      answer: `Hủy hàng / hao hụt (${range.label}): tổng ${money(total)}, ${data.length} nhóm.`,
      toolCalls: [{ toolName: 'getStockLossSummary', args, hasData: data.length > 0 }],
    }
  }

  // 6. Category revenue
  if (intent.mentionsCategoryRevenue) {
    const growthFocus = /tang truong|dang tang|tot nhat/.test(normalized)
    const categoryRange = resolveCategoryRevenueRange(range, normalized, latestDate)
    const compareWith = /so sanh/.test(normalized) ? resolveCompareWith(categoryRange) : 'prev_period'
    const args = { startDate: categoryRange.startDate, endDate: categoryRange.endDate, compareWith }
    const data = await getCategoryRevenue(args)
    return {
      answer: summarizeCategoryRevenue(data, categoryRange, { growthFocus }),
      toolCalls: [{ toolName: 'getCategoryRevenue', args, hasData: data.length > 0 }],
    }
  }

  // 7. Trend
  if (intent.mentionsTrend) {
    const trendRange = resolveTrendRange(range, normalized, latestDate)
    const granularity = /ngay/.test(normalized) ? 'daily' : /tuan/.test(normalized) ? 'weekly' : 'monthly'
    const metric = /don hang|so don/.test(normalized) ? 'orders' : /aov/.test(normalized) ? 'aov' : 'revenue'
    const args = { startDate: trendRange.startDate, endDate: trendRange.endDate, granularity, metric }
    const data = await getSalesTrend(args)
    return {
      answer: summarizeSalesTrend(data, trendRange, metric, latestDate),
      toolCalls: [{ toolName: 'getSalesTrend', args, hasData: data.length > 0 }],
    }
  }

  // 7b. Top customers
  if (intent.mentionsTopCustomer) {
    const limitMatch = normalizeText(message).match(/top\s*(\d+)/)
    const limit = limitMatch ? Math.min(+limitMatch[1], 100) : 10
    const sortBy = /tan suat|nhieu lan|so lan|mua nhieu/.test(normalized) ? 'frequency'
      : /aov|gia tri don/.test(normalized) ? 'aov'
      : 'revenue'
    const args = { startDate: range.startDate, endDate: range.endDate, sortBy, limit }
    const data = await getTopCustomers(args)
    const lines = data.slice(0, 5).map((r, i) =>
      `${i + 1}. ${r.customerName || r.customerKey}: ${money(r.totalSpent || r.revenue)}, ${quantity(r.orderCount || r.orders)} đơn`
    )
    return {
      answer: `Top khách hàng (${range.label}):\n${lines.join('\n')}`,
      toolCalls: [{ toolName: 'getTopCustomers', args, hasData: data.length > 0 }],
    }
  }

  // 7c. Customer overview (active, new, returning, total)
  if (intent.mentionsCustomer) {
    const args = { startDate: range.startDate, endDate: range.endDate }
    const data = await getCustomerOverview(args)
    const lag = dataLagNote(latestDate, range.endDate)
    // Nếu hỏi tổng số khách hàng (không kèm "tháng/tuần/kỳ") → nổi bật totalCustomers
    const askingTotal = /bao nhieu khach|tong so khach|hien co|co bao nhieu/.test(normalized) &&
      !/thang nay|tuan nay|ky nay|hom nay/.test(normalized)
    const lines = [`Khách hàng (${range.label}):${lag}`]
    if (askingTotal && data.totalCustomers) {
      lines.push(`Tổng số KH trong hệ thống: ${quantity(data.totalCustomers)}`)
    }
    lines.push(
      `Hoạt động trong kỳ: ${quantity(data.activeCustomers)}, Mới: ${quantity(data.newCustomers)}, Quay lại: ${quantity(data.returningCustomers)}`,
      `Doanh thu/KH: ${money(data.revenuePerCustomer)}, Đơn/KH: ${data.ordersPerCustomer?.toFixed(1)}`,
    )
    return {
      answer: lines.join('\n'),
      toolCalls: [{ toolName: 'getCustomerOverview', args, hasData: Boolean(data.activeCustomers || data.totalCustomers) }],
    }
  }

  // 8. Top products
  if (intent.isTopProductsQuery) {
    // Đọc số lượng từ câu hỏi nếu có: "top 10", "top 5"
    const limitMatch = normalizeText(message).match(/top\s*(\d+)/)
    const limit = limitMatch ? Math.min(+limitMatch[1], 100) : 5
    const sortBy = /doanh thu|revenue/.test(normalized) ? 'revenue'
      : intent.mentionsProfit ? 'profit'
      : /ban chay|ban nhieu/.test(normalized) && intent.isProductContext && !/doanh thu/.test(normalized)
        ? 'quantity'
        : 'revenue'
    const args = { startDate: range.startDate, endDate: range.endDate, sortBy, limit }
    const data = await getTopProducts(args)
    return {
      answer: summarizeTopProducts(data, range, latestDate, { sortBy, limit }),
      toolCalls: [{ toolName: 'getTopProducts', args, hasData: data.length > 0 }],
    }
  }

  // 9. Sales by hour
  if (intent.mentionsSalesByHour) {
    let hourRange = range
    if (range.label === 'toàn bộ dữ liệu') {
      const ref = new Date(`${latestDate}T00:00:00.000Z`)
      ref.setUTCDate(ref.getUTCDate() - 29)
      hourRange = {
        startDate: ref.toISOString().slice(0, 10),
        endDate: latestDate,
        label: '30 ngày gần nhất',
      }
    }

    const start = new Date(`${hourRange.startDate}T00:00:00.000Z`)
    const end = new Date(`${hourRange.endDate}T00:00:00.000Z`)
    const aggregateDays = Math.max(1, Math.round((end - start) / 86400000) + 1)
    const args = { date: hourRange.endDate, aggregateDays }
    const data = await getSalesByHour(args)
    const peak = [...(data || [])]
      .filter((row) => Number(row.revenue || 0) > 0)
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0]
    const rangeLabel = hourRange.label || `${hourRange.startDate} → ${hourRange.endDate}`

    return {
      answer: peak
        ? `Giờ bán cao nhất (${rangeLabel}): ${peak.hour}h — doanh thu ${money(peak.revenue)}, ${quantity(peak.orders)} đơn.`
        : `Chưa có dữ liệu bán hàng theo giờ trong khoảng ${rangeLabel}.`,
      toolCalls: [{ toolName: 'getSalesByHour', args, hasData: Boolean(peak) }],
    }
  }

  // 10. Revenue / order summary
  if (intent.isRevenueSummaryQuery) {
    const groupBy = range.label === 'hôm nay' || range.label === 'hôm qua' ? 'day'
      : /tuan/.test(normalizeText(range.label || '')) ? 'day'
      : /thang|quy|nam/.test(normalizeText(range.label || '')) ? 'month'
      : 'day'
    const args = {
      startDate: range.startDate,
      endDate: range.endDate,
      groupBy,
      compareWith: resolveCompareWith(range),
    }
    const data = await getSalesSummary(args)
    return {
      answer: summarizeSales(data, range, latestDate),
      toolCalls: [{ toolName: 'getSalesSummary', args, hasData: true }],
    }
  }

  return null
}

// ─── LLM fallback ─────────────────────────────────────────────────────────────

export async function chatWithAnalyticsAgent({ message }) {
  const { earliest: earliestSalesDate, latest: latestSalesDate } = await getSalesDateBounds()

  const deterministic = await runDeterministicIntent(message, latestSalesDate, earliestSalesDate)
  if (deterministic) return deterministic

  const client = getGroqClient()
  const today = todayUtcText()

  const messages = [
    {
      role: 'system',
      content: [
        'Bạn là AI agent phân tích dữ liệu nhà thuốc cho admin.',
        'Trả lời bằng tiếng Việt, ngắn gọn, có số liệu cụ thể từ tool.',
        `Ngày hiện tại: ${today}. Dữ liệu datamart từ ${earliestSalesDate || latestSalesDate} đến ${latestSalesDate}.`,
        'Khi người dùng nhắc thời gian tương đối, hãy convert chính xác sang YYYY-MM-DD:',
        `  - "hôm nay" = ${latestSalesDate}`,
        `  - "hôm qua" = ${dateAdd(latestSalesDate, -1)}`,
        `  - "tuần này" = thứ Hai đến ${latestSalesDate} của tuần hiện tại`,
        `  - "tháng này" = ${latestSalesDate.slice(0, 7)}-01 đến ${latestSalesDate}`,
        `  - "năm nay" = ${latestSalesDate.slice(0, 4)}-01-01 đến ${latestSalesDate}`,
        `  - "toàn bộ" / "tất cả" = ${earliestSalesDate || latestSalesDate} đến ${latestSalesDate}`,
        'Có thể hỏi khoảng tùy ý: "từ 2025-01-01 đến 2025-12-31", "6 tháng qua", "năm 2024".',
        'Nếu không rõ thời gian, dùng toàn bộ dữ liệu datamart.',
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