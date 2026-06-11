import { useEffect, useMemo, useState } from 'react'
import {
  FaArrowUp,
  FaArrowDown,
  FaCapsules,
  FaUserFriends,
  FaFileInvoiceDollar,
  FaWarehouse,
  FaArrowRight,
} from 'react-icons/fa'
import { useInventoryAlerts } from '../../context/InventoryAlertContext'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import AdminAnalyticsChatbot from '../../components/common/AdminAnalyticsChatbot'
import AdminRevenueReport from './AdminRevenueReport'
import * as reportApi from '../../api/reportService'

function formatMoneyShort(value) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))}đ`
}

function getMonthRange() {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth(), 1)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function getTodayRange() {
  const to = new Date()
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export default function AdminHome() {
  useSetPageHeader(
    'Tổng quan',
    'Theo dõi doanh thu, tồn kho, đơn hàng và hiệu suất hoạt động',
  )
  const {
    lowStockAlerts,
    customersFromOrders,
    orderStatusSummary,
  } = useInventoryAlerts()
  const closedOrdersCount = orderStatusSummary.completed + orderStatusSummary.cancelled
  const [monthSummary, setMonthSummary] = useState(null)
  const [todaySummary, setTodaySummary] = useState(null)

  useEffect(() => {
    const month = getMonthRange()
    const today = getTodayRange()
    reportApi.getProfitLoss(month.from, month.to).then(setMonthSummary).catch(() => setMonthSummary(null))
    reportApi.getProfitLoss(today.from, today.to).then(setTodaySummary).catch(() => setTodaySummary(null))
  }, [])

  const stats = useMemo(
    () => [
      {
        title: 'Doanh thu tháng',
        value: formatMoneyShort(monthSummary?.netRevenue ?? monthSummary?.revenue ?? 0),
        change: '+12.5%',
        up: true,
        icon: <FaFileInvoiceDollar size={20} />,
      },
      {
        title: 'Đơn hàng',
        value: closedOrdersCount.toLocaleString('vi-VN'),
        change: `${orderStatusSummary.cancelled} đã hủy`,
        up: orderStatusSummary.cancelled === 0,
        icon: <FaCapsules size={20} />,
      },
      {
        title: 'Khách hàng',
        value: customersFromOrders.length.toLocaleString('vi-VN'),
        change: `${orderStatusSummary.completed} hoàn thành`,
        up: true,
        icon: <FaUserFriends size={20} />,
      },
      {
        title: 'Thuốc sắp hết hàng',
        value: String(lowStockAlerts.length),
        change:
          orderStatusSummary.cancelled > 0
            ? `${orderStatusSummary.cancelled} đơn đã hủy`
            : lowStockAlerts.length > 0
            ? 'Cần điều chỉnh trong kho'
            : 'Ổn định',
        up: lowStockAlerts.length === 0,
        icon: <FaWarehouse size={20} />,
      },
    ],
    [
      customersFromOrders.length,
      closedOrdersCount,
      lowStockAlerts.length,
      monthSummary,
      orderStatusSummary.cancelled,
      orderStatusSummary.completed,
    ],
  )

  return (
    <div className="w-full space-y-6 pt-0 animate-in fade-in duration-300">
      {/* SECTION 1: HERO BANNER */}
      <section>
        <div className="overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-8 text-white shadow-xl shadow-emerald-600/20">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="flex flex-col justify-center">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-100">
                Hệ thống quản lý nhà thuốc
              </p>
              <h1 className="mt-3 text-4xl font-bold leading-tight">
                Xin chào, Quản trị viên
              </h1>
              <p className="mt-4 max-w-xl text-emerald-50 leading-relaxed">
                Theo dõi doanh thu, tồn kho, đơn hàng và hiệu suất hoạt động trong
                một giao diện tập trung và trực quan.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#bao-cao-doanh-thu"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 font-bold text-emerald-700 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  Xem báo cáo <FaArrowRight size={12} />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-3xl bg-white/10 p-5 backdrop-blur-sm border border-white/10">
                <p className="text-sm font-medium text-emerald-100">Doanh thu hôm nay</p>
                <h3 className="mt-2 text-2xl font-bold">{formatMoneyShort(todaySummary?.netRevenue ?? todaySummary?.revenue ?? 0)}</h3>
              </div>

              <div className="rounded-3xl bg-white/10 p-5 backdrop-blur-sm border border-white/10">
                <p className="text-sm font-medium text-emerald-100">Đơn hôm nay</p>
                <h3 className="mt-2 text-2xl font-bold">{orderStatusSummary.completed}</h3>
              </div>

              <div className="rounded-3xl bg-white/10 p-5 backdrop-blur-sm border border-white/10">
                <p className="text-sm font-medium text-emerald-100">Khách mới</p>
                <h3 className="mt-2 text-2xl font-bold">{customersFromOrders.length}</h3>
              </div>

              <div className="rounded-3xl bg-white/10 p-5 backdrop-blur-sm border border-white/10">
                <p className="text-sm font-medium text-emerald-100">Cảnh báo kho</p>
                <h3 className="mt-2 text-2xl font-bold">{lowStockAlerts.length}</h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: STATS CARDS */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.title}
            className="group rounded-[26px] bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 transition group-hover:scale-110">
                {item.icon}
              </div>

              <div
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                  item.up
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-rose-50 text-rose-600'
                }`}
              >
                {item.up ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
                {item.change}
              </div>
            </div>

            <p className="mt-6 text-sm font-medium text-slate-500">{item.title}</p>
            <h3 className="mt-1 text-3xl font-bold text-slate-900">{item.value}</h3>
          </div>
        ))}
      </section>

      {/* SECTION 3: Báo cáo doanh thu */}
      <AdminRevenueReport />

      <AdminAnalyticsChatbot />

    </div>
  )
}
