import { query, queryOne } from '../config/datamartDb.js'

const PRODUCT_SORT_EXPR = {
  revenue: 'Revenue',
  quantity: 'QuantitySold',
  profit: 'Profit',
}

const CUSTOMER_SORT_EXPR = {
  revenue: 'TotalSpent',
  frequency: 'OrderCount',
  aov: 'AOV',
}

const MATRIX_SORT_EXPR = {
  revenue: 'Revenue',
  inventoryValue: 'InventoryValue',
  daysOfStock: 'DaysOfStock',
  currentQty: 'CurrentQty',
}

// Tính ABC/XYZ động từ doanh thu & biến động bán hàng trong kỳ (aggregate trước, tránh scan toàn Dim_Product)
function matrixClassificationCtes() {
  const dateFilter = dateInRange('d.FullDate', '@startDate', '@endDate')
  return `
    SalesAgg AS (
      SELECT
        fs.ProductKey,
        ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue,
        ISNULL(SUM(fs.QuantitySold), 0) AS QuantitySold
      FROM gold.Fact_Sales fs
      INNER JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
        AND ${dateFilter}
      GROUP BY fs.ProductKey
    ),
    AbcRanked AS (
      SELECT
        ProductKey,
        Revenue,
        QuantitySold,
        SUM(Revenue) OVER() AS GlobalRevenue,
        SUM(Revenue) OVER(
          ORDER BY Revenue DESC, ProductKey
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS RunningRevenue
      FROM SalesAgg
    ),
    AbcClassified AS (
      SELECT
        ProductKey,
        Revenue,
        QuantitySold,
        CASE
          WHEN GlobalRevenue = 0 THEN 'C'
          WHEN (RunningRevenue * 100.0 / GlobalRevenue) <= 75 THEN 'A'
          WHEN (RunningRevenue * 100.0 / GlobalRevenue) <= 95 THEN 'B'
          ELSE 'C'
        END AS AbcClass
      FROM AbcRanked
    ),
    MonthlySales AS (
      SELECT
        fs.ProductKey,
        YEAR(d.FullDate) AS SaleYear,
        MONTH(d.FullDate) AS SaleMonth,
        ISNULL(SUM(fs.QuantitySold), 0) AS MonthlyQty
      FROM gold.Fact_Sales fs
      INNER JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
        AND ${dateFilter}
      GROUP BY fs.ProductKey, YEAR(d.FullDate), MONTH(d.FullDate)
    ),
    ProductCV AS (
      SELECT
        ProductKey,
        AVG(CAST(MonthlyQty AS DECIMAL(18, 4))) AS AvgQty,
        STDEV(CAST(MonthlyQty AS DECIMAL(18, 4))) AS StdevQty
      FROM MonthlySales
      GROUP BY ProductKey
    ),
    ClassifiedProducts AS (
      SELECT
        p.ProductKey,
        p.ProductName,
        p.CategoryName,
        abc.AbcClass,
        CASE
          WHEN cv.AvgQty IS NULL OR cv.AvgQty = 0 THEN 'Z'
          WHEN ISNULL(cv.StdevQty, 0) = 0 THEN 'X'
          WHEN (cv.StdevQty / cv.AvgQty) * 100.0 <= 20.0 THEN 'X'
          WHEN (cv.StdevQty / cv.AvgQty) * 100.0 <= 50.0 THEN 'Y'
          ELSE 'Z'
        END AS XyzClass,
        abc.Revenue,
        abc.QuantitySold
      FROM AbcClassified abc
      INNER JOIN gold.Dim_Product p ON p.ProductKey = abc.ProductKey
      LEFT JOIN ProductCV cv ON cv.ProductKey = abc.ProductKey
    )`
}

function num(value) {
  if (value === null || value === undefined) return 0
  return Number(value)
}

function pct(value, total) {
  return total > 0 ? Number((value / total * 100).toFixed(2)) : 0
}

function dateAdd(date, days) {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  return Math.max(1, Math.round((end - start) / 86400000) + 1)
}

function previousRange(startDate, endDate) {
  const length = daysBetween(startDate, endDate)
  const prevEnd = dateAdd(startDate, -1)
  const prevStart = dateAdd(prevEnd, -(length - 1))
  return { prevStart, prevEnd }
}

function previousMonthSameSpan(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const prevStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, start.getUTCDate()))
  const prevEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, end.getUTCDate()))
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10),
  }
}

function previousWeekSameSpan(startDate, endDate) {
  return {
    prevStart: dateAdd(startDate, -7),
    prevEnd: dateAdd(endDate, -7),
  }
}

function previousQuarterSameSpan(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const prevStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, start.getUTCDate()))
  const prevEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, end.getUTCDate()))
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10),
  }
}

