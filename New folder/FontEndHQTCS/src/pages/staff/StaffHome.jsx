import { useMemo } from 'react'
import { FaShoppingCart, FaPills, FaMoneyBillWave } from 'react-icons/fa'
import { useInventoryAlerts } from '../../context/InventoryAlertContext'
import { useSetPageHeader } from '../../context/PageHeaderContext'

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ'
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
  const { orders } = useInventoryAlerts()

  const myRecentOrders = useMemo(
    () => orders.filter((item) => item.createdBy === staffName),
    [orders, staffName],
  )

  const shiftData = useMemo(() => {
    const today = new Date().toLocaleDateString('vi-VN')
    const todayOrders = myRecentOrders.filter(
      (item) => new Date(item.createdAt || item.date).toLocaleDateString('vi-VN') === today,
    )
    return {
      ordersToday: todayOrders.length,
      itemsSold: todayOrders.reduce(
        (sum, order) =>
          sum +
          order.items.reduce((itemSum, line) => itemSum + (Number(line.qty) || 0), 0),
        0,
      ),
      revenue: todayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    }
  }, [myRecentOrders])

  return (
    <div className="w-full space-y-6 pt-0 animate-in fade-in duration-300">
      {/* STATS CARDS */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Đơn hàng */}
        <div className="group rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white">
              <FaShoppingCart size={24} />
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-500">Đơn hàng đã bán</p>
          <h3 className="mt-1 text-3xl font-bold text-slate-900">{shiftData.ordersToday}</h3>
        </div>

        {/* Sản phẩm đã bán (Thay cho Ca làm) */}
        <div className="group rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100 transition hover:shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 transition group-hover:scale-110 group-hover:bg-orange-500 group-hover:text-white">
              <FaPills size={24} />
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-500">Sản phẩm bán ra</p>
          <h3 className="mt-1 text-3xl font-bold text-slate-900">{shiftData.itemsSold}</h3>
        </div>

        {/* Doanh thu */}
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
                {myRecentOrders.slice(0, 8).map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                    <td className="p-4 font-semibold text-slate-800">{item.id}</td>
                    <td className="p-4 text-slate-700">{item.customerName}</td>
                    <td className="p-4 text-slate-500">
                      {new Date(item.createdAt || item.date).toLocaleTimeString('vi-VN')}
                    </td>
                    <td className="p-4 text-right font-semibold text-slate-800">
                      {formatMoney(item.total)}
                    </td>
                  </tr>
                ))}
                {myRecentOrders.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-400">
                      Chưa có đơn hàng nào do tài khoản này tạo
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