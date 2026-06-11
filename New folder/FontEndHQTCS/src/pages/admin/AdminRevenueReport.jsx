import { useEffect, useMemo, useState } from 'react'
import { FaCalendarAlt } from 'react-icons/fa'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { useInventoryAlerts } from '../../context/InventoryAlertContext'
import * as reportApi from '../../api/reportService'

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
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function AdminRevenueReport() {
  const [dateFilter, setDateFilter] = useState('week')
  const [revenueRows, setRevenueRows] = useState([])
  const [topMedicines, setTopMedicines] = useState([])
  const [summary, setSummary] = useState(null)
  const { orders } = useInventoryAlerts()

  useEffect(() => {
    const { from, to } = getDateRange(dateFilter)
    Promise.all([
      reportApi.getRevenue(from, to, 'day'),
      reportApi.getTopMedicines(from, to, 10),
      reportApi.getProfitLoss(from, to),
    ])
      .then(([revenue, top, profitLoss]) => {
        setRevenueRows(
          (revenue || []).map((row, index) => ({
            name: row.period?.slice(5) || `D${index + 1}`,
            revenue: Number(row.revenue || 0),
            orders: Number(row.invoiceCount || 0),
          })),
        )
        setTopMedicines(
          (top || []).map((item) => ({
            id: item.medicineId,
            name: item.medicineName,
            qty: Number(item.totalQuantitySold || 0),
            revenue: Number(item.totalRevenue || 0),
          })),
        )
        setSummary(profitLoss)
      })
      .catch(() => {
        setRevenueRows([])
        setTopMedicines([])
        setSummary(null)
      })
  }, [dateFilter])

  const revenueByEmployee = useMemo(
    () =>
      Object.values(
        orders.reduce((acc, order) => {
          if (order.status === 'Đã hủy') return acc
          const employeeName = order.createdBy || 'Không xác định'
          acc[employeeName] = acc[employeeName] || {
            name: employeeName,
            orders: 0,
            revenue: 0,
          }
          acc[employeeName].orders += 1
          acc[employeeName].revenue += Number(order.total || 0)
          return acc
        }, {}),
      ),
    [orders],
  )

  const chartData = revenueRows.length > 0 ? revenueRows : [{ name: '-', revenue: 0, orders: 0 }]
  const totalRevenue = Number(summary?.netRevenue ?? summary?.revenue ?? 0)
  const totalOrders = orders.filter((o) => o.status !== 'Đã hủy').length

  return (
    <section id="bao-cao-doanh-thu" className="scroll-mt-6 space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Báo cáo doanh thu</h2>
          <p className="mt-1 text-sm text-slate-500">
            Dữ liệu từ API backend theo khoảng thời gian đã chọn
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
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000000)}M`} />
                <RechartsTooltip formatter={(value) => formatMoney(value)} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
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
