import { useMemo, useState } from 'react'
import { useInventoryAlerts } from '../../context/InventoryAlertContext'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import {
  FaEye,
  FaSearch,
  FaTimes,
} from 'react-icons/fa'

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ'
}

export default function Customers() {
  useSetPageHeader(
    'Khách hàng',
    'Danh sách khách hàng được tự động tạo từ các đơn hàng phát sinh',
  )

  const { customersFromOrders, orders } = useInventoryAlerts()
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // Lọc danh sách khách hàng
  const filteredCustomers = useMemo(() => {
    return customersFromOrders.filter((item) => {
      const keyword = search.trim().toLowerCase()
      return (
        !keyword ||
        item.id.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword) ||
        item.phone.includes(keyword)
      )
    })
  }, [customersFromOrders, search])

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) return []
    const customerName = selectedCustomer.name.trim().toLowerCase()
    const customerPhone = selectedCustomer.phone.trim()

    return orders.filter((order) => {
      const orderName = (order.customerName || '').trim().toLowerCase()
      const orderPhone = (order.phone || '').trim()
      if (customerPhone) return orderPhone === customerPhone
      return orderName === customerName
    })
  }, [orders, selectedCustomer])

  return (
    <div className="w-full space-y-4 pt-0 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-[28px] bg-white p-5 shadow-lg ring-1 ring-slate-100">
          {/* TOOLBAR */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-slate-400 md:max-w-md">
              <FaSearch />
              <input
                type="text"
                placeholder="Tìm kiếm theo mã KH, tên, SĐT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-700 outline-none"
              />
            </div>

          </div>

          {/* TABLE */}
          <div className="mt-5 overflow-x-auto rounded-[22px] border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-sky-50 text-left text-slate-500">
                <tr>
                  <th className="whitespace-nowrap p-4">Mã KH</th>
                  <th className="whitespace-nowrap p-4">Tên khách hàng</th>
                  <th className="whitespace-nowrap p-4">Số điện thoại</th>
                  <th className="whitespace-nowrap p-4 text-right">Tổng bán</th>
                  <th className="whitespace-nowrap p-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedCustomer(item)}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 transition"
                    >
                      <td className="p-4 font-semibold text-slate-800">{item.id}</td>
                      <td className="p-4 font-medium text-blue-600">{item.name}</td>
                      <td className="p-4 text-slate-600">{item.phone}</td>
                      <td className="p-4 text-right font-semibold text-slate-800">
                        {formatMoney(item.totalSpent)}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCustomer(item)
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition hover:bg-blue-100"
                          title="Xem đơn đã mua"
                        >
                          <FaEye />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-10 text-center text-slate-400">
                      Không tìm thấy dữ liệu khách hàng
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION INFO */}
          <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
            <p>
              Hiển thị <span className="font-semibold">{filteredCustomers.length}</span> / Tổng số{' '}
              <span className="font-semibold">{customersFromOrders.length}</span> khách hàng
            </p>

            <div className="flex items-center gap-2">
              <button className="rounded-xl bg-slate-100 px-3 py-2 transition hover:bg-slate-200">1</button>
              <button className="rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-100 transition">2</button>
            </div>
          </div>
        </div>
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Đơn hàng của {selectedCustomer.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedCustomer.phone || 'Không có số điện thoại'} · Tổng mua{' '}
                  {formatMoney(selectedCustomer.totalSpent)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
              >
                <FaTimes />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-6">
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap p-4">Mã HĐ</th>
                      <th className="whitespace-nowrap p-4">Thời gian</th>
                      <th className="whitespace-nowrap p-4">Nhân viên</th>
                      <th className="whitespace-nowrap p-4">Sản phẩm</th>
                      <th className="whitespace-nowrap p-4 text-right">Tổng tiền</th>
                      <th className="whitespace-nowrap p-4 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCustomerOrders.map((order) => (
                      <tr key={order.id} className="border-t border-slate-100">
                        <td className="p-4 font-semibold text-slate-800">{order.id}</td>
                        <td className="p-4 text-slate-600">{order.date}</td>
                        <td className="p-4 text-slate-600">{order.createdBy || '-'}</td>
                        <td className="p-4 text-slate-700">
                          {(order.items || [])
                            .map((line) => `${line.name} x${line.qty}`)
                            .join(', ') || '-'}
                        </td>
                        <td className="p-4 text-right font-semibold text-slate-800">
                          {formatMoney(order.total)}
                        </td>
                        <td className="p-4 text-center">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                              order.status === 'Đã hủy'
                                ? 'bg-red-50 text-red-600'
                                : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {order.status || 'Hoàn thành'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {selectedCustomerOrders.length === 0 && (
                      <tr>
                        <td colSpan="6" className="p-10 text-center text-slate-400">
                          Chưa tìm thấy đơn hàng của khách hàng này
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}