function yearRange(startDate, endDate) {
  return {
    prevStart: dateAdd(startDate, -365),
    prevEnd: dateAdd(endDate, -365),
  }
}

function resolveCompareRange(startDate, endDate, compareWith = 'prev_period') {
  switch (compareWith) {
    case 'prev_year':
      return yearRange(startDate, endDate)
    case 'prev_month':
      return previousMonthSameSpan(startDate, endDate)
    case 'prev_week':
      return previousWeekSameSpan(startDate, endDate)
    case 'prev_quarter':
      return previousQuarterSameSpan(startDate, endDate)
    default:
      return previousRange(startDate, endDate)
  }
}

function compareValue(current, previous) {
  const delta = current - previous
  return {
    current,
    previous,
    delta,
    deltaPercent: previous > 0 ? Number((delta / previous * 100).toFixed(2)) : null,
  }
}

function periodExpression(groupBy, column = 'd.FullDate') {
  if (groupBy === 'month') return `FORMAT(${column}, 'yyyy-MM')`
  if (groupBy === 'week') return `CONCAT(DATEPART(YEAR, ${column}), '-W', RIGHT('0' + CAST(DATEPART(ISO_WEEK, ${column}) AS VARCHAR(2)), 2))`
  return `CONVERT(VARCHAR(10), CAST(${column} AS DATE), 23)`
}

/** Dim_Date.FullDate có giờ — so sánh theo DATE để gồm cả ngày kết thúc. */
function dateInRange(column, startParam, endParam) {
  return `CAST(${column} AS DATE) BETWEEN CAST(${startParam} AS DATE) AND CAST(${endParam} AS DATE)`
}

async function salesTotals(startDate, endDate) {
  const row = await queryOne(
    `SELECT
        COUNT(DISTINCT fs.InvoiceId) AS Orders,
        ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue,
        ISNULL(SUM(fs.QuantitySold), 0) AS Quantity,
        ISNULL(SUM(fs.GrossProfit), 0) AS Profit
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
     WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}`,
    { startDate, endDate }
  )

  const revenue = num(row?.Revenue)
  const orders = num(row?.Orders)

  return {
    revenue,
    orders,
    quantity: num(row?.Quantity),
    profit: num(row?.Profit),
    aov: orders > 0 ? Number((revenue / orders).toFixed(2)) : 0,
  }
}

export async function getSalesSummary({ startDate, endDate, groupBy = 'day', compareWith = 'prev_period' }) {
  const current = await salesTotals(startDate, endDate)
  const compareRange = resolveCompareRange(startDate, endDate, compareWith)
  const previous = await salesTotals(compareRange.prevStart, compareRange.prevEnd)
  const periodExpr = periodExpression(groupBy)

  const rows = await query(
    `SELECT
        ${periodExpr} AS Period,
        COUNT(DISTINCT fs.InvoiceId) AS Orders,
        ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue,
        ISNULL(SUM(fs.QuantitySold), 0) AS Quantity,
        ISNULL(SUM(fs.GrossProfit), 0) AS Profit
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
     WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
     GROUP BY ${periodExpr}
     ORDER BY Period`,
    { startDate, endDate }
  )

  return {
    period: { startDate, endDate, groupBy },
    compare: { type: compareWith, startDate: compareRange.prevStart, endDate: compareRange.prevEnd },
    metrics: {
      revenue: compareValue(current.revenue, previous.revenue),
      orders: compareValue(current.orders, previous.orders),
      quantity: compareValue(current.quantity, previous.quantity),
      profit: compareValue(current.profit, previous.profit),
      aov: compareValue(current.aov, previous.aov),
    },
    series: rows.map(r => {
      const revenue = num(r.Revenue)
      const orders = num(r.Orders)
      return {
        period: r.Period,
        revenue,
        orders,
        quantity: num(r.Quantity),
        profit: num(r.Profit),
        aov: orders > 0 ? Number((revenue / orders).toFixed(2)) : 0,
      }
    }),
  }
}

// FIX #5 (field alias): Bỏ field trùng lặp orderCount, chỉ giữ orders
export async function getSalesByHour({ date, aggregateDays = 1 }) {
  const startDate = dateAdd(date, -(aggregateDays - 1))
  const rows = await query(
    `SELECT
        d.Hour AS Hour,
        COUNT(DISTINCT fs.InvoiceId) AS Orders,
        ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
     WHERE ${dateInRange('d.FullDate', '@startDate', '@date')}
     GROUP BY d.Hour
     ORDER BY Hour`,
    { startDate, date }
  )

  const byHour = new Map(rows.map(r => [num(r.Hour), r]))
  return Array.from({ length: 24 }, (_, hour) => {
    const row = byHour.get(hour)
    return {
      hour,
      orders: num(row?.Orders),
      revenue: num(row?.Revenue),
    }
  })
}

