import { useEffect, useMemo, useState } from 'react'
import { FaShoppingCart, FaPills, FaMoneyBillWave } from 'react-icons/fa'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import { getSalesInvoiceById, getSalesInvoices } from '../../api/salesInvoiceService'
import { mapInvoiceToOrder } from '../../api/mappers'

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ'
}

function getTodayRange() {
  const to = new Date()
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

export default function StaffHome() {
  useSetPageHeader(
    'Tổng quan bán hàng',
    'Theo dõi tiến độ bán hàng và công việc trong ngày của bạn',
  )

  const currentUser = useMemo(
    () => JSON.parse(localStorage.getItem('user') || 'null'),
    [],
  )
  const staffName = currentUser?.name || 'Nhân viên'
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadTodayOrders() {
      setLoading(true)
      try {
        const today = getTodayRange()
        const { items } = await getSalesInvoices({
          from: today.from,
          to: today.to,
          page: 1,
          limit: 100,
          status: 'Hoàn thành',
        })

        const detailed = await Promise.all(
          items.map(async (invoice) => {
            try {
              const detail = await getSalesInvoiceById(invoice.invoiceId)
              return mapInvoiceToOrder(detail, detail.lines || [])
            } catch {
              return mapInvoiceToOrder(invoice, [])
            }
          }),
        )

        if (!cancelled) {
          setOrders(
            detailed.sort(
              (a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date),
            ),
          )
        }
      } catch {
        if (!cancelled) setOrders([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTodayOrders()
    return () => {
      cancelled = true
    }
  }, [currentUser?.employeeId])

  const shiftData = useMemo(() => {
    return {
      ordersToday: orders.length,
      itemsSold: orders.reduce(
        (sum, order) =>
          sum + order.items.reduce((itemSum, line) => itemSum + (Number(line.qty) || 0), 0),
        0,
      ),
      revenue: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    }
  }, [orders])

  return (
    <div className="w-full space-y-6 pt-0 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="group rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white">
              <FaShoppingCart size={24} />
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-500">Đơn hàng đã bán</p>
          <h3 className="mt-1 text-3xl font-bold text-slate-900">{shiftData.ordersToday}</h3>
        </div>

        <div className="group rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 transition group-hover:scale-110 group-hover:bg-orange-500 group-hover:text-white">
              <FaPills size={24} />
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-500">Sản phẩm bán ra</p>
          <h3 className="mt-1 text-3xl font-bold text-slate-900">{shiftData.itemsSold}</h3>
        </div>

        <div className="group rounded-[24px] bg-gradient-to-br from-emerald-500 to-teal-500 p-6 text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/40">
          <div className="flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm transition group-hover:scale-110">
              <FaMoneyBillWave size={24} />
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-emerald-50">Doanh thu trong ngày</p>
          <h3 className="mt-1 text-3xl font-bold">{formatMoney(shiftData.revenue)}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Đơn hàng gần đây của bạn</h2>
              <p className="mt-1 text-sm text-slate-500">Hóa đơn hoàn thành trong ngày — {staffName}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-[22px] border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="whitespace-nowrap p-4 font-medium">Mã đơn</th>
                  <th className="whitespace-nowrap p-4 font-medium">Khách hàng</th>
                  <th className="whitespace-nowrap p-4 font-medium">Giờ tạo</th>
                  <th className="whitespace-nowrap p-4 text-right font-medium">Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">
                      Đang tải đơn hàng...
                    </td>
                  </tr>
                ) : (
                  orders.slice(0, 8).map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                      <td className="p-4 font-semibold text-slate-800">{item.id}</td>
                      <td className="p-4 text-slate-700">{item.customerName}</td>
                      <td className="p-4 text-slate-500">
                        {new Date(item.createdAt || item.date).toLocaleTimeString('vi-VN')}
                      </td>
                      <td className="p-4 text-right font-semibold text-slate-800">
                        {formatMoney(item.total)}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && orders.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">
                      Chưa có đơn hàng nào do tài khoản này tạo hôm nay
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
