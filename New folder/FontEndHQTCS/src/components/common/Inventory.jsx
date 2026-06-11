import { useEffect, useMemo, useState } from 'react'
import {
  FaChevronDown,
  FaChevronRight,
  FaEdit,
  FaPlus,
  FaSearch,
  FaSort,
  FaSortDown,
  FaSortUp,
  FaTrash,
} from 'react-icons/fa'
import {
  getExpiryWarning,
  getDisplayStatus,
  getNearestExpiryBatch,
  useInventoryAlerts,
} from '../../context/InventoryAlertContext'
import { useSetPageHeader } from '../../context/PageHeaderContext'
import { useAppDialog } from '../../context/AppDialogContext'
import { getInventoryStats } from '../../api'

const emptyMedicineForm = {
  id: '',
  name: '',
  unit: '',
  type: 'Thuốc không kê đơn',
  category: '',
  listPrice: '',
  minStock: '',
  supplierName: '',
  manufacturerName: '',
  importPrice: '',
  status: 'ACTIVE',
  batchId: '',
  lotCode: '',
  lotQty: '',
  expiryDate: '',
  ingredient: '',
  dosage: '',
  usage: '',
}

const medicineFormTabs = [
  { id: 'info', label: 'Thông tin thuốc' },
  { id: 'price-stock', label: 'Giá & tồn kho' },
  { id: 'batch', label: 'Lô & HSD' },
  { id: 'details', label: 'Mô tả sử dụng' },
]

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value || 0)) + ' đ'
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('vi-VN') : '-'
}

function getBatchStatus(batch, batchWarning) {
  if (batchWarning.isExpired) {
    return {
      label: 'Hết hạn',
      className: 'bg-red-50 text-red-600',
    }
  }

  if (Number(batch?.qty || 0) <= 0) {
    return {
      label: 'Hết hàng',
      className: 'bg-slate-100 text-slate-500',
    }
  }

  if (batchWarning.isWarning) {
    return {
      label: 'Sắp hết hạn',
      className: 'bg-amber-50 text-amber-600',
    }
  }

  return {
    label: 'Đang bán',
    className: 'bg-emerald-50 text-emerald-600',
  }
}

function getBatchPriority(batch) {
  const warning = getExpiryWarning({ batches: [batch] })
  if (warning.isExpired) return 0
  if (warning.isWarning) return 1
  if (Number(batch?.qty || 0) <= 0) return 2
  return 3
}

function sortBatchesByAttention(batches) {
  return [...(batches || [])].sort((a, b) => {
    const priorityDiff = getBatchPriority(a) - getBatchPriority(b)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.expiryDate || '9999-12-31') - new Date(b.expiryDate || '9999-12-31')
  })
}

function filterBatchesByStatus(batches, filter) {
  if (filter === 'Tất cả') return batches
  return batches.filter((batch) => {
    const warning = getExpiryWarning({ batches: [batch] })
    const status = getBatchStatus(batch, warning)
    return status.label === filter
  })
}

const emptyImportForm = {
  medicineId: '',
  medicineName: '',
  unit: '',
  type: 'Thuốc không kê đơn',
  category: '',
  listPrice: '',
  minStock: '10',
  lotCode: '',
  quantity: '',
  expiryDate: '',
  supplierName: '',
  manufacturerName: '',
  importPrice: '',
  ingredient: '',
  usage: '',
  dosage: '',
}

