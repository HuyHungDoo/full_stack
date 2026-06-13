import { useEffect, useMemo, useState } from 'react'
import { FaCalendarAlt } from 'react-icons/fa'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import * as reportApi from '../../api/reportService'
import { getAllSalesInvoices } from '../../api/salesInvoiceService'
import { formatLocalDate } from '../../utils/dateUtils'

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(
    Number(value || 0),
  )
}

function getDateRange(filter) {
  const to = new Date()
  const from = new Date()
  if (filter === 'day') {
    from.setHours(0, 0, 0, 0)
  } else if (filter === 'week') {
    from.setDate(from.getDate() - 6)
  } else if (filter === 'month') {
    from.setDate(1)
  } else {
    from.setMonth(0, 1)
  }
  return {
    from: formatLocalDate(from),
    to: formatLocalDate(to),
  }
}

function getChartGroupBy(filter) {
  return filter === 'year' ? 'month' : 'day'
}

function eachDayInRange(from, to) {
  const periods = []
  const cur = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (cur <= end) {
    periods.push(formatLocalDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return periods
}

function eachMonthInRange(from, to) {
  const periods = []
  const cur = new Date(`${from.slice(0, 7)}-01T12:00:00`)
  const end = new Date(`${to.slice(0, 7)}-01T12:00:00`)
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    periods.push(`${y}-${m}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return periods
}

function formatChartLabel(period, groupBy) {
  if (groupBy === 'month') {
    const [y, m] = period.split('-')
    return `${m}/${y}`
  }
  const [, m, d] = period.split('-')
  return `${d}/${m}`
}

/** Điền đủ các mốc thời gian trong khoảng lọc — ngày/tháng không có HĐ = 0. */
function buildChartSeries(apiRows, from, to, groupBy) {
  const rowMap = new Map((apiRows || []).map((row) => [row.period, row]))
  const periods = groupBy === 'month' ? eachMonthInRange(from, to) : eachDayInRange(from, to)

  const series = periods.map((period) => {
    const row = rowMap.get(period)
    return {
      name: formatChartLabel(period, groupBy),
      period,
      revenue: Number(row?.revenue || 0),
      orders: Number(row?.invoiceCount || 0),
    }
  })

  return series.length > 0 ? series : [{ name: '-', period: '', revenue: 0, orders: 0 }]
}

export default function AdminRevenueReport() {
  const [dateFilter, setDateFilter] = useState('week')
  const [revenueRows, setRevenueRows] = useState([])
  const [topMedicines, setTopMedicines] = useState([])
  const [summary, setSummary] = useState(null)
  const [periodInvoices, setPeriodInvoices] = useState([])

  const dateRange = useMemo(() => getDateRange(dateFilter), [dateFilter])
  const chartGroupBy = getChartGroupBy(dateFilter)

  useEffect(() => {
    const { from, to } = getDateRange(dateFilter)
    const groupBy = getChartGroupBy(dateFilter)
    Promise.all([
      reportApi.getRevenue(from, to, groupBy),
      reportApi.getTopMedicines(from, to, 10),
      reportApi.getProfitLoss(from, to),
      getAllSalesInvoices({ from, to, status: 'Hoàn thành' }),
    ])
      .then(([revenue, top, profitLoss, invoices]) => {
        setRevenueRows(revenue || [])
        setTopMedicines(
          (top || []).map((item) => ({
            id: item.medicineId,
            name: item.medicineName,
            qty: Number(item.totalQuantitySold || 0),
            revenue: Number(item.totalRevenue || 0),
          })),
        )
        setSummary(profitLoss)
        setPeriodInvoices(invoices || [])
      })
      .catch(() => {
        setRevenueRows([])
        setTopMedicines([])
        setSummary(null)
        setPeriodInvoices([])
      })
  }, [dateFilter])

  const revenueByEmployee = useMemo(
    () =>
      Object.values(
        periodInvoices.reduce((acc, invoice) => {
          const employeeName = invoice.employeeName || 'Không xác định'
          acc[employeeName] = acc[employeeName] || {
            name: employeeName,
            orders: 0,
            revenue: 0,
          }
          acc[employeeName].orders += 1
          acc[employeeName].revenue += Number(invoice.totalAmount || 0)
          return acc
        }, {}),
      ).sort((a, b) => b.revenue - a.revenue),
    [periodInvoices],
  )

  const chartData = useMemo(
    () => buildChartSeries(revenueRows, dateRange.from, dateRange.to, chartGroupBy),
    [revenueRows, dateRange, chartGroupBy],
  )
  const totalRevenue = Number(summary?.netRevenue ?? summary?.revenue ?? 0)
  const totalOrders = revenueRows.reduce((sum, row) => sum + Number(row.invoiceCount || 0), 0)

  return (
    <section id="bao-cao-doanh-thu" className="scroll-mt-6 space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Báo cáo doanh thu</h2>
          <p className="mt-1 text-sm text-slate-500">
            Doanh thu biểu đồ và thẻ tổng đều là doanh thu thuần (đã trừ hoàn tiền)
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center gap-2">
            <FaCalendarAlt className="text-slate-400" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 transition"
            >
              <option value="day">Hôm nay</option>
              <option value="week">Tuần này</option>
              <option value="month">Tháng này</option>
              <option value="year">Năm nay</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-[24px] bg-gradient-to-br from-blue-500 to-blue-700 p-6 text-white shadow-lg shadow-blue-500/20">
            <p className="text-blue-100 font-medium">Tổng doanh thu</p>
            <h3 className="mt-2 text-3xl font-bold">{formatMoney(totalRevenue)}</h3>
            <p className="mt-2 text-sm text-blue-200">
              Lợi nhuận gộp: {formatMoney(summary?.grossProfit || 0)}
            </p>
          </div>
          <div className="rounded-[24px] bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-lg shadow-emerald-500/20">
            <p className="text-emerald-100 font-medium">Tổng đơn hàng</p>
            <h3 className="mt-2 text-3xl font-bold">{totalOrders}</h3>
            <p className="mt-2 text-sm text-emerald-200">
              Giá vốn: {formatMoney(summary?.cogs || 0)}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <h3 className="mb-6 text-lg font-bold text-slate-800">Biểu đồ doanh thu</h3>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />
                <RechartsTooltip
                  formatter={(value, name) => {
                    if (name === 'orders') return [value, 'Đơn hàng']
                    return [formatMoney(value), 'Doanh thu thuần']
                  }}
                  labelFormatter={(label, payload) => {
                    const period = payload?.[0]?.payload?.period
                    if (!period) return label
                    const prefix = chartGroupBy === 'month' ? 'Tháng' : 'Ngày'
                    return `${prefix} ${formatChartLabel(period, chartGroupBy)}`
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="revenue"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h3 className="mb-4 text-lg font-bold text-slate-800">Top thuốc bán chạy</h3>
            <div className="space-y-3">
              {topMedicines.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có dữ liệu bán hàng.</p>
              ) : (
                topMedicines.map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-800">{index + 1}. {item.name}</p>
                      <p className="text-xs text-slate-500">SL: {item.qty}</p>
                    </div>
                    <p className="font-bold text-blue-600">{formatMoney(item.revenue)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h3 className="mb-4 text-lg font-bold text-slate-800">Doanh thu theo nhân viên</h3>
            <div className="space-y-3">
              {revenueByEmployee.length === 0 ? (
                <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>
              ) : (
                revenueByEmployee.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.orders} đơn</p>
                    </div>
                    <p className="font-bold text-emerald-600">{formatMoney(item.revenue)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
