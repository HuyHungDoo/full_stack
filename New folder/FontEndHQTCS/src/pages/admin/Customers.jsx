import { useCallback, useState } from 'react'
import Pagination from '../../components/common/Pagination'
import { getCustomerInvoices, getCustomers } from '../../api/customerService'
import { mapCustomerToFe, mapInvoiceStatusToFe } from '../../api/mappers'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import { PAGE_SIZE } from '../../hooks/usePagination'
import { useServerPagination } from '../../hooks/useServerPagination'
import {
  FaEye,
  FaSearch,
  FaTimes,
} from 'react-icons/fa'

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ'
}

function mapCustomerInvoiceRow(invoice) {
  return {
    id: invoice.invoiceId,
    date: new Date(invoice.invoiceDate).toLocaleString('vi-VN', { hour12: false }),
    createdBy: invoice.employeeName || '-',
    productSummary: `${invoice.itemCount || 0} sản phẩm`,
    total: Number(invoice.totalAmount || 0),
    status: mapInvoiceStatusToFe(invoice.status),
  }
}

export default function Customers() {
  useSetPageHeader(
    'Khách hàng',
    'Danh sách khách hàng được tự động tạo từ các đơn hàng phát sinh',
  )

  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const fetchCustomers = useCallback(
    async (page) => {
      const result = await getCustomers({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
      })
      return {
        items: result.items.map(mapCustomerToFe),
        meta: result.meta,
      }
    },
    [search],
  )

  const {
    items: customers,
    page,
    setPage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    loading,
  } = useServerPagination(fetchCustomers, [search])

  const fetchCustomerOrders = useCallback(
    async (orderPage) => {
      if (!selectedCustomer?.id) {
        return { items: [], meta: { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 } }
      }
      const result = await getCustomerInvoices(selectedCustomer.id, {
        page: orderPage,
        limit: PAGE_SIZE,
      })
      return {
        items: result.items.map(mapCustomerInvoiceRow),
        meta: result.meta,
      }
    },
    [selectedCustomer?.id],
  )

  const {
    items: customerOrders,
    page: orderPage,
    setPage: setOrderPage,
    totalPages: orderTotalPages,
    totalItems: orderTotalItems,
    startIndex: orderStartIndex,
    endIndex: orderEndIndex,
    loading: ordersLoading,
  } = useServerPagination(fetchCustomerOrders, [selectedCustomer?.id])

  return (
    <div className="w-full space-y-4 pt-0 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-6">
        <div className="rounded-[28px] bg-white p-5 shadow-lg ring-1 ring-slate-100">
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
                {loading ? (
                  <tr>
                    <td colSpan="5" className="p-10 text-center text-slate-400">
                      Đang tải danh sách khách hàng...
                    </td>
                  </tr>
                ) : customers.length > 0 ? (
                  customers.map((item) => (
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

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={setPage}
            loading={loading}
            itemLabel="khách hàng"
          />
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
                    {ordersLoading ? (
                      <tr>
                        <td colSpan="6" className="p-10 text-center text-slate-400">
                          Đang tải đơn hàng...
                        </td>
                      </tr>
                    ) : customerOrders.length > 0 ? (
                      customerOrders.map((order) => (
                        <tr key={order.id} className="border-t border-slate-100">
                          <td className="p-4 font-semibold text-slate-800">{order.id}</td>
                          <td className="p-4 text-slate-600">{order.date}</td>
                          <td className="p-4 text-slate-600">{order.createdBy}</td>
                          <td className="p-4 text-slate-700">{order.productSummary}</td>
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
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="p-10 text-center text-slate-400">
                          Chưa tìm thấy đơn hàng của khách hàng này
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={orderPage}
                totalPages={orderTotalPages}
                totalItems={orderTotalItems}
                startIndex={orderStartIndex}
                endIndex={orderEndIndex}
                onPageChange={setOrderPage}
                loading={ordersLoading}
                itemLabel="đơn hàng"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