export async function getSalesTrend({ startDate, endDate, granularity = 'monthly', metric = 'revenue' }) {
  const groupBy = granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'week' : 'month'
  const periodExpr = periodExpression(groupBy)
  const rows = await query(
    `SELECT
        ${periodExpr} AS Period,
        COUNT(DISTINCT fs.InvoiceId) AS Orders,
        ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue,
        ISNULL(SUM(fs.GrossProfit), 0) AS Profit
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
     WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
     GROUP BY ${periodExpr}
     ORDER BY Period`,
    { startDate, endDate }
  )

  return rows.map(r => {
    const revenue = num(r.Revenue)
    const orders = num(r.Orders)
    const aov = orders > 0 ? Number((revenue / orders).toFixed(2)) : 0
    return {
      period: r.Period,
      revenue,
      orders,
      profit: num(r.Profit),
      aov,
      value: metric === 'orders' ? orders : metric === 'aov' ? aov : revenue,
    }
  })
}

export async function getTopProducts({ startDate, endDate, sortBy = 'profit', categoryName, limit = 10 }) {
  const categoryFilter = categoryName ? 'AND p.CategoryName = @categoryName' : ''
  const orderBy = PRODUCT_SORT_EXPR[sortBy] || PRODUCT_SORT_EXPR.profit
  const rows = await query(
    `SELECT TOP (@limit)
        p.ProductKey,
        p.ProductName,
        p.CategoryName,
        ISNULL(SUM(fs.QuantitySold), 0) AS QuantitySold,
        ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue,
        ISNULL(SUM(fs.GrossProfit), 0) AS Profit
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
     JOIN gold.Dim_Product p ON p.ProductKey = fs.ProductKey
     WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
       ${categoryFilter}
     GROUP BY p.ProductKey, p.ProductName, p.CategoryName
     ORDER BY ${orderBy} DESC`,
    { startDate, endDate, categoryName, limit }
  )

  return rows.map(r => ({
    productKey: r.ProductKey,
    medicineId: r.ProductKey,
    productName: r.ProductName,
    medicineName: r.ProductName,
    categoryName: r.CategoryName,
    quantity: num(r.QuantitySold),
    quantitySold: num(r.QuantitySold),
    revenue: num(r.Revenue),
    profit: num(r.Profit),
  }))
}

export async function getCategoryRevenue({ startDate, endDate, compareWith = 'prev_period' }) {
  const compareRange = compareWith === 'prev_year'
    ? yearRange(startDate, endDate)
    : previousRange(startDate, endDate)

  const rows = await query(
    `WITH CurrentPeriod AS (
       SELECT ISNULL(p.CategoryName, N'Uncategorized') AS CategoryName,
              ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue,
              ISNULL(SUM(fs.GrossProfit), 0) AS Profit,
              ISNULL(SUM(fs.QuantitySold), 0) AS QuantitySold
       FROM gold.Fact_Sales fs
       JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
       JOIN gold.Dim_Product p ON p.ProductKey = fs.ProductKey
       WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
       GROUP BY ISNULL(p.CategoryName, N'Uncategorized')
     ),
     PreviousPeriod AS (
       SELECT ISNULL(p.CategoryName, N'Uncategorized') AS CategoryName,
              ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue,
              ISNULL(SUM(fs.GrossProfit), 0) AS Profit
       FROM gold.Fact_Sales fs
       JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
       JOIN gold.Dim_Product p ON p.ProductKey = fs.ProductKey
       WHERE ${dateInRange('d.FullDate', '@prevStart', '@prevEnd')}
       GROUP BY ISNULL(p.CategoryName, N'Uncategorized')
     )
     SELECT
       COALESCE(cp.CategoryName, pp.CategoryName) AS CategoryName,
       ISNULL(cp.Revenue, 0) AS Revenue,
       ISNULL(cp.Profit, 0) AS Profit,
       ISNULL(cp.QuantitySold, 0) AS QuantitySold,
       ISNULL(pp.Revenue, 0) AS PreviousRevenue,
       ISNULL(pp.Profit, 0) AS PreviousProfit
     FROM CurrentPeriod cp
     FULL JOIN PreviousPeriod pp ON pp.CategoryName = cp.CategoryName
     ORDER BY Revenue DESC`,
    { startDate, endDate, prevStart: compareRange.prevStart, prevEnd: compareRange.prevEnd }
  )

  const total = rows.reduce((sum, r) => sum + num(r.Revenue), 0)
  return rows.map(r => ({
    categoryName: r.CategoryName,
    revenue: num(r.Revenue),
    profit: num(r.Profit),
    quantitySold: num(r.QuantitySold),
    previousRevenue: num(r.PreviousRevenue),
    previousProfit: num(r.PreviousProfit),
    sharePercent: pct(num(r.Revenue), total),
    growth: compareValue(num(r.Revenue), num(r.PreviousRevenue)),
    revenueChangePercent: compareValue(num(r.Revenue), num(r.PreviousRevenue)).deltaPercent,
    profitChangePercent: compareValue(num(r.Profit), num(r.PreviousProfit)).deltaPercent,
  }))
}

