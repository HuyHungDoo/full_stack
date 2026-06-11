import { useMemo, useState } from 'react'
import {
  FaSearch,
  FaTimes,
} from 'react-icons/fa'
import { useInventoryAlerts } from '../../context/InventoryAlertContext'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import { useAppDialog } from '../../context/AppDialogContext'

const groupOptions = [
  'Thuốc dị ứng',
  'Thuốc giải độc, khử độc và hỗ trợ cai nghiện',
  'Thuốc da liễu',
  'Miếng dán, cao xoa, dầu',
  'Cơ - xương - khớp',
  'Thuốc bổ & vitamin',
  'Thuốc ung thư',
  'Thuốc giảm đau, hạ sốt, kháng viêm',
  'Thuốc hô hấp',
  'Thuốc kháng sinh, kháng nấm',
  'Thuốc Mắt, Tai, Mũi, Họng',
  'Thuốc hệ thần kinh',
  'Thuốc tiêm chích & dịch truyền',
  'Thuốc tiêu hoá & gan mật',
  'Thuốc tim mạch & máu',
  'Thuốc tiết niệu - sinh dục',
  'Thuốc tê bôi',
  'Thuốc trị tiểu đường',
]

const ALL_GROUP_OPTION = 'Tất cả'

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0))
}

export default function Medicines() {
  useSetPageHeader(
    'Quản lý thuốc',
    'Quản lý danh mục thuốc, tồn kho, giá bán và thông tin chi tiết',
  )

  const { medicines, addMedicine, updateMedicine } = useInventoryAlerts()
  const { showAlert, showError } = useAppDialog()
  const [search, setSearch] = useState('')
  const [selectedTypes, setSelectedTypes] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(ALL_GROUP_OPTION)
  const [showModal, setShowModal] = useState(false)
  const [priceDrafts, setPriceDrafts] = useState({})
  
  // State quản lý Tab đang mở (info / details)
  const [activeTab, setActiveTab] = useState('info')

  const [formData, setFormData] = useState({
    code: '',
    barcode: '',
    name: '',
    drugCode: '',
    type: 'Thuốc không kê đơn',
    group: '',
    unit: '',
    route: '',
    location: '',
    costPrice: '',
    salePrice: '',
    stock: '',
    weight: '',
    directSale: true,
    // --- Các trường mới cho Tab Mô tả chi tiết ---
    ingredient: '',
    usage: '',
    dosage: '',
  })

  const filteredMedicines = useMemo(() => {
    return medicines.filter((item) => {
      const keyword = search.trim().toLowerCase()
      const matchSearch =
        !keyword ||
        item.id.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword)

      const matchType =
        selectedTypes.length === 0 || selectedTypes.includes(item.type)

      const matchGroup =
        selectedGroup === ALL_GROUP_OPTION || item.category === selectedGroup

      return matchSearch && matchType && matchGroup
    })
  }, [medicines, search, selectedTypes, selectedGroup])

  const displayGroupOptions = useMemo(
    () => [ALL_GROUP_OPTION, ...groupOptions],
    [],
  )

  const handleSelectGroup = (group) => {
    setSelectedGroup((prev) => (prev === group ? ALL_GROUP_OPTION : group))
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setActiveTab('info') // Reset tab về mặc định
    setFormData({
      code: '',
      barcode: '',
      name: '',
      drugCode: '',
      type: 'Thuốc không kê đơn',
      group: '',
      unit: '',
      route: '',
      location: '',
      costPrice: '',
      salePrice: '',
      stock: '',
      weight: '',
      directSale: true,
      ingredient: '',
      usage: '',
      dosage: '',
    })
  }

  const handleChangeForm = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handlePriceDraftChange = (medicineId, value) => {
    setPriceDrafts((prev) => ({
      ...prev,
      [medicineId]: value,
    }))
  }

  const handleSaveListPrice = (medicine) => {
    const rawValue = priceDrafts[medicine.id] ?? medicine.listPrice ?? medicine.salePrice ?? 0
    const nextPrice = Number(rawValue)
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      showAlert('Thông báo', 'Giá niêm yết không hợp lệ.')
      return
    }

    updateMedicine(medicine.id, {
      listPrice: nextPrice,
      salePrice: nextPrice,
      price: nextPrice,
    }).catch((error) => {
      showError(error.response?.data?.message || error.message || 'Không thể cập nhật giá')
    })
    setPriceDrafts((prev) => {
      const next = { ...prev }
      delete next[medicine.id]
      return next
    })
  }

  const handleSubmitMedicine = (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      showAlert('Thông báo', 'Vui lòng nhập tên thuốc')
      return
    }

    const newItem = {
      id: formData.code || `SP${String(medicines.length + 29).padStart(6, '0')}`,
      name: formData.name,
      unit: formData.unit || 'Chưa xác định',
      type: formData.type,
      category: formData.group || 'Chưa phân nhóm',
      costPrice: Number(formData.costPrice || 0),
      price: Number(formData.salePrice || 0),
      salePrice: Number(formData.salePrice || 0),
      stock: Number(formData.stock || 0),
      minStock: 10,
      directSale: formData.directSale,
      group: formData.group,
      route: formData.route,
      location: formData.location,
      drugCode: formData.drugCode,
      ingredient: formData.ingredient,
      usage: formData.usage,
      dosage: formData.dosage,
      supplierName: 'Chưa cập nhật',
      lastImportPrice: Number(formData.costPrice || 0),
      avgSold7d: 0,
      avgSold30d: 0,
      alertStatus: 'NONE',
      alertNote: '',
      alertBy: '',
      alertAt: '',
    }

    addMedicine(newItem)
      .then(() => handleCloseModal())
      .catch((error) => {
        showError(error.response?.data?.message || error.message || 'Không thể thêm thuốc')
      })
  }

  return (
    <div className="w-full space-y-4 pt-0 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* LEFT FILTER */}
        <div className="space-y-5">
          <div className="rounded-[28px] bg-white p-5 shadow-lg ring-1 ring-slate-100">
            <div className="mt-2">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-slate-400">
                <FaSearch />
                <input
                  type="text"
                  placeholder="Tìm kiếm nhóm..."
                  className="w-full bg-transparent text-sm text-slate-700 outline-none"
                />
              </div>
            </div>

            <div className="custom-scrollbar mt-4 max-h-[460px] space-y-1 overflow-y-auto pr-2">
              {displayGroupOptions.map((item) => (
                <button
                  key={item}
                  onClick={() => handleSelectGroup(item)}
                  className={`block w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                    selectedGroup === item
                      ? 'bg-emerald-50 font-semibold text-emerald-600'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div className="rounded-[28px] bg-white p-5 shadow-lg ring-1 ring-slate-100">
          {/* TOOLBAR */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex w-full items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-slate-400 xl:max-w-xs">
              <FaSearch />
              <input
                type="text"
                placeholder="Theo mã, tên hàng..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-700 outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-500">
                Thêm/sửa/xóa thuốc tại Quản lý kho
              </span>
            </div>
          </div>

          {/* TABLE */}
          <div className="mt-5 overflow-x-auto rounded-[22px] border border-slate-100">
            <table className="w-full text-sm">
              <thead className="bg-sky-50 text-left text-slate-500">
                <tr>
                  <th className="whitespace-nowrap p-4">Mã hàng</th>
                  <th className="whitespace-nowrap p-4">Tên hàng</th>
                  <th className="whitespace-nowrap p-4">Đơn vị</th>
                  <th className="whitespace-nowrap p-4 text-right">Giá niêm yết</th>
                  <th className="whitespace-nowrap p-4">Loại hàng</th>
                </tr>
              </thead>
              <tbody>
                {filteredMedicines.length > 0 ? (
                  filteredMedicines.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50 transition">
                      <td className="p-4 font-semibold text-slate-800">{item.id}</td>
                      <td className="p-4 text-slate-700 font-medium">{item.name}</td>
                      <td className="p-4 text-slate-600">{item.unit}</td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min="0"
                            value={priceDrafts[item.id] ?? item.listPrice ?? item.salePrice ?? 0}
                            onChange={(e) => handlePriceDraftChange(item.id, e.target.value)}
                            className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-right font-semibold text-slate-800 outline-none transition focus:border-emerald-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveListPrice(item)}
                            className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Lưu
                          </button>
                        </div>
                        <p className="mt-1 text-right text-xs text-slate-400">
                          {formatMoney(item.listPrice || item.salePrice)} đ
                        </p>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${item.type === 'Thuốc kê đơn' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {item.type}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-10 text-center text-slate-400">
                      Không có dữ liệu phù hợp
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
            <p>
              Hiển thị <span className="font-semibold">{filteredMedicines.length}</span> / Tổng số{' '}
              <span className="font-semibold">{medicines.length}</span> hàng hóa
            </p>

            <div className="flex items-center gap-2">
              <button className="rounded-xl bg-slate-100 px-3 py-2">1</button>
              <button className="rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-100 transition">2</button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL ADD DRUG */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Thêm thuốc mới</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Nhập thông tin thuốc, giá bán và thông tin phân loại
                </p>
              </div>

              <button
                onClick={handleCloseModal}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
              >
                <FaTimes />
              </button>
            </div>

            {/* TAB BUTTONS */}
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 pt-4 shrink-0">
              <div className="flex gap-8">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={`pb-3 text-sm font-semibold transition-colors ${
                    activeTab === 'info'
                      ? 'border-b-2 border-emerald-500 text-emerald-600'
                      : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent'
                  }`}
                >
                  Thông tin cơ bản
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`pb-3 text-sm font-semibold transition-colors ${
                    activeTab === 'details'
                      ? 'border-b-2 border-emerald-500 text-emerald-600'
                      : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent'
                  }`}
                >
                  Mô tả chi tiết (POS)
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-6 custom-scrollbar">
              <form id="medicineForm" onSubmit={handleSubmitMedicine}>
                {/* --- TAB THÔNG TIN CƠ BẢN --- */}
                {activeTab === 'info' && (
                  <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
                    {/* LEFT */}
                    <div className="space-y-6">
                      <FormRow label="Tên thuốc (*)">
                        <input
                          value={formData.name}
                          onChange={(e) => handleChangeForm('name', e.target.value)}
                          placeholder="Paracetamol 500 mg"
                          className="input-line font-medium text-slate-800"
                        />
                      </FormRow>

                      <FormRow label="Mã thuốc">
                        <input
                          value={formData.drugCode}
                          onChange={(e) => handleChangeForm('drugCode', e.target.value)}
                          placeholder="Mã số đăng ký (VD: VD-12345-19)"
                          className="input-line"
                        />
                      </FormRow>

                      <FormRow label="Loại hàng">
                        <select
                          value={formData.type}
                          onChange={(e) => handleChangeForm('type', e.target.value)}
                          className="input-line"
                        >
                          <option value="Thuốc không kê đơn">Thuốc không kê đơn</option>
                          <option value="Thuốc kê đơn">Thuốc kê đơn</option>
                        </select>
                      </FormRow>

                      <FormRow label="Nhóm thuốc">
                        <select
                          value={formData.group}
                          onChange={(e) => handleChangeForm('group', e.target.value)}
                          className="input-line"
                        >
                          <option value="">---Lựa chọn nhóm---</option>
                          {groupOptions.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </FormRow>
                    </div>

                    {/* RIGHT */}
                    <div className="space-y-6">
                      <FormRow label="Đơn vị đóng gói">
                        <input
                          type="text"
                          value={formData.unit}
                          onChange={(e) => handleChangeForm('unit', e.target.value)}
                          placeholder="Viên, vỉ, hộp, lọ..."
                          className="input-line"
                        />
                      </FormRow>

                      <FormRow label="Số lượng tồn">
                        <input
                          type="number"
                          value={formData.stock}
                          onChange={(e) => handleChangeForm('stock', e.target.value)}
                          placeholder="0"
                          className="input-line text-right font-medium"
                        />
                      </FormRow>

                      <FormRow label="Giá vốn">
                        <input
                          type="number"
                          value={formData.costPrice}
                          onChange={(e) => handleChangeForm('costPrice', e.target.value)}
                          placeholder="0"
                          className="input-line text-right font-medium text-slate-600"
                        />
                      </FormRow>

                      <FormRow label="Giá bán (*)">
                        <input
                          type="number"
                          value={formData.salePrice}
                          onChange={(e) => handleChangeForm('salePrice', e.target.value)}
                          placeholder="0"
                          className="input-line text-right font-bold text-blue-600"
                        />
                      </FormRow>
                    </div>
                  </div>
                )}

                {/* --- TAB MÔ TẢ CHI TIẾT --- */}
                {activeTab === 'details' && (
                  <div className="space-y-6 max-w-4xl">
                    <div className="rounded-2xl bg-blue-50/50 p-4 border border-blue-100">
                      <p className="text-sm text-blue-700 italic">
                        * Những thông tin dưới đây sẽ được hiển thị cho nhân viên bán hàng trong hệ thống POS khi họ tra cứu chi tiết sản phẩm.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-800">Thành phần chính</label>
                      <textarea
                        value={formData.ingredient}
                        onChange={(e) => handleChangeForm('ingredient', e.target.value)}
                        placeholder="VD: Paracetamol 500mg, Caffeine 65mg..."
                        className="textarea-box"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-800">Công dụng / Chỉ định</label>
                      <textarea
                        value={formData.usage}
                        onChange={(e) => handleChangeForm('usage', e.target.value)}
                        placeholder="VD: Giảm đau đầu, đau nhức cơ bắp, hạ sốt nhanh..."
                        className="textarea-box"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-800">Liều dùng & Cách dùng</label>
                      <textarea
                        value={formData.dosage}
                        onChange={(e) => handleChangeForm('dosage', e.target.value)}
                        placeholder="VD: Người lớn uống 1-2 viên/lần, ngày không quá 4 lần. Uống sau khi ăn..."
                        className="textarea-box"
                      />
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* FOOTER NÚT BẤM */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 p-6 shrink-0 bg-white">
              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-2xl bg-slate-100 px-6 py-3 font-medium text-slate-600 hover:bg-slate-200 transition"
              >
                Hủy
              </button>

              <button
                type="submit"
                form="medicineForm" // Liên kết nút ngoài form vào form bằng ID
                className="rounded-2xl bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/30"
              >
                Lưu thuốc
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input-line {
          width: 100%;
          border: none;
          border-bottom: 2px solid #e2e8f0;
          padding: 10px 0;
          outline: none;
          background: transparent;
          color: #0f172a;
          font-size: 15px;
          transition: border-color 0.2s;
        }

        .input-line:focus {
          border-bottom-color: #10b981;
        }

        /* Khung nhập text nhiều dòng */
        .textarea-box {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 14px;
          outline: none;
          background: #f8fafc;
          color: #0f172a;
          font-size: 14.5px;
          min-height: 90px;
          resize: vertical;
          transition: all 0.2s;
        }

        .textarea-box:focus {
          border-color: #10b981;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
        }

        /* Xóa mũi tên input number */
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        /* Làm đẹp thanh cuộn */
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>
    </div>
  )
}

function FormRow({ label, children }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[140px_minmax(0,1fr)] md:items-center">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div>{children}</div>
    </div>
  )
}