export default function Inventory() {
  useSetPageHeader('Kiểm tra tồn kho', 'Tra cứu tồn kho thuốc realtime')

  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || 'null'), [])
  const isAdmin = user?.role === 'admin'

  const {
    medicines,
    medicineMeta,
    refreshMedicines,
    loadMedicineDetail,
    addMedicine,
    updateMedicine,
    deleteMedicine,
  } = useInventoryAlerts()
  const { showAlert, showError } = useAppDialog()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 50
  const [inventoryStats, setInventoryStats] = useState(null)
  const [listLoading, setListLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('Tất cả')
  const [stockSortOrder, setStockSortOrder] = useState(null) // null | asc | desc
  const [expandedMedicineIds, setExpandedMedicineIds] = useState({})
  const [medicineModal, setMedicineModal] = useState({
    isOpen: false,
    mode: 'create',
  })
  const [medicineForm, setMedicineForm] = useState(emptyMedicineForm)
  const [activeMedicineFormTab, setActiveMedicineFormTab] = useState('info')
  const [importModal, setImportModal] = useState({ isOpen: false, medicineId: '' })
  const [importForm, setImportForm] = useState(emptyImportForm)
  const [batchDetailModal, setBatchDetailModal] = useState({
    isOpen: false,
    medicineId: '',
    filter: 'Tất cả',
  })

  const matchedImportMedicine = useMemo(() => {
    const keyword = importForm.medicineName.trim().toLowerCase()
    if (!keyword) return null
    return medicines.find((item) => item.name.trim().toLowerCase() === keyword) || null
  }, [importForm.medicineName, medicines])

  const filteredData = useMemo(() => {
    const matched = medicines.filter((item) => {
      const status = getDisplayStatus(item)
      const matchStatus = (() => {
        if (filterStatus === 'Tất cả') return true
        if (filterStatus === 'Bình thường') return status.label === 'Bình thường'
        if (filterStatus === 'Sắp hết/Hết hàng') return status.tone === 'danger'
        return true
      })()

      return matchStatus
    })
    if (!stockSortOrder) return matched
    const sorted = [...matched].sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
    return stockSortOrder === 'asc' ? sorted : sorted.reverse()
  }, [medicines, filterStatus, stockSortOrder])

  const loadStats = async () => {
    try {
      const stats = await getInventoryStats()
      setInventoryStats(stats)
    } catch {
      setInventoryStats(null)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      setListLoading(true)
      try {
        await refreshMedicines({ search: search.trim(), page, pageSize })
      } finally {
        setListLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [search, page, refreshMedicines])

  const inventorySummary = useMemo(() => {
    if (inventoryStats) {
      return {
        totalMedicines: inventoryStats.totalMedicines || 0,
        totalBatches: medicineMeta?.total || inventoryStats.totalMedicines || 0,
        lowStock: inventoryStats.lowStock || 0,
        expiredBatches: inventoryStats.expiredBatches || 0,
        expiringBatches: inventoryStats.expiringBatches || 0,
      }
    }

    return {
      totalMedicines: medicineMeta?.total || 0,
      totalBatches: medicineMeta?.total || 0,
      lowStock: 0,
      expiredBatches: 0,
      expiringBatches: 0,
    }
  }, [inventoryStats, medicineMeta])

  const totalPages = Math.max(1, Math.ceil((medicineMeta?.total || 0) / pageSize))

  const groupedFilteredData = useMemo(() => {
    return filteredData.reduce((groups, item) => {
      const type = item.type || 'Chưa phân loại'
      if (!groups[type]) groups[type] = []
      groups[type].push(item)
      return groups
    }, {})
  }, [filteredData])

  const batchDetailMedicine = useMemo(
    () => medicines.find((medicine) => medicine.id === batchDetailModal.medicineId) || null,
    [batchDetailModal.medicineId, medicines],
  )

  const batchDetailBatches = useMemo(() => {
    const sortedBatches = sortBatchesByAttention(batchDetailMedicine?.batches || [])
    return filterBatchesByStatus(sortedBatches, batchDetailModal.filter)
  }, [batchDetailMedicine, batchDetailModal.filter])

  const handleToggleStockSort = () => {
    setStockSortOrder((prev) => {
      if (prev === null) return 'asc'
      if (prev === 'asc') return 'desc'
      return null
    })
  }

  const toggleMedicineBatches = async (medicineId) => {
    const willExpand = !expandedMedicineIds[medicineId]
    setExpandedMedicineIds((prev) => ({
      ...prev,
      [medicineId]: willExpand,
    }))

    if (willExpand) {
      const medicine = medicines.find((item) => item.id === medicineId)
      if (!medicine?.batches?.length) {
        await loadMedicineDetail(medicineId)
      }
    }
  }

  const openBatchDetailModal = async (medicine) => {
    if (!medicine.batches?.length) {
      await loadMedicineDetail(medicine.id)
    }
    setBatchDetailModal({
      isOpen: true,
      medicineId: medicine.id,
      filter: 'Tất cả',
    })
  }

  const closeBatchDetailModal = () => {
    setBatchDetailModal({
      isOpen: false,
      medicineId: '',
      filter: 'Tất cả',
    })
  }

  const openEditMedicineModal = (medicine) => {
    const nearestBatch = getNearestExpiryBatch(medicine) || medicine.batches?.[0] || null
    setMedicineForm({
      id: medicine.id,
      name: medicine.name,
      unit: medicine.unit,
      type: medicine.type || 'Thuốc không kê đơn',
      category: medicine.category || '',
      listPrice: medicine.listPrice || medicine.salePrice || '',
      minStock: medicine.minStock || '',
      supplierName: medicine.supplierName || '',
      manufacturerName:
        nearestBatch?.manufacturerName || medicine.manufacturerName || '',
      importPrice: nearestBatch?.importPrice ?? medicine.lastImportPrice ?? '',
      status: medicine.status || 'ACTIVE',
      batchId: nearestBatch?.id || '',
      lotCode: nearestBatch?.lotCode || '',
      lotQty: nearestBatch?.qty ?? medicine.stock ?? '',
      expiryDate: nearestBatch?.expiryDate || '',
      ingredient: medicine.ingredient || '',
      dosage: medicine.dosage || '',
      usage: medicine.usage || '',
    })
    setActiveMedicineFormTab('info')
    setMedicineModal({ isOpen: true, mode: 'edit' })
  }

  const closeMedicineModal = () => {
    setMedicineModal({ isOpen: false, mode: 'create' })
    setMedicineForm(emptyMedicineForm)
    setActiveMedicineFormTab('info')
  }

  const updateMedicineForm = (field, value) => {
    setMedicineForm((prev) => ({ ...prev, [field]: value }))
  }

  const updateImportForm = (field, value) => {
    setImportForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSelectMedicineBatch = (batchId) => {
    const medicine = medicines.find((item) => item.id === medicineForm.id)
    const batch = (medicine?.batches || []).find((item) => item.id === batchId)
    if (!batch) return

    setMedicineForm((prev) => ({
      ...prev,
      batchId: batch.id,
      lotCode: batch.lotCode || '',
      lotQty: batch.qty ?? '',
      expiryDate: batch.expiryDate || '',
      importPrice: batch.importPrice ?? prev.importPrice,
      supplierName: batch.supplierName || prev.supplierName,
      manufacturerName: batch.manufacturerName || prev.manufacturerName,
    }))
  }

  const openImportModal = (medicine = null) => {
    setImportForm({
      ...emptyImportForm,
      medicineId: medicine?.id || '',
      medicineName: medicine?.name || '',
      unit: medicine?.unit || '',
      type: medicine?.type || 'Thuốc không kê đơn',
      category: medicine?.category || '',
      listPrice: medicine?.listPrice || medicine?.salePrice || '',
      minStock: medicine?.minStock || '10',
      supplierName: medicine?.supplierName || '',
      manufacturerName: medicine?.manufacturerName || '',
      importPrice: medicine?.lastImportPrice || '',
    })
    setImportModal({ isOpen: true, medicineId: medicine?.id || '' })
  }

  const closeImportModal = () => {
    setImportModal({ isOpen: false, medicineId: '' })
    setImportForm(emptyImportForm)
  }

  const submitImport = async (e) => {
    e.preventDefault()
    const medicine = matchedImportMedicine
    const isNewMedicine = !medicine
    const medicineName = importForm.medicineName.trim()

    const quantity = Number(importForm.quantity || 0)
    const importPrice = Number(importForm.importPrice || 0)
    const listPrice = Number(importForm.listPrice || 0)
    const minStock = Number(importForm.minStock || 0)

    if (!medicineName) {
      showAlert('Thông báo', 'Vui lòng nhập tên thuốc.')
      return
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      showAlert('Thông báo', 'Số lượng nhập phải lớn hơn 0.')
      return
    }
    if (!Number.isFinite(importPrice) || importPrice < 0) {
      showAlert('Thông báo', 'Giá nhập phải là số không âm.')
      return
    }
    if (isNewMedicine && (!Number.isFinite(listPrice) || listPrice < 0 || !Number.isFinite(minStock) || minStock < 0)) {
      showAlert('Thông báo', 'Giá niêm yết và tồn tối thiểu phải là số không âm.')
      return
    }
    if (isNewMedicine && !importForm.unit.trim()) {
      showAlert('Thông báo', 'Thuốc mới cần có đơn vị tính.')
      return
    }
    if (
      isNewMedicine &&
      (!importForm.ingredient.trim() || !importForm.usage.trim() || !importForm.dosage.trim())
    ) {
      showAlert('Thông báo', 'Thuốc mới cần có thành phần, công dụng và hướng dẫn sử dụng.')
      return
    }
    if (!importForm.expiryDate) {
      showAlert('Thông báo', 'Vui lòng nhập hạn sử dụng của lô hàng.')
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiryDate = new Date(importForm.expiryDate)
    expiryDate.setHours(0, 0, 0, 0)
    if (Number.isNaN(expiryDate.getTime()) || expiryDate < today) {
      showAlert('Thông báo', 'Hạn sử dụng phải là ngày hiện tại hoặc tương lai.')
      return
    }

    try {
      if (isNewMedicine) {
        const newId = `SP${String(medicines.length + 1).padStart(3, '0')}`
        const supplierName = importForm.supplierName.trim() || 'Chưa cập nhật'
        const manufacturerName = importForm.manufacturerName.trim()
        await addMedicine({
          id: newId,
          name: medicineName,
          unit: importForm.unit.trim(),
          type: importForm.type,
          category: importForm.category.trim() || 'Chưa phân nhóm',
          listPrice,
          salePrice: listPrice,
          price: listPrice,
          minStock,
          supplierName,
          manufacturerName,
          lastImportPrice: importPrice,
          status: 'ACTIVE',
          directSale: true,
          ingredient: importForm.ingredient.trim(),
          usage: importForm.usage.trim(),
          dosage: importForm.dosage.trim(),
          batches: [
            {
              id: `LOT-${newId}-${Date.now()}`,
              lotCode: importForm.lotCode.trim() || `NHAP-${String(Date.now()).slice(-6)}`,
              qty: quantity,
              expiryDate: importForm.expiryDate,
              importDate: new Date().toISOString().slice(0, 10),
              importPrice,
              supplierName,
              manufacturerName,
            },
          ],
        })
        setExpandedMedicineIds((prev) => ({ ...prev, [newId]: true }))
        await loadStats()
        await refreshMedicines({ search: search.trim(), page, pageSize })
        closeImportModal()
        return
      }

      const supplierName = importForm.supplierName.trim() || medicine.supplierName || 'Chưa cập nhật'
      const manufacturerName =
        importForm.manufacturerName.trim() || medicine.manufacturerName || ''
      const nextBatches = [
        ...(medicine.batches || []),
        {
          id: `LOT-${medicine.id}-${Date.now()}`,
          lotCode: importForm.lotCode.trim() || `NHAP-${String(Date.now()).slice(-6)}`,
          qty: quantity,
          expiryDate: importForm.expiryDate,
          importDate: new Date().toISOString().slice(0, 10),
          importPrice,
          supplierName,
          manufacturerName,
        },
      ]

      await updateMedicine(medicine.id, {
        batches: nextBatches,
        supplierName,
        manufacturerName: manufacturerName || medicine.manufacturerName,
        lastImportPrice: importPrice,
        status: medicine.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      })
      setExpandedMedicineIds((prev) => ({ ...prev, [medicine.id]: true }))
      await loadStats()
      await refreshMedicines({ search: search.trim(), page, pageSize })
      closeImportModal()
    } catch (error) {
      showError(error.response?.data?.message || error.message || 'Không thể nhập kho')
    }
  }

  const submitMedicine = async (e) => {
    e.preventDefault()
    if (!medicineForm.name.trim()) {
      showAlert('Thông báo', 'Vui lòng nhập tên thuốc.')
      setActiveMedicineFormTab('info')
      return
    }

    if (!medicineForm.unit.trim()) {
      showAlert('Thông báo', 'Vui lòng nhập đơn vị tính.')
      setActiveMedicineFormTab('info')
      return
    }

    const listPrice = Number(medicineForm.listPrice || 0)
    const minStock = Number(medicineForm.minStock || 0)
    const importPrice = Number(medicineForm.importPrice || 0)
    const lotQty = Number(medicineForm.lotQty || 0)
    const hasBatchInput =
      Boolean(medicineForm.lotCode.trim()) ||
      Boolean(medicineForm.expiryDate) ||
      lotQty > 0

    if (![listPrice, minStock, importPrice, lotQty].every((value) => Number.isFinite(value) && value >= 0)) {
      showAlert('Thông báo', 'Các trường số lượng và giá phải là số không âm.')
      setActiveMedicineFormTab('price-stock')
      return
    }

    if (medicineModal.mode === 'create' && (!medicineForm.expiryDate || lotQty <= 0)) {
      showAlert('Thông báo', 'Khi thêm thuốc mới, vui lòng nhập lô ban đầu với số lượng lớn hơn 0 và hạn sử dụng hợp lệ.')
      setActiveMedicineFormTab('batch')
      return
    }

    if (hasBatchInput && !medicineForm.expiryDate) {
      showAlert('Thông báo', 'Vui lòng nhập hạn sử dụng cho lô thuốc.')
      setActiveMedicineFormTab('batch')
      return
    }

    if (medicineForm.expiryDate) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const expiryDate = new Date(medicineForm.expiryDate)
      expiryDate.setHours(0, 0, 0, 0)
      if (Number.isNaN(expiryDate.getTime()) || expiryDate < today) {
        showAlert('Thông báo', 'Hạn sử dụng phải là ngày hiện tại hoặc tương lai.')
        setActiveMedicineFormTab('batch')
        return
      }
    }

    if (hasBatchInput && lotQty <= 0) {
      showAlert('Thông báo', 'Số lượng lô phải lớn hơn 0 khi nhập thông tin lô.')
      setActiveMedicineFormTab('batch')
      return
    }

    const id =
      medicineForm.id.trim() ||
      `SP${String(medicines.length + 1).padStart(3, '0')}`
    const currentMedicine = medicines.find((item) => item.id === id)
    const supplierName = medicineForm.supplierName.trim() || 'Chưa cập nhật'
    const manufacturerName = medicineForm.manufacturerName.trim()
    const currentBatch = (currentMedicine?.batches || []).find((batch) => batch.id === medicineForm.batchId)
    const nextBatch = {
      id: medicineForm.batchId || `LOT-${id}-${Date.now()}`,
      lotCode: medicineForm.lotCode.trim() || `LOT-${id}`,
      qty: lotQty,
      expiryDate: medicineForm.expiryDate || '2027-12-31',
      importDate: currentBatch?.importDate || new Date().toISOString().slice(0, 10),
      importPrice,
      supplierName,
      manufacturerName:
        manufacturerName ||
        currentBatch?.manufacturerName ||
        currentMedicine?.manufacturerName ||
        '',
    }
    const nextBatches =
      medicineModal.mode === 'edit' && currentMedicine
        ? (currentMedicine.batches || []).some((batch) => batch.id === nextBatch.id)
          ? currentMedicine.batches.map((batch) =>
              batch.id === nextBatch.id ? nextBatch : batch,
            )
          : [nextBatch, ...(currentMedicine.batches || [])]
        : [nextBatch]
    const payload = {
      id,
      name: medicineForm.name.trim(),
      unit: medicineForm.unit.trim() || 'Chưa xác định',
      type: medicineForm.type,
      category: medicineForm.category.trim() || 'Chưa phân nhóm',
      listPrice,
      salePrice: listPrice,
      price: listPrice,
      minStock,
      supplierName,
      manufacturerName: manufacturerName || currentMedicine?.manufacturerName || '',
      lastImportPrice: importPrice,
      status: medicineModal.mode === 'create' ? 'ACTIVE' : medicineForm.status,
      directSale: medicineModal.mode === 'create' ? true : medicineForm.status !== 'INACTIVE',
      batches: nextBatches,
      ingredient: medicineForm.ingredient.trim(),
      dosage: medicineForm.dosage.trim(),
      usage: medicineForm.usage.trim(),
    }

    try {
      if (medicineModal.mode === 'edit') {
        await updateMedicine(id, payload)
      } else {
        await addMedicine(payload)
      }
      closeMedicineModal()
    } catch (error) {
      showError(error.response?.data?.message || error.message || 'Không thể lưu thuốc')
    }
  }

  const handleDeleteMedicine = async (medicine) => {
    if (!window.confirm(`Chuyển thuốc "${medicine.name}" sang trạng thái ngừng kinh doanh?`)) return
    try {
      await deleteMedicine(medicine.id)
    } catch (error) {
      showError(error.response?.data?.message || error.message || 'Không thể ngừng kinh doanh thuốc')
    }
  }

  return (
    <div className="space-y-6 pt-0 w-full animate-in fade-in duration-300">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              label: 'Thuốc trong kho',
              value: inventorySummary.totalMedicines,
              hint: `${inventoryStats?.totalMedicines ?? medicineMeta?.total ?? 0} thuốc`,
              className: 'bg-slate-50 text-slate-700',
            },
            {
              label: 'Cần nhập thêm',
              value: inventorySummary.lowStock,
              hint: 'Dưới ngưỡng tồn',
              className: 'bg-red-50 text-red-700',
            },
            {
              label: 'Lô hết hạn',
              value: inventorySummary.expiredBatches,
              hint: 'Không tính tồn',
              className: 'bg-orange-50 text-orange-700',
            },
            {
              label: 'Sắp hết hạn',
              value: inventorySummary.expiringBatches,
              hint: 'Trong 7 ngày',
              className: 'bg-amber-50 text-amber-700',
            },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl px-3 py-3 ${card.className}`}>
              <p className="text-xs font-semibold">{card.label}</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-2xl font-bold leading-none">{card.value}</p>
                <p className="text-[11px] font-medium opacity-80">{card.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Danh sách thuốc trong kho</h3>
            <p className="mt-1 text-sm text-slate-500">Mở từng thuốc để xem nhanh các lô cần chú ý.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-[280px] items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100 transition focus-within:ring-emerald-400">
              <FaSearch className="text-slate-400" />
              <input
                placeholder="Tìm theo mã hoặc tên thuốc..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="w-full bg-transparent text-sm text-slate-700 outline-none"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none ring-1 ring-slate-100 focus:ring-emerald-400"
            >
              <option>Tất cả</option>
              <option>Bình thường</option>
              <option>Sắp hết/Hết hàng</option>
            </select>
            {isAdmin && (
              <button
                type="button"
                onClick={() => openImportModal()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                <FaPlus />
                Nhập hàng
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-[22px] border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-4 whitespace-nowrap">Thuốc</th>
                <th className="p-4 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={handleToggleStockSort}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-blue-600 transition hover:bg-blue-50"
                    title="Bấm để sắp xếp theo tồn khả dụng"
                  >
                    Tồn kho
                    {stockSortOrder === 'asc' ? (
                      <FaSortUp className="translate-y-[2px]" />
                    ) : stockSortOrder === 'desc' ? (
                      <FaSortDown className="-translate-y-[1px]" />
                    ) : (
                      <FaSort className="text-blue-400" />
                    )}
                  </button>
                </th>
                <th className="p-4 whitespace-nowrap text-center">Trạng thái</th>
                {isAdmin && <th className="p-4 whitespace-nowrap text-center">Thao tác</th>}
              </tr>
            </thead>

            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="p-10 text-center text-slate-400">
                    Đang tải danh sách thuốc...
                  </td>
                </tr>
              ) : filteredData.length > 0 ? (
                Object.entries(groupedFilteredData).flatMap(([type, items]) => [
                  <tr key={`group-${type}`} className="border-t border-slate-100 bg-slate-50">
                    <td
                      colSpan={isAdmin ? 4 : 3}
                      className="px-4 py-2.5 text-xs font-semibold text-slate-500"
                    >
                      {type} ({items.length})
                    </td>
                  </tr>,
                  ...items.flatMap((item) => {
                    const status = getDisplayStatus(item)
                    const isExpanded = Boolean(expandedMedicineIds[item.id])
                    const batches = item.batches || []
                    const attentionBatches = sortBatchesByAttention(batches).slice(0, 6)
                    const hiddenBatchCount = Math.max(0, batches.length - attentionBatches.length)
                    const lotRows = isExpanded
                      ? [
                          <tr key={`${item.id}-lots`} className="border-t border-slate-100 bg-slate-50/70">
                            <td colSpan={isAdmin ? 4 : 3} className="p-0">
                              <div className="space-y-3 px-6 py-4">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <h4 className="text-sm font-bold text-slate-800">
                                    Lô cần chú ý của {item.name}
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => openBatchDetailModal(item)}
                                    className="text-left text-xs font-bold text-blue-600 transition hover:text-blue-700 sm:text-right"
                                  >
                                    Xem tất cả {batches.length} lô
                                  </button>
                                </div>

                                {attentionBatches.length > 0 ? (
                                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                    <table className="w-full text-sm">
                                      <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                                        <tr>
                                          <th className="px-3 py-2">Mã lô</th>
                                          <th className="px-3 py-2">Nhà SX</th>
                                          <th className="px-3 py-2 text-right">SL</th>
                                          <th className="px-3 py-2 text-right">Giá nhập</th>
                                          <th className="px-3 py-2">HSD</th>
                                          <th className="px-3 py-2 text-center">Trạng thái</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {attentionBatches.map((batch) => {
                                          const batchWarning = getExpiryWarning({ batches: [batch] })
                                          const batchStatus = getBatchStatus(batch, batchWarning)
                                          return (
                                            <tr
                                              key={batch.id || batch.lotCode}
                                              className="border-t border-slate-100 text-slate-700"
                                            >
                                              <td className="px-3 py-2.5 font-semibold text-slate-800">{batch.lotCode}</td>
                                              <td className="max-w-[140px] truncate px-3 py-2.5 text-slate-600" title={batch.manufacturerName}>
                                                {batch.manufacturerName || '—'}
                                              </td>
                                              <td className="px-3 py-2.5 text-right">{batch.qty}</td>
                                              <td className="px-3 py-2.5 text-right">{formatMoney(batch.importPrice)}</td>
                                              <td className="px-3 py-2.5">{formatDate(batch.expiryDate)}</td>
                                              <td className="px-3 py-2.5 text-center">
                                                <span
                                                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${batchStatus.className}`}
                                                >
                                                  {batchStatus.label}
                                                </span>
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-slate-400">
                                    Thuốc này chưa có lô hàng.
                                  </div>
                                )}
                                {hiddenBatchCount > 0 && (
                                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                    Còn {hiddenBatchCount} lô khác. Chọn mục Xem tất cả để xem đầy đủ.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>,
                        ]
                      : []

                    return [
                      <tr key={item.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleMedicineBatches(item.id)}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-blue-50 hover:text-blue-600"
                              title={isExpanded ? 'Ẩn lô hàng' : 'Hiện lô hàng'}
                            >
                              {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                            </button>
                            <div>
                              <p className="font-semibold text-slate-800">{item.name}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {item.id} - {item.unit} - {item.category || 'Chưa phân nhóm'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <p className="text-lg font-semibold text-slate-800">{item.stock}</p>
                          <p className="text-xs text-slate-400">Tối thiểu {item.minStock}</p>
                        </td>
                        <td className="p-4 text-center">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                              status.tone === 'safe'
                                ? 'bg-emerald-50 text-emerald-600'
                                : status.tone === 'pending'
                                ? 'bg-yellow-50 text-yellow-700'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {status.label}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditMedicineModal(item)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                                title="Sửa thuốc"
                              >
                                <FaEdit />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMedicine(item)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-red-600 transition hover:bg-red-100"
                                title="Ngừng kinh doanh"
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>,
                      ...lotRows,
                    ]
                  }),
                ])
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="p-10 text-center text-slate-400">
                    {medicineMeta?.total
                      ? 'Không tìm thấy thuốc phù hợp với bộ lọc trên trang này.'
                      : search.trim()
                      ? 'Không tìm thấy thuốc phù hợp với từ khóa.'
                      : 'Chưa có thuốc trong kho.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {medicineMeta?.total > 0 && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Hiển thị {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, medicineMeta.total)} / {medicineMeta.total} thuốc
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || listLoading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Trước
              </button>
              <span className="text-sm text-slate-600">
                Trang {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || listLoading}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {batchDetailModal.isOpen && batchDetailMedicine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900">Danh sách lô hàng</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {batchDetailMedicine.name} - {batchDetailMedicine.id} - {batchDetailMedicine.batches?.length || 0} lô
                </p>
              </div>
              <button
                type="button"
                onClick={closeBatchDetailModal}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200"
              >
                Đóng
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="flex flex-wrap gap-2">
                {['Tất cả', 'Hết hạn', 'Sắp hết hạn', 'Hết hàng', 'Đang bán'].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setBatchDetailModal((prev) => ({ ...prev, filter }))}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                      batchDetailModal.filter === filter
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="max-h-[58vh] overflow-auto rounded-2xl border border-slate-100">
                <table className="w-full min-w-[1024px] text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="p-4">Mã lô</th>
                      <th className="p-4">Nhà cung cấp</th>
                      <th className="p-4">Nhà sản xuất</th>
                      <th className="p-4 text-right">Số lượng</th>
                      <th className="p-4 text-right">Giá nhập</th>
                      <th className="p-4">Hạn sử dụng</th>
                      <th className="p-4 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchDetailBatches.length > 0 ? (
                      batchDetailBatches.map((batch) => {
                        const batchWarning = getExpiryWarning({ batches: [batch] })
                        const batchStatus = getBatchStatus(batch, batchWarning)
                        return (
                          <tr key={batch.id || batch.lotCode} className="border-t border-slate-100">
                            <td className="p-4 font-black text-slate-800">{batch.lotCode}</td>
                            <td className="p-4 font-semibold text-slate-700">
                              {batch.supplierName || batchDetailMedicine.supplierName || 'Chưa cập nhật'}
                            </td>
                            <td className="max-w-[200px] p-4 font-semibold text-slate-700" title={batch.manufacturerName}>
                              <span className="line-clamp-2">{batch.manufacturerName || '—'}</span>
                            </td>
                            <td className="p-4 text-right font-semibold text-slate-700">{batch.qty}</td>
                            <td className="p-4 text-right font-semibold text-slate-700">
                              {formatMoney(batch.importPrice)}
                            </td>
                            <td className="p-4 font-semibold text-slate-700">
                              {formatDate(batch.expiryDate)}
                            </td>
                            <td className="p-4 text-center">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${batchStatus.className}`}
                              >
                                {batchStatus.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          Không có lô nào phù hợp với bộ lọc.
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

      {medicineModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900">
              {medicineModal.mode === 'edit' ? 'Sửa thuốc trong kho' : 'Thêm thuốc vào kho'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Cảnh báo tồn kho sẽ do hệ thống tự động tạo theo ngưỡng tồn tối thiểu.
            </p>
            <form onSubmit={submitMedicine} className="mt-5 space-y-5">
              <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
                {medicineFormTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveMedicineFormTab(tab.id)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      activeMedicineFormTab === tab.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeMedicineFormTab === 'info' && (
                <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <h4 className="mb-4 font-bold text-slate-800">Thông tin thuốc</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Mã thuốc
                      <input
                        value={medicineForm.id}
                        onChange={(e) => updateMedicineForm('id', e.target.value)}
                        disabled={medicineModal.mode === 'edit'}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500 disabled:bg-slate-100"
                        placeholder="Tự sinh nếu bỏ trống"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Tên thuốc (*)
                      <input
                        value={medicineForm.name}
                        onChange={(e) => updateMedicineForm('name', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: Paracetamol 500mg"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Đơn vị tính (*)
                      <input
                        value={medicineForm.unit}
                        onChange={(e) => updateMedicineForm('unit', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="Viên, hộp, lọ..."
                      />
                    </label>
                    {medicineModal.mode === 'edit' && (
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Trạng thái kinh doanh
                        <select
                          value={medicineForm.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'}
                          onChange={(e) => updateMedicineForm('status', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        >
                          <option value="ACTIVE">Đang bán</option>
                          <option value="INACTIVE">Ngừng bán</option>
                        </select>
                        <span className="block text-xs font-normal text-slate-400">
                          Trạng thái hết hàng được hệ thống tự xác định theo tồn kho.
                        </span>
                      </label>
                    )}
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Loại thuốc
                      <select
                        value={medicineForm.type}
                        onChange={(e) => updateMedicineForm('type', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                      >
                        <option value="Thuốc không kê đơn">Thuốc không kê đơn</option>
                        <option value="Thuốc kê đơn">Thuốc kê đơn</option>
                        <option value="Vật tư y tế">Vật tư y tế</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Nhóm thuốc
                      <input
                        value={medicineForm.category}
                        onChange={(e) => updateMedicineForm('category', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="Giảm đau, tiêu hóa..."
                      />
                    </label>
                  </div>
                </section>
              )}

              {activeMedicineFormTab === 'price-stock' && (
                <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <h4 className="mb-4 font-bold text-slate-800">Giá bán và ngưỡng cảnh báo</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Giá niêm yết
                      <input
                        type="number"
                        min="0"
                        value={medicineForm.listPrice}
                        onChange={(e) => updateMedicineForm('listPrice', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                        placeholder="0"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Tồn tối thiểu để hệ thống cảnh báo
                      <input
                        type="number"
                        min="0"
                        value={medicineForm.minStock}
                        onChange={(e) => updateMedicineForm('minStock', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                        placeholder="10"
                      />
                    </label>
                  </div>
                </section>
              )}

              {activeMedicineFormTab === 'batch' && (
                <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <h4 className="mb-2 font-bold text-slate-800">
                    {medicineModal.mode === 'edit' ? 'Lô đang quản lý' : 'Lô nhập ban đầu'}
                  </h4>
                  <p className="mb-4 text-xs text-slate-500">
                    Tồn kho của thuốc được tính từ tổng số lượng các lô. HSD gần nhất được dùng để cảnh báo trong 7 ngày.
                  </p>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {medicineModal.mode === 'edit' && (
                      <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
                        Chọn lô cần sửa
                        <select
                          value={medicineForm.batchId}
                          onChange={(e) => handleSelectMedicineBatch(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        >
                          {(medicines.find((item) => item.id === medicineForm.id)?.batches || []).map((batch) => (
                            <option key={batch.id} value={batch.id}>
                              {batch.lotCode} - SL {batch.qty} - HSD{' '}
                              {batch.expiryDate
                                ? new Date(batch.expiryDate).toLocaleDateString('vi-VN')
                                : 'Chưa có'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Mã lô
                      <input
                        value={medicineForm.lotCode}
                        onChange={(e) => updateMedicineForm('lotCode', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: LOT001"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Số lượng lô
                      <input
                        type="number"
                        min="0"
                        value={medicineForm.lotQty}
                        onChange={(e) => updateMedicineForm('lotQty', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                        placeholder="0"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Hạn sử dụng
                      <input
                        type="date"
                        value={medicineForm.expiryDate}
                        onChange={(e) => updateMedicineForm('expiryDate', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Nhà cung cấp (lô)
                      <input
                        value={medicineForm.supplierName}
                        onChange={(e) => updateMedicineForm('supplierName', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="Đơn vị nhập hàng"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Nhà sản xuất (lô)
                      <input
                        value={medicineForm.manufacturerName}
                        onChange={(e) => updateMedicineForm('manufacturerName', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="Theo nhãn hoặc đơn nhập"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
                      Giá nhập lô
                      <input
                        type="number"
                        min="0"
                        value={medicineForm.importPrice}
                        onChange={(e) => updateMedicineForm('importPrice', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                        placeholder="0"
                      />
                    </label>
                  </div>
                </section>
              )}

              {activeMedicineFormTab === 'details' && (
                <section className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                  <h4 className="mb-4 font-bold text-slate-800">Mô tả sử dụng</h4>
                  <div className="space-y-4">
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Thành phần chính
                      <textarea
                        rows={3}
                        value={medicineForm.ingredient}
                        onChange={(e) => updateMedicineForm('ingredient', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: Paracetamol 500mg, Caffeine 65mg..."
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Liều dùng
                      <textarea
                        rows={3}
                        value={medicineForm.dosage}
                        onChange={(e) => updateMedicineForm('dosage', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: Người lớn uống 1 viên/lần, ngày 2-3 lần..."
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Hướng dẫn sử dụng
                      <textarea
                        rows={3}
                        value={medicineForm.usage}
                        onChange={(e) => updateMedicineForm('usage', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: Uống sau ăn, không dùng quá liều khuyến cáo..."
                      />
                    </label>
                  </div>
                </section>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeMedicineModal}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Lưu thuốc
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] bg-white shadow-2xl">
            <div className="shrink-0 border-b border-slate-100 p-5">
              <h3 className="text-xl font-bold text-slate-900">Nhập hàng</h3>
              <p className="mt-1 text-sm text-slate-500">
                Nhập tên thuốc để kiểm tra. Thuốc đã có sẽ thêm lô mới; thuốc mới cần bổ sung thông tin sử dụng.
              </p>
            </div>

            <form onSubmit={submitImport} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <h4 className="mb-4 font-bold text-slate-800">
                  {matchedImportMedicine ? 'Thuốc đã có trong kho' : 'Thông tin thuốc'}
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
                    Tên thuốc (*)
                    <input
                      value={importForm.medicineName}
                      onChange={(e) => updateImportForm('medicineName', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                      placeholder="Nhập đúng tên thuốc để kiểm tra"
                      list="medicine-name-options"
                    />
                    <datalist id="medicine-name-options">
                      {medicines.map((medicine) => (
                        <option key={medicine.id} value={medicine.name} />
                      ))}
                    </datalist>
                    <span
                      className={`block text-xs font-normal ${
                        matchedImportMedicine ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      {matchedImportMedicine
                        ? `Đã tìm thấy ${matchedImportMedicine.id}. Nhập hàng sẽ tạo thêm lô mới.`
                        : 'Không trùng tên thuốc hiện có, hệ thống sẽ tạo thuốc mới khi lưu.'}
                    </span>
                  </label>

                  {!matchedImportMedicine && (
                    <>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Đơn vị tính (*)
                        <input
                          value={importForm.unit}
                          onChange={(e) => updateImportForm('unit', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                          placeholder="Viên, hộp, lọ..."
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Giá niêm yết
                        <input
                          type="number"
                          min="0"
                          value={importForm.listPrice}
                          onChange={(e) => updateImportForm('listPrice', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                          placeholder="0"
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Loại thuốc
                        <select
                          value={importForm.type}
                          onChange={(e) => updateImportForm('type', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        >
                          <option value="Thuốc không kê đơn">Thuốc không kê đơn</option>
                          <option value="Thuốc kê đơn">Thuốc kê đơn</option>
                          <option value="Vật tư y tế">Vật tư y tế</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        Nhóm thuốc
                        <input
                          value={importForm.category}
                          onChange={(e) => updateImportForm('category', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                          placeholder="Giảm đau, tiêu hóa..."
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
                        Tồn tối thiểu
                        <input
                          type="number"
                          min="0"
                          value={importForm.minStock}
                          onChange={(e) => updateImportForm('minStock', e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                          placeholder="10"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>

              {!matchedImportMedicine && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <h4 className="mb-4 font-bold text-slate-800">Thông tin sử dụng</h4>
                  <div className="space-y-4">
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Thành phần (*)
                      <textarea
                        rows={2}
                        value={importForm.ingredient}
                        onChange={(e) => updateImportForm('ingredient', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: Paracetamol 500mg, Caffeine..."
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Mô tả công dụng / chỉ định (*)
                      <textarea
                        rows={2}
                        value={importForm.usage}
                        onChange={(e) => updateImportForm('usage', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: Giảm đau, hạ sốt, hỗ trợ điều trị..."
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Hướng dẫn sử dụng (*)
                      <textarea
                        rows={2}
                        value={importForm.dosage}
                        onChange={(e) => updateImportForm('dosage', e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                        placeholder="VD: Uống sau ăn, dùng theo chỉ định..."
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <h4 className="mb-4 font-bold text-slate-800">Thông tin lô nhập</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    Mã lô
                    <input
                      value={importForm.lotCode}
                      onChange={(e) => updateImportForm('lotCode', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                      placeholder="Tự sinh nếu bỏ trống"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    Số lượng nhập (*)
                    <input
                      type="number"
                      min="1"
                      value={importForm.quantity}
                      onChange={(e) => updateImportForm('quantity', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    Hạn sử dụng (*)
                    <input
                      type="date"
                      value={importForm.expiryDate}
                      onChange={(e) => updateImportForm('expiryDate', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    Giá nhập
                    <input
                      type="number"
                      min="0"
                      value={importForm.importPrice}
                      onChange={(e) => updateImportForm('importPrice', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-500"
                      placeholder="0"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    Nhà cung cấp (lô nhập)
                    <input
                      value={importForm.supplierName}
                      onChange={(e) => updateImportForm('supplierName', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                      placeholder="Đơn vị nhập hàng"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    Nhà sản xuất (theo lô)
                    <input
                      value={importForm.manufacturerName}
                      onChange={(e) => updateImportForm('manufacturerName', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-emerald-500"
                      placeholder="VD: DHG Pharma, Sanofi..."
                    />
                  </label>
                </div>
              </div>

              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white p-4">
                <button
                  type="button"
                  onClick={closeImportModal}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Nhập hàng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}