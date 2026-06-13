import { query, queryOne } from '../config/db.js'
import { vnDateSql, vnDayKeySql, vnMonthSql } from '../utils/vnDateSql.js'

// helper - dam bao gia tri tra ve la so (mssql co the tra null hoac BigInt)
function num(v) {
  if (v === null || v === undefined) return 0
  return Number(v)
}

// =====================================================================
// 1. PROFIT & LOSS
// =====================================================================
export async function getProfitLoss(from, to) {
  // su dung pattern >= @from AND < @toPlus1 de bao gom ca ngay 'to'
  const params = { from, to }

  const rev = await queryOne(
    `SELECT ISNULL(SUM(TotalAmount), 0) AS Revenue
     FROM dbo.SalesInvoice
     WHERE ${vnDateSql('InvoiceDate')} BETWEEN @from AND @to
       AND Status IN ('COMPLETED', 'RETURNED')`,
    params
  )

  const refund = await queryOne(
    `SELECT ISNULL(SUM(TotalRefund), 0) AS TotalRefund
     FROM dbo.SalesReturn
     WHERE ${vnDateSql('ReturnDate')} BETWEEN @from AND @to
       AND Status = 'COMPLETED'`,
    params
  )

  const cogs = await queryOne(
    `SELECT ISNULL(SUM(l.Quantity * l.CostPriceSnapshot), 0) AS COGS
     FROM dbo.SalesInvoiceLine l
     JOIN dbo.SalesInvoice i ON i.InvoiceId = l.InvoiceId
     WHERE ${vnDateSql('i.InvoiceDate')} BETWEEN @from AND @to
       AND i.Status IN ('COMPLETED', 'RETURNED')`,
    params
  )

  const disposal = await queryOne(
    `SELECT ISNULL(SUM(TotalCost), 0) AS DisposalCost
     FROM dbo.StockWriteOff
     WHERE ${vnDateSql('WriteOffDate')} BETWEEN @from AND @to
       AND Status = 'COMPLETED'`,
    params
  )

  const purchase = await queryOne(
    `SELECT ISNULL(SUM(TotalAmount), 0) AS PurchaseCost
     FROM dbo.PurchaseReceipt
     WHERE ${vnDateSql('ReceiptDate')} BETWEEN @from AND @to
       AND Status = 'COMPLETED'`,
    params
  )

  const revenue = num(rev?.Revenue)
  const totalRefund = num(refund?.TotalRefund)
  const netRevenue = revenue - totalRefund
  const cogsValue = num(cogs?.COGS)
  const grossProfit = netRevenue - cogsValue
  const grossMargin = netRevenue > 0 ? Number((grossProfit / netRevenue * 100).toFixed(2)) : 0
  const disposalCost = num(disposal?.DisposalCost)
  const operatingProfit = grossProfit - disposalCost
  const purchaseCost = num(purchase?.PurchaseCost)

  return {
    period: { from, to },
    revenue,
    totalRefund,
    netRevenue,
    cogs: cogsValue,
    grossProfit,
    grossMargin,
    disposalCost,
    operatingProfit,
    purchaseCost,
  }
}

// =====================================================================
// 2. REVENUE theo ngay/thang
// =====================================================================
export async function getRevenue(groupBy, from, to) {
  const params = { from, to }
  const periodExpr =
    groupBy === 'month'
      ? vnMonthSql('i.InvoiceDate')
      : vnDayKeySql('i.InvoiceDate')

  const rows = await query(
    `SELECT
        ${periodExpr} AS Period,
        COUNT(DISTINCT i.InvoiceId) AS InvoiceCount,
        ISNULL(SUM(l.LineTotal), 0) AS GrossRevenue,
        ISNULL(SUM(l.Quantity * l.CostPriceSnapshot), 0) AS COGS,
        ISNULL(SUM(l.LineTotal - l.Quantity * l.CostPriceSnapshot), 0) AS GrossProfit
     FROM dbo.SalesInvoice i
     JOIN dbo.SalesInvoiceLine l ON l.InvoiceId = i.InvoiceId
     WHERE i.Status IN ('COMPLETED', 'RETURNED')
       AND ${vnDateSql('i.InvoiceDate')} BETWEEN @from AND @to
     GROUP BY ${periodExpr}
     ORDER BY Period ASC`,
    params
  )

  const refundPeriodExpr =
    groupBy === 'month'
      ? vnMonthSql('r.ReturnDate')
      : vnDayKeySql('r.ReturnDate')

  const refundRows = await query(
    `SELECT
        ${refundPeriodExpr} AS Period,
        ISNULL(SUM(r.TotalRefund), 0) AS Refund
     FROM dbo.SalesReturn r
     WHERE r.Status = 'COMPLETED'
       AND ${vnDateSql('r.ReturnDate')} BETWEEN @from AND @to
     GROUP BY ${refundPeriodExpr}`,
    params,
  )

  const refundMap = new Map(refundRows.map((row) => [row.Period, num(row.Refund)]))
  const periodSet = new Set([
    ...rows.map((row) => row.Period),
    ...refundRows.map((row) => row.Period),
  ])

  return [...periodSet]
    .sort()
    .map((period) => {
      const row = rows.find((item) => item.Period === period)
      const grossRevenue = num(row?.GrossRevenue)
      const refund = refundMap.get(period) || 0
      return {
        period,
        invoiceCount: row?.InvoiceCount || 0,
        revenue: grossRevenue - refund,
        grossRevenue,
        refund,
        cogs: num(row?.COGS),
        grossProfit: num(row?.GrossProfit) - refund,
      }
    })
}