export async function getCustomerOverview({ startDate, endDate }) {
  const row = await queryOne(
    `WITH PeriodSales AS (
       SELECT DISTINCT fs.CustomerKey
       FROM gold.Fact_Sales fs
       JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
       WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
         AND fs.CustomerKey IS NOT NULL
     ),
     FirstPurchase AS (
       SELECT fs.CustomerKey, MIN(d.FullDate) AS FirstDate
       FROM gold.Fact_Sales fs
       JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
       WHERE fs.CustomerKey IS NOT NULL
       GROUP BY fs.CustomerKey
     ),
     PeriodTotals AS (
       SELECT
         COUNT(DISTINCT fs.InvoiceId) AS Orders,
         ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue
       FROM gold.Fact_Sales fs
       JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
       WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
     )
     SELECT
       (SELECT COUNT(*) FROM gold.Dim_Customer) AS TotalCustomers,
       COUNT(ps.CustomerKey) AS ActiveCustomers,
       SUM(CASE WHEN ${dateInRange('fp.FirstDate', '@startDate', '@endDate')} THEN 1 ELSE 0 END) AS NewCustomers,
       SUM(CASE WHEN fp.FirstDate < @startDate THEN 1 ELSE 0 END) AS ReturningCustomers,
       CASE WHEN COUNT(ps.CustomerKey) = 0 THEN 0
            ELSE CAST(SUM(CASE WHEN fp.FirstDate < @startDate THEN 1 ELSE 0 END) AS DECIMAL(18, 4)) / COUNT(ps.CustomerKey)
       END AS RetentionRate,
       MAX(pt.Orders) AS Orders,
       MAX(pt.Revenue) AS Revenue
     FROM PeriodSales ps
     JOIN FirstPurchase fp ON fp.CustomerKey = ps.CustomerKey
     CROSS JOIN PeriodTotals pt`,
    { startDate, endDate }
  )

  const activeCustomers = num(row?.ActiveCustomers)
  const revenue = num(row?.Revenue)
  const orders = num(row?.Orders)
  return {
    totalCustomers: num(row?.TotalCustomers),
    activeCustomers,
    newCustomers: num(row?.NewCustomers),
    returningCustomers: num(row?.ReturningCustomers),
    retentionRate: num(row?.RetentionRate),
    orders,
    revenue,
    revenuePerCustomer: activeCustomers > 0 ? Number((revenue / activeCustomers).toFixed(2)) : 0,
    ordersPerCustomer: activeCustomers > 0 ? Number((orders / activeCustomers).toFixed(2)) : 0,
  }
}

export async function getTopCustomers({ startDate, endDate, sortBy = 'revenue', limit = 20 }) {
  const orderBy = CUSTOMER_SORT_EXPR[sortBy] || CUSTOMER_SORT_EXPR.revenue
  const rows = await query(
    `SELECT TOP (@limit)
        c.CustomerKey,
        c.CustomerName,
        c.Phone,
        ISNULL(SUM(fs.GrossRevenue), 0) AS TotalSpent,
        COUNT(DISTINCT fs.InvoiceId) AS OrderCount,
        ISNULL(SUM(fs.GrossRevenue), 0) / NULLIF(COUNT(DISTINCT fs.InvoiceId), 0) AS AOV,
        MAX(d.FullDate) AS LastPurchaseAt
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
     JOIN gold.Dim_Customer c ON c.CustomerKey = fs.CustomerKey
     WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
     GROUP BY c.CustomerKey, c.CustomerName, c.Phone
     ORDER BY ${orderBy} DESC`,
    { startDate, endDate, limit }
  )

  return rows.map(r => ({
    customerKey: r.CustomerKey,
    customerId: r.CustomerKey,
    customerName: r.CustomerName,
    phone: r.Phone,
    totalSpent: num(r.TotalSpent),
    revenue: num(r.TotalSpent),
    orderCount: num(r.OrderCount),
    orders: num(r.OrderCount),
    aov: num(r.AOV),
    lastPurchaseAt: r.LastPurchaseAt,
  }))
}

// analyticsAgent.service.js — chỉ thay thế hàm getRFMSegments

