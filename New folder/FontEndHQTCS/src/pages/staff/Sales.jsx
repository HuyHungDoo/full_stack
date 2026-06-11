import { useState, useMemo, useEffect } from 'react'
import { lookupCustomer, getApiErrorMessage } from '../../api'
import { getDisplayStatus, useInventoryAlerts } from '../../context/InventoryAlertContext'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import { useAppDialog } from '../../context/AppDialogContext'
import {
  FaSearch,
  FaUserPlus,
  FaTrash,
  FaMinus,
  FaPlus,
  FaMoneyBillWave,
  FaPhoneAlt,
  FaFileInvoice,
  FaTimes,
  FaEye,
  FaCartPlus,
} from 'react-icons/fa'

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ'
}

// Hàm tạo mã hóa đơn tự động
const generateInvoiceId = () => `HD${Math.floor(100000 + Math.random() * 900000)}`

export default function Sales() {
  useSetPageHeader('Bán hàng tại quầy', 'Tìm kiếm sản phẩm và thanh toán nhanh chóng')
  const { medicines: inventoryMedicines, addOrder } = useInventoryAlerts()
  const { showAlert, showSuccess, showConfirm } = useAppDialog()
  const medicines = useMemo(
    () =>
      inventoryMedicines.map((item) => ({
        ...item,
        price: Number(item.listPrice || item.salePrice || item.price || 0),
        category: item.category || 'Chưa phân nhóm',
        ingredient: item.ingredient || 'Chưa cập nhật',
        usage: item.usage || 'Chưa cập nhật',
      })),
    [inventoryMedicines],
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState([])
  
  // State mã hóa đơn & khách hàng
  const [invoiceId, setInvoiceId] = useState(generateInvoiceId())
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerErrors, setCustomerErrors] = useState({ name: '', phone: '' })

  useEffect(() => {
    const raw = customerPhone.trim().replace(/\s/g, '')
    const normalized =
      raw.startsWith('+84') ? `0${raw.slice(3)}` : raw.startsWith('84') && raw.length >= 11 ? `0${raw.slice(2)}` : raw
    if (!/^0\d{9}$/.test(normalized)) return

    const timer = setTimeout(() => {
      lookupCustomer(normalized)
        .then((data) => {
          if (data?.customerName && !customerName.trim()) {
            setCustomerName(data.customerName)
          }
        })
        .catch(() => {})
    }, 400)

    return () => clearTimeout(timer)
  }, [customerPhone, customerName])

  // State lưu thông tin thuốc đang được chọn để hiển thị Modal
  const [selectedMedicine, setSelectedMedicine] = useState(null)

  const filteredMedicines = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase()
    return medicines.filter(
      (med) =>
        med.name.toLowerCase().includes(keyword) ||
        med.id.toLowerCase().includes(keyword)
    )
  }, [searchQuery, medicines])

  const cartQtyByMedicine = useMemo(() => {
    return cart.reduce((acc, item) => {
      acc[item.id] = (acc[item.id] || 0) + (Number(item.qty) || 0)
      return acc
    }, {})
  }, [cart])

  const getAvailableStock = (medicineId, baseStock) => {
    const reserved = cartQtyByMedicine[medicineId] || 0
    return Math.max(0, Number(baseStock || 0) - reserved)
  }

  const handleAddToCart = (med) => {
    if (med.status === 'INACTIVE') {
      showAlert('Ngừng bán', `${med.name} hiện đang ở trạng thái ngừng bán.`)
      return
    }
    const availableStock = getAvailableStock(med.id, med.stock)
    if (availableStock <= 0) {
      showAlert('Hết hàng', `${med.name} hiện không còn tồn kho.`)
      return
    }

    setCart((prev) => {
      const existingItem = prev.find((item) => item.id === med.id)
      if (existingItem) {
        const nextQty = (Number(existingItem.qty) || 0) + 1
        if (nextQty > Number(med.stock || 0)) {
          showAlert('Không đủ tồn kho', `${med.name} chỉ còn ${med.stock} ${med.unit} trong kho.`)
          return prev
        }
        return prev.map((item) =>
          item.id === med.id ? { ...item, qty: nextQty } : item
        )
      }
      return [...prev, { ...med, qty: 1 }]
    })
    setSelectedMedicine(null)
  }

  const handleUpdateQty = (id, newQty) => {
    const medicine = medicines.find((m) => m.id === id)
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (newQty === '') return { ...item, qty: '' }
          const parsed = parseInt(newQty, 10)
          if (isNaN(parsed) || parsed < 1) return item
          if (medicine && parsed > Number(medicine.stock || 0)) {
            showAlert(
              'Không đủ tồn kho',
              `${medicine.name} chỉ còn ${medicine.stock} ${medicine.unit} trong kho.`,
            )
            return item
          }
          return { ...item, qty: parsed }
        }
        return item
      })
    )
  }

  const handleRemoveItem = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id))
  }

  const resetForm = () => {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setCustomerErrors({ name: '', phone: '' })
    setInvoiceId(generateInvoiceId())
  }

  const handleClearCart = () => {
    showConfirm(
      'Hủy đơn hàng',
      'Bạn có chắc chắn muốn hủy đơn hàng hiện tại? Toàn bộ sản phẩm trong giỏ sẽ bị xóa.',
      () => {
        resetForm()
      },
      { confirmLabel: 'Hủy đơn', cancelLabel: 'Bỏ qua' },
    )
  }

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showAlert('Cảnh báo', 'Giỏ hàng đang trống! Vui lòng chọn sản phẩm trước khi thanh toán.')
      return
    }
    const finalCustomer = customerName.trim()
    const finalPhone = customerPhone.trim()

    if (finalPhone && !/^(0|\+84)[0-9]{9,10}$/.test(finalPhone)) {
      setCustomerErrors({
        name: '',
        phone: 'Số điện thoại không đúng định dạng',
      })
      return
    }

    setCustomerErrors({ name: '', phone: '' })
    
    const currentUser = JSON.parse(localStorage.getItem('user') || 'null')
    const orderItems = cart.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      qty: Number(item.qty) || 0,
      price: Number(item.price) || 0,
      total: (Number(item.qty) || 0) * (Number(item.price) || 0),
    }))

    try {
      const created = await addOrder({
        customerName: finalCustomer || 'Khách lẻ',
        phone: finalPhone,
        total: totalPrice,
        status: 'Hoàn thành',
        createdBy: currentUser?.name || 'Nhân viên',
        createdAt: new Date().toISOString(),
        items: orderItems,
      })

      const realInvoiceId = created?.invoiceId || invoiceId
      const billDetails = `Hóa đơn: ${realInvoiceId}\nKhách hàng: ${finalCustomer || 'Khách lẻ'}\nSố điện thoại: ${finalPhone || 'Không nhập'}\nTổng tiền thanh toán: ${formatMoney(created?.totalAmount ?? totalPrice)}`

      showSuccess(
        'Thanh toán thành công!',
        billDetails,
        () => {
          resetForm()
        },
      )
    } catch (error) {
      showAlert('Thanh toán thất bại', getApiErrorMessage(error, 'Không thể tạo hóa đơn'))
    }
  }

  const totalItems = cart.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
  const totalPrice = cart.reduce((sum, item) => sum + item.price * (Number(item.qty) || 0), 0)

  return (
    <div className="w-full space-y-4 pt-0 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
        
        {/* KHU VỰC TRÁI (SẢN PHẨM) */}
        <div className="space-y-4 lg:col-span-2 xl:col-span-3">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
            <FaSearch className="text-slate-400" />
            <input
              type="text"
              placeholder="Tìm thuốc theo mã hoặc tên sản phẩm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {filteredMedicines.length > 0 ? (
              filteredMedicines.map((med) => {
                const availableStock = getAvailableStock(med.id, med.stock)
                const status = getDisplayStatus(med)

                return (
                  <div
                    key={med.id}
                    onClick={() => setSelectedMedicine(med)}
                    className={`relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 transition select-none ${
                      availableStock > 0 && med.status !== 'INACTIVE'
                        ? 'ring-slate-100 hover:shadow-md hover:ring-blue-400'
                        : 'ring-red-100 opacity-75'
                    }`}
                  >
                    <div>
                      <span className="mb-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                        {med.category}
                      </span>
                      <span
                        className={`ml-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          status.tone === 'safe'
                            ? 'bg-emerald-50 text-emerald-600'
                            : status.tone === 'pending'
                              ? 'bg-yellow-50 text-yellow-700'
                              : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {status.label}
                      </span>
                      <h3 className="text-sm font-bold text-slate-800 line-clamp-2">{med.name}</h3>
                    </div>
                    
                    {/* Khu vực giá và nút Thêm vào giỏ */}
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-slate-500">Kho khả dụng: {availableStock} {med.unit}</p>
                        <p className="text-base font-bold text-blue-600">{formatMoney(med.price)}</p>
                      </div>

                      {/* NÚT THÊM NHANH VÀO GIỎ HÀNG */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Ngăn chặn mở Modal khi bấm nút này
                          handleAddToCart(med);
                        }}
                        disabled={availableStock <= 0 || med.status === 'INACTIVE'}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300"
                        title="Thêm vào giỏ"
                      >
                        <FaCartPlus size={16} />
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="col-span-full py-10 text-center text-slate-400">Không có thuốc phù hợp</div>
            )}
          </div>
        </div>

        {/* KHU VỰC PHẢI (HÓA ĐƠN) */}
        <div className="flex flex-col overflow-hidden rounded-[24px] bg-white shadow-xl ring-1 ring-slate-100 lg:col-span-1 h-[calc(100vh-140px)] min-h-[620px] sticky top-6">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-800">
                <FaFileInvoice className="text-blue-600" />
                <h2 className="font-bold">{invoiceId}</h2>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                {totalItems} SP
              </span>
            </div>
            
            <div className="space-y-2">
              <div>
                <div className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 ${
                  customerErrors.name ? 'border-red-500' : 'border-slate-200'
                }`}>
                  <FaUserPlus className="text-slate-400 shrink-0" size={14} />
                  <input 
                    type="text" 
                    placeholder="Khách lẻ"
                    value={customerName} 
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      if (customerErrors.name) {
                        setCustomerErrors((prev) => ({ ...prev, name: '' }))
                      }
                    }}
                    className="w-full outline-none text-sm text-slate-700 font-medium placeholder-slate-400"
                  />
                </div>
                {customerErrors.name && (
                  <p className="mt-1 text-sm text-red-500">{customerErrors.name}</p>
                )}
              </div>
              <div>
                <div className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 ${
                  customerErrors.phone ? 'border-red-500' : 'border-slate-200'
                }`}>
                  <FaPhoneAlt className="text-slate-400 shrink-0" size={14} />
                  <input 
                    type="tel" 
                    placeholder="Số điện thoại (không bắt buộc)"
                    value={customerPhone} 
                    onChange={(e) => {
                      setCustomerPhone(e.target.value)
                      if (customerErrors.phone) {
                        setCustomerErrors((prev) => ({ ...prev, phone: '' }))
                      }
                    }}
                    className="w-full outline-none text-sm text-slate-700 font-medium placeholder-slate-400"
                  />
                </div>
                {customerErrors.phone && (
                  <p className="mt-1 text-sm text-red-500">{customerErrors.phone}</p>
                )}
              </div>
            </div>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400 p-4">
                <p className="text-sm italic">Bấm vào nút <FaCartPlus className="inline mx-1 text-blue-400"/> ở sản phẩm để thêm vào hóa đơn</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.id} className="relative rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition">
                    <div className="flex justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-800 leading-tight">{item.name}</h4>
                      <button onClick={() => handleRemoveItem(item.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                        <FaTrash size={12} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-blue-600">{formatMoney(item.price)}</p>
                      <div className="flex items-center rounded-lg border border-slate-200 bg-white px-1">
                        <button onClick={() => handleUpdateQty(item.id, (Number(item.qty) || 0) - 1)} className="p-1.5 text-slate-500 hover:bg-slate-100 transition rounded-md"><FaMinus size={10} /></button>
                        
                        <input 
                          type="number" 
                          value={item.qty} 
                          onChange={(e) => handleUpdateQty(item.id, e.target.value)}
                          onBlur={() => {
                            if (item.qty === '') handleUpdateQty(item.id, 1)
                          }}
                          className="w-8 bg-transparent text-center text-sm font-semibold outline-none" 
                        />
                        
                        <span className="text-[13px] font-medium text-slate-500 pr-1 select-none">{item.unit}</span>

                        <button onClick={() => handleUpdateQty(item.id, (Number(item.qty) || 0) + 1)} className="p-1.5 text-slate-500 hover:bg-slate-100 transition rounded-md"><FaPlus size={10} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-white p-5">
            <div className="mb-4 space-y-2 text-sm text-slate-600">
              <div className="flex justify-between font-bold text-lg text-slate-900 border-t border-dashed border-slate-200 pt-2">
                <span>Tổng cộng:</span>
                <span className="text-blue-600">{formatMoney(totalPrice)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={handleClearCart} disabled={cart.length === 0} className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition">Hủy</button>
              <button onClick={handleCheckout} disabled={cart.length === 0} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none transition">
                <FaMoneyBillWave /> Thanh toán
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL HIỂN THỊ CHI TIẾT THUỐC */}
      {selectedMedicine && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">Chi tiết sản phẩm</h2>
              <button
                onClick={() => setSelectedMedicine(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm transition hover:bg-red-50 hover:text-red-600"
              >
                <FaTimes />
              </button>
            </div>

            <div className="p-6">
              {(() => {
                const status = getDisplayStatus(selectedMedicine)
                return (
                  <div
                    className={`mb-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
                      status.tone === 'safe'
                        ? 'bg-emerald-50 text-emerald-700'
                        : status.tone === 'pending'
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'bg-red-50 text-red-600'
                    }`}
                  >
                    Trạng thái thuốc: {status.label}
                  </div>
                )
              })()}
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-blue-700">{selectedMedicine.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">Mã: {selectedMedicine.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{formatMoney(selectedMedicine.price)}</p>
                  <p className="text-sm font-medium text-emerald-600">
                    Kho khả dụng: {getAvailableStock(selectedMedicine.id, selectedMedicine.stock)} {selectedMedicine.unit}
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
                <div>
                  <span className="mb-1 block font-bold text-slate-900">Danh mục</span>
                  <span className="inline-block rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                    {selectedMedicine.category}
                  </span>
                </div>
                <div>
                  <span className="mb-1 block font-bold text-slate-900">Thành phần chính</span>
                  <p className="leading-relaxed text-slate-600">{selectedMedicine.ingredient}</p>
                </div>
                <div>
                  <span className="mb-1 block font-bold text-slate-900">Công dụng / Chỉ định</span>
                  <p className="leading-relaxed text-slate-600">{selectedMedicine.usage}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
        /* Xóa mũi tên tăng giảm số lượng mặc định của trình duyệt */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  )
}