// =====================================================================
// 3. TOP MEDICINES
// =====================================================================
export async function getTopMedicines(from, to, limit = 10) {
  const rows = await query(
    `SELECT TOP (@limit)
        l.MedicineId,
        l.MedicineNameSnapshot,
        SUM(l.Quantity) AS TotalQuantitySold,
        SUM(l.LineTotal) AS TotalRevenue,
        SUM(l.LineTotal - l.Quantity * l.CostPriceSnapshot) AS TotalProfit,
        COUNT(DISTINCT l.InvoiceId) AS InvoiceCount
     FROM dbo.SalesInvoiceLine l
     JOIN dbo.SalesInvoice i ON i.InvoiceId = l.InvoiceId
     WHERE i.Status IN ('COMPLETED', 'RETURNED')
       AND ${vnDateSql('i.InvoiceDate')} BETWEEN @from AND @to
     GROUP BY l.MedicineId, l.MedicineNameSnapshot
     ORDER BY TotalQuantitySold DESC`,
    { from, to, limit }
  )

  return rows.map(r => ({
    medicineId: r.MedicineId,
    medicineName: r.MedicineNameSnapshot,
    totalQuantitySold: r.TotalQuantitySold,
    totalRevenue: num(r.TotalRevenue),
    totalProfit: num(r.TotalProfit),
    invoiceCount: r.InvoiceCount,
  }))
}

// =====================================================================
// 4. INVENTORY VALUE
// =====================================================================
export async function getInventoryValue() {
  const rows = await query(
    `SELECT
        m.MedicineId, m.MedicineName,
        u.UnitName,
        SUM(b.CurrentQty) AS TotalQty,
        SUM(b.CurrentQty * b.ImportPrice) AS InventoryValue,
        MIN(b.ExpiryDate) AS EarliestExpiry
     FROM dbo.MedicineBatch b
     JOIN dbo.Medicine m ON m.MedicineId = b.MedicineId
     JOIN dbo.Unit u ON u.UnitId = m.UnitId
     WHERE b.CurrentQty > 0
     GROUP BY m.MedicineId, m.MedicineName, u.UnitName
     ORDER BY InventoryValue DESC`
  )

  const items = rows.map(r => ({
    medicineId: r.MedicineId,
    medicineName: r.MedicineName,
    unitName: r.UnitName,
    totalQty: r.TotalQty,
    inventoryValue: num(r.InventoryValue),
    earliestExpiry: r.EarliestExpiry,
  }))

  const totalValue = items.reduce((s, x) => s + x.inventoryValue, 0)

  return {
    items,
    summary: {
      totalItems: items.length,
      totalValue,
      asOf: new Date().toISOString(),
    },
  }
}

// =====================================================================
// 5. DISPOSAL COST
// =====================================================================
export async function getDisposalCost(from, to) {
  const rows = await query(
    `SELECT
        w.WriteOffId,
        ${vnDateSql('w.WriteOffDate')} AS WriteOffDate,
        w.TotalCost,
        w.Reason,
        e.FullName AS EmployeeName,
        (SELECT COUNT(*) FROM dbo.StockWriteOffLine WHERE WriteOffId = w.WriteOffId) AS LineCount
     FROM dbo.StockWriteOff w
     JOIN dbo.Employee e ON e.EmployeeId = w.EmployeeId
     WHERE ${vnDateSql('w.WriteOffDate')} BETWEEN @from AND @to
       AND w.Status = 'COMPLETED'
     ORDER BY w.WriteOffDate DESC`,
    { from, to }
  )

  const list = rows.map(r => ({
    writeOffId: r.WriteOffId,
    writeOffDate: r.WriteOffDate,
    totalCost: num(r.TotalCost),
    reason: r.Reason,
    employeeName: r.EmployeeName,
    lineCount: r.LineCount,
  }))

  const totalDisposalCost = list.reduce((s, x) => s + x.totalCost, 0)

  return {
    list,
    summary: {
      writeOffCount: list.length,
      totalDisposalCost,
    },
  }
}