export async function getRFMSegments({ asOfDate, segments, includeList = false }) {
  const segmentList = typeof segments === 'string'
    ? segments.split(',').map(s => s.trim()).filter(Boolean)
    : []

  const rows = await query(
    `WITH Rfm AS (
       SELECT
         c.CustomerKey,
         c.CustomerName,
         c.Phone,
         -- Chỉ tính Recency khi khách có ít nhất 1 giao dịch
         DATEDIFF(DAY, MAX(d.FullDate), CAST(@asOfDate AS DATE)) AS Recency,
         COUNT(DISTINCT fs.InvoiceId)                            AS Frequency,
         ISNULL(SUM(fs.GrossRevenue), 0)                        AS Monetary
       FROM gold.Dim_Customer c
       -- INNER JOIN để loại hẳn khách chưa mua, tránh Recency = NULL
       INNER JOIN gold.Fact_Sales fs ON fs.CustomerKey = c.CustomerKey
       INNER JOIN gold.Dim_Date   d  ON d.DateKey = fs.InvoiceDateKey
                                     AND d.FullDate <= CAST(@asOfDate AS DATE)
       GROUP BY c.CustomerKey, c.CustomerName, c.Phone
     ),
     Scored AS (
       SELECT *,
         -- R score: thấp = tốt (mua gần đây)
         CASE
           WHEN Recency <=  30 THEN 5
           WHEN Recency <=  60 THEN 4
           WHEN Recency <=  90 THEN 3
           WHEN Recency <= 180 THEN 2
           ELSE                     1
         END AS RScore,
         -- F score: cao = tốt
         CASE
           WHEN Frequency >= 10 THEN 5
           WHEN Frequency >=  6 THEN 4
           WHEN Frequency >=  3 THEN 3
           WHEN Frequency >=  2 THEN 2
           ELSE                       1
         END AS FScore,
         -- M score: cao = tốt (dùng NTILE thay hardcode để tự thích nghi dữ liệu)
         NTILE(5) OVER (ORDER BY Monetary) AS MScore
       FROM Rfm
     ),
     Segmented AS (
       SELECT *,
         -- Ưu tiên từ tốt → xấu, không overlap
         CASE
           WHEN RScore >= 4 AND FScore >= 4                      THEN 'champions'
           WHEN RScore >= 3 AND FScore >= 3                      THEN 'loyal'
           WHEN RScore >= 3 AND FScore <= 2                      THEN 'potential_loyalist'
           WHEN RScore = 2                                        THEN 'at_risk'
           WHEN RScore = 1 AND (FScore >= 3 OR MScore >= 3)      THEN 'cant_lose'
           ELSE                                                        'hibernating'
         END AS Segment
       FROM Scored
     )
     SELECT * FROM Segmented ORDER BY Monetary DESC`,
    { asOfDate }
  )

  const filteredRows = segmentList.length
    ? rows.filter(r => segmentList.includes(r.Segment))
    : rows

  const summary = filteredRows.reduce((acc, r) => {
    const key = r.Segment
    if (!acc[key]) acc[key] = { segment: key, customerCount: 0, revenue: 0 }
    acc[key].customerCount += 1
    acc[key].revenue += num(r.Monetary)
    return acc
  }, {})

  return {
    asOfDate,
    summary: Object.values(summary),
    distribution: Object.values(summary),
    customers: includeList
      ? filteredRows.map(r => ({
          customerKey:  r.CustomerKey,
          customerId:   r.CustomerKey,
          customerName: r.CustomerName,
          phone:        r.Phone,
          recency:      num(r.Recency),
          recencyDays:  num(r.Recency),
          frequency:    num(r.Frequency),
          monetary:     num(r.Monetary),
          rScore:       num(r.RScore),
          fScore:       num(r.FScore),
          mScore:       num(r.MScore),
          segment:      r.Segment,
        }))
      : undefined,
  }
}

export async function getLowStockAlerts({ categoryName, supplierKey }) {
  const categoryFilter = categoryName ? 'AND p.CategoryName = @categoryName' : ''
  const supplierFilter = supplierKey ? 'AND s.SupplierKey = @supplierKey' : ''
  const rows = await query(
    `SELECT
        p.ProductKey,
        p.ProductName,
        p.CategoryName,
        p.MinStock,
        fis.CurrentQty,
        s.SupplierKey,
        s.SupplierName
     FROM gold.Fact_Inventory_Snapshot fis
     JOIN gold.Dim_Product p ON p.ProductKey = fis.ProductKey
     LEFT JOIN gold.Dim_Supplier s ON s.SupplierKey = fis.SupplierKey
     WHERE fis.BatchDateKey = (SELECT MAX(BatchDateKey) FROM gold.Fact_Inventory_Snapshot)
       AND (fis.IsLowStock = 1 OR fis.CurrentQty <= p.MinStock)
       ${categoryFilter}
       ${supplierFilter}
     ORDER BY (fis.CurrentQty - p.MinStock), p.ProductName`,
    { categoryName, supplierKey }
  )

  return rows.map(r => ({
    productKey: r.ProductKey,
    medicineId: r.ProductKey,
    productName: r.ProductName,
    medicineName: r.ProductName,
    categoryName: r.CategoryName,
    minStock: num(r.MinStock),
    currentQty: num(r.CurrentQty),
    shortageQty: Math.max(0, num(r.MinStock) - num(r.CurrentQty)),
    supplierKey: r.SupplierKey,
    supplierName: r.SupplierName,
  }))
}

export async function getInventoryValue({ breakdown = 'none' }) {
  if (breakdown === 'none') {
    const row = await queryOne(
      `SELECT
          'all' AS [Key],
          COUNT(DISTINCT fis.ProductKey) AS ProductCount,
          ISNULL(SUM(fis.CurrentQty), 0) AS CurrentQty,
          ISNULL(SUM(fis.CurrentQty * fis.ImportPrice), 0) AS InventoryValue
       FROM gold.Fact_Inventory_Snapshot fis
       WHERE fis.BatchDateKey = (SELECT MAX(BatchDateKey) FROM gold.Fact_Inventory_Snapshot)`
    )

    const totalValue = num(row?.InventoryValue)
    return {
      breakdown,
      totalValue,
      totalQty: num(row?.CurrentQty),
      groups: [{
        key: row?.Key || 'all',
        name: row?.Key || 'all',
        productCount: num(row?.ProductCount),
        currentQty: num(row?.CurrentQty),
        inventoryValue: totalValue,
        sharePercent: totalValue > 0 ? 100 : 0,
      }],
    }
  }

  const groupExpr = breakdown === 'category'
    ? `ISNULL(p.CategoryName, N'Uncategorized')`
    : `ISNULL(s.SupplierName, N'Unknown supplier')`
  const rows = await query(
    `SELECT
        ${groupExpr} AS [Key],
        COUNT(DISTINCT fis.ProductKey) AS ProductCount,
        ISNULL(SUM(fis.CurrentQty), 0) AS CurrentQty,
        ISNULL(SUM(fis.CurrentQty * fis.ImportPrice), 0) AS InventoryValue
     FROM gold.Fact_Inventory_Snapshot fis
     JOIN gold.Dim_Product p ON p.ProductKey = fis.ProductKey
     LEFT JOIN gold.Dim_Supplier s ON s.SupplierKey = fis.SupplierKey
     WHERE fis.BatchDateKey = (SELECT MAX(BatchDateKey) FROM gold.Fact_Inventory_Snapshot)
     GROUP BY ${groupExpr}
     ORDER BY InventoryValue DESC`
  )

  const totalValue = rows.reduce((sum, r) => sum + num(r.InventoryValue), 0)
  return {
    breakdown,
    totalValue,
    totalQty: rows.reduce((sum, r) => sum + num(r.CurrentQty), 0),
    groups: rows.map(r => ({
      key: r.Key,
      name: r.Key,
      productCount: num(r.ProductCount),
      currentQty: num(r.CurrentQty),
      inventoryValue: num(r.InventoryValue),
      sharePercent: pct(num(r.InventoryValue), totalValue),
    })),
  }
}

export async function getStockLossSummary({ startDate, endDate, groupBy = 'month' }) {
  const groupExpr = groupBy === 'product'
    ? 'p.ProductName'
    : groupBy === 'category'
      ? `ISNULL(p.CategoryName, N'Uncategorized')`
      : `FORMAT(d.FullDate, 'yyyy-MM')`
  const rows = await query(
    `SELECT
        ${groupExpr} AS [Key],
        ISNULL(SUM(fsl.QuantityWrittenOff), 0) AS LossQty,
        ISNULL(SUM(fsl.TotalLossAmount), 0) AS LossValue
     FROM gold.Fact_Stock_Loss fsl
     JOIN gold.Dim_Date d ON d.DateKey = fsl.WriteOffDateKey
     JOIN gold.Dim_Product p ON p.ProductKey = fsl.ProductKey
     WHERE ${dateInRange('d.FullDate', '@startDate', '@endDate')}
     GROUP BY ${groupExpr}
     ORDER BY LossValue DESC`,
    { startDate, endDate }
  )

  return rows.map(r => ({
    key: r.Key,
    groupName: r.Key,
    quantity: num(r.LossQty),
    lossQty: num(r.LossQty),
    lossValue: num(r.LossValue),
  }))
}

function linearForecast(points, forecastDays) {
  const values = points.map(point => num(point.revenue))
  if (!values.length) return []

  const n = values.length
  const meanX = (n - 1) / 2
  const meanY = values.reduce((sum, value) => sum + value, 0) / n
  const numerator = values.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0)
  const denominator = values.reduce((sum, _, index) => sum + (index - meanX) ** 2, 0) || 1
  const slope = numerator / denominator
  const intercept = meanY - slope * meanX
  const residuals = values.map((value, index) => value - (intercept + slope * index))
  const std = Math.sqrt(residuals.reduce((sum, value) => sum + value ** 2, 0) / Math.max(1, n - 1))
  const lastDate = new Date(`${points[points.length - 1].period}T00:00:00.000Z`)

  return Array.from({ length: forecastDays }, (_, index) => {
    const x = n + index
    const d = new Date(lastDate)
    d.setUTCDate(d.getUTCDate() + index + 1)
    const forecast = Math.max(0, intercept + slope * x)
    return {
      date: d.toISOString().slice(0, 10),
      revenue: Number(forecast.toFixed(2)),
      forecastRevenue: Number(forecast.toFixed(2)),
      lowerBound: Number(Math.max(0, forecast - 1.96 * std).toFixed(2)),
      upperBound: Number((forecast + 1.96 * std).toFixed(2)),
    }
  })
}

// FIX #4: Dùng ngày mới nhất từ DB thay vì GETDATE() để tránh khoảng trắng khi datamart bị lag
export async function forecastRevenue({ forecastDays = 30, model = 'linear' }) {
  const historyDays = model === 'seasonal' ? Math.max(90, forecastDays * 3) : Math.max(60, forecastDays * 3)

  // Lấy ngày mới nhất có data trong DB để làm mốc kéo lịch sử
  const latestRow = await queryOne(
    `SELECT CONVERT(VARCHAR(10), MAX(d.FullDate), 23) AS LatestDate
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey`
  )
  const latestDate = latestRow?.LatestDate
  if (!latestDate) {
    return { model, historyDays, averageDailyRevenue: 0, forecastDays, history: [], forecast: [], totalForecastRevenue: 0 }
  }

  const rows = await query(
    `SELECT
        CONVERT(VARCHAR(10), CAST(d.FullDate AS DATE), 23) AS Period,
        ISNULL(SUM(fs.GrossRevenue), 0) AS Revenue
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey
     WHERE d.FullDate >= DATEADD(DAY, -@historyDays, CAST(@latestDate AS DATE))
     GROUP BY d.FullDate
     ORDER BY d.FullDate`,
    { historyDays, latestDate }
  )

  const history = rows.map(r => ({ period: r.Period, revenue: num(r.Revenue) }))
  const forecast = linearForecast(history, forecastDays)
  const avgRevenue = history.length
    ? history.reduce((sum, r) => sum + r.revenue, 0) / history.length
    : 0

  return {
    model,
    historyDays,
    averageDailyRevenue: Number(avgRevenue.toFixed(2)),
    forecastDays,
    history,
    forecast,
    totalForecastRevenue: Number(forecast.reduce((sum, r) => sum + r.revenue, 0).toFixed(2)),
  }
}

export async function getMatrixDistribution({ startDate, endDate, includeInventoryValue = true }) {
  const rows = await query(
    `WITH ${matrixClassificationCtes()},
     Inventory AS (
       SELECT ProductKey, ISNULL(SUM(CurrentQty * ImportPrice), 0) AS InventoryValue
       FROM gold.Fact_Inventory_Snapshot
       WHERE BatchDateKey = (SELECT MAX(BatchDateKey) FROM gold.Fact_Inventory_Snapshot)
       GROUP BY ProductKey
     )
     SELECT
       cp.AbcClass,
       cp.XyzClass,
       COUNT(*) AS ProductCount,
       ISNULL(SUM(cp.Revenue), 0) AS Revenue,
       ISNULL(SUM(cp.QuantitySold), 0) AS QuantitySold,
       CASE WHEN @includeInventoryValue = 1 THEN ISNULL(SUM(i.InventoryValue), 0) ELSE NULL END AS InventoryValue
     FROM ClassifiedProducts cp
     LEFT JOIN Inventory i ON i.ProductKey = cp.ProductKey
     GROUP BY cp.AbcClass, cp.XyzClass
     ORDER BY cp.AbcClass, cp.XyzClass`,
    { startDate, endDate, includeInventoryValue }
  )

  const totalRevenue = rows.reduce((s, r) => s + num(r.Revenue), 0)
  const totalInventory = rows.reduce((s, r) => s + (includeInventoryValue ? num(r.InventoryValue) : 0), 0)

  return rows.map(r => ({
    abcClass: r.AbcClass,
    xyzClass: r.XyzClass,
    productCount: num(r.ProductCount),
    revenue: num(r.Revenue),
    quantity: num(r.QuantitySold),
    quantitySold: num(r.QuantitySold),
    inventoryValue: includeInventoryValue ? num(r.InventoryValue) : undefined,
    revenueShare: pct(num(r.Revenue), totalRevenue),
    inventoryShare: includeInventoryValue ? pct(num(r.InventoryValue), totalInventory) : undefined,
  }))
}

// FIX #8: Dùng CTE để tính AbcClass/XyzClass một lần rồi filter theo alias,
// tránh evaluate lại CASE WHEN trong WHERE clause
export async function getProductsByMatrix({
  abcClass,
  xyzClass,
  startDate,
  endDate,
  includeInventory = true,
  sortBy = 'revenue',
  limit = 50,
}) {
  const orderBy = MATRIX_SORT_EXPR[sortBy] || MATRIX_SORT_EXPR.revenue
  const sortDir = sortBy === 'daysOfStock' ? 'ASC' : 'DESC'
  const fallbackEndDate = new Date().toISOString().slice(0, 10)
  const fallbackStartDate = dateAdd(fallbackEndDate, -30)
  const effectiveStartDate = startDate || fallbackStartDate
  const effectiveEndDate = endDate || fallbackEndDate
  const rangeDays = daysBetween(effectiveStartDate, effectiveEndDate)

  // FIX #8: Tính class trong CTE ClassifiedProducts, sau đó WHERE dùng alias đã tính sẵn
  const rows = await query(
    `WITH ${matrixClassificationCtes()},
     FilteredProducts AS (
       SELECT *
       FROM ClassifiedProducts
       WHERE AbcClass = @abcClass AND XyzClass = @xyzClass
     ),
     Inventory AS (
       SELECT
         ProductKey,
         ISNULL(SUM(CurrentQty), 0) AS CurrentQty,
         ISNULL(SUM(CurrentQty * ImportPrice), 0) AS InventoryValue
       FROM gold.Fact_Inventory_Snapshot
       WHERE BatchDateKey = (SELECT MAX(BatchDateKey) FROM gold.Fact_Inventory_Snapshot)
       GROUP BY ProductKey
     ),
     Result AS (
       SELECT
         s.ProductKey,
         s.ProductName,
         s.CategoryName,
         s.AbcClass,
         s.XyzClass,
         s.Revenue,
         s.QuantitySold,
         CASE WHEN @includeInventory = 1 THEN ISNULL(i.CurrentQty, 0) ELSE NULL END AS CurrentQty,
         CASE WHEN @includeInventory = 1 THEN ISNULL(i.InventoryValue, 0) ELSE NULL END AS InventoryValue,
         CASE
           WHEN s.QuantitySold = 0 THEN NULL
           ELSE ISNULL(i.CurrentQty, 0) / NULLIF(s.QuantitySold / CAST(@rangeDays AS DECIMAL(18, 4)), 0)
         END AS DaysOfStock
       FROM FilteredProducts s
       LEFT JOIN Inventory i ON i.ProductKey = s.ProductKey
     )
     SELECT TOP (@limit) *
     FROM Result
     ORDER BY ${orderBy} ${sortDir}`,
    {
      abcClass,
      xyzClass,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      includeInventory,
      rangeDays,
      limit,
    }
  )

  return rows.map(r => ({
    productKey: r.ProductKey,
    medicineId: r.ProductKey,
    productName: r.ProductName,
    medicineName: r.ProductName,
    categoryName: r.CategoryName,
    abcClass: r.AbcClass,
    xyzClass: r.XyzClass,
    revenue: num(r.Revenue),
    quantity: num(r.QuantitySold),
    quantitySold: num(r.QuantitySold),
    ...(includeInventory ? {
      currentQty: num(r.CurrentQty),
      inventoryValue: num(r.InventoryValue),
      daysOfStock: r.DaysOfStock === null || r.DaysOfStock === undefined ? null : Number(Number(r.DaysOfStock).toFixed(1)),
    } : {}),
  }))
}

export async function getAnalyticsMeta() {
  const boundsRow = await queryOne(
    `SELECT
        CONVERT(VARCHAR(10), MIN(CAST(d.FullDate AS DATE)), 23) AS earliestSalesDate,
        CONVERT(VARCHAR(10), MAX(CAST(d.FullDate AS DATE)), 23) AS latestSalesDate
     FROM gold.Fact_Sales fs
     JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey`
  )
  return {
    earliestSalesDate: boundsRow?.earliestSalesDate || null,
    latestSalesDate: boundsRow?.latestSalesDate || null,
    datamartDatabase: process.env.DATAMART_DATABASE || 'HQT_BanChuan',
  }
}