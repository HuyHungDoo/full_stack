import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as medicineApi from '../api/medicineService'
import * as masterDataApi from '../api/masterDataService'
import * as employeeApi from '../api/employeeService'
import * as salesInvoiceApi from '../api/salesInvoiceService'
import * as salesReturnApi from '../api/salesReturnService'
import * as purchaseReceiptApi from '../api/purchaseReceiptService'
import * as customerApi from '../api/customerService'
import {
  mapCustomerToFe,
  mapEmployeeToFe,
  mapInvoiceToOrder,
  mapMedicinePayloadToBe,
  mapMedicinePatchToBe,
  mapMedicineToFe,
  mapRoleToBe,
} from '../api/mappers'

const EXPIRY_WARNING_DAYS = 7

const InventoryAlertContext = createContext(null)

function isBatchExpired(batch) {
  if (!batch?.expiryDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiryDate = new Date(batch.expiryDate)
  expiryDate.setHours(0, 0, 0, 0)
  return !Number.isNaN(expiryDate.getTime()) && expiryDate < today
}

function normalizePhone(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`
  if (digits.startsWith('0') && digits.length === 10) return digits
  return null
}

export function getNearestExpiryBatch(item) {
  const activeBatches = (item?.batches || [])
    .filter((batch) => Number(batch.qty || 0) > 0 && batch.expiryDate)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
  return activeBatches[0] || null
}

export function getExpiryWarning(item, days = EXPIRY_WARNING_DAYS) {
  const batch = getNearestExpiryBatch(item)
  if (!batch) return { isWarning: false, batch: null, daysLeft: null }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiryDate = new Date(batch.expiryDate)
  expiryDate.setHours(0, 0, 0, 0)
  const daysLeft = Math.ceil((expiryDate - today) / 86400000)

  return {
    isWarning: daysLeft <= days,
    isExpired: daysLeft < 0,
    batch,
    daysLeft,
  }
}

export function getDisplayStatus(item) {
  if (item.status === 'INACTIVE') return { label: 'Ngừng bán', tone: 'disabled' }
  if (item.stock > item.minStock) return { label: 'Bình thường', tone: 'safe' }
  if (item.stock === 0) return { label: 'Hết hàng', tone: 'danger' }
  return { label: 'Sắp hết', tone: 'danger' }
}

export function InventoryAlertProvider({ children }) {
  const [medicines, setMedicines] = useState([])
  const [orders, setOrders] = useState([])
  const [employees, setEmployees] = useState([])
  const [customers, setCustomers] = useState([])
  const [units, setUnits] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  const masterData = useMemo(() => ({ units, categories, suppliers }), [units, categories, suppliers])

  const [medicineMeta, setMedicineMeta] = useState({ total: 0, page: 1, pageSize: 50 })

  const refreshMedicines = useCallback(async (options = {}) => {
    try {
      const result = await medicineApi.getMedicines({
        isActive: options.isActive ?? true,
        search: options.search || undefined,
      })
      setMedicines(result.items.map((item) => mapMedicineToFe(item, [])))
      setMedicineMeta({
        total: result.total,
        page: options.page ?? 1,
        pageSize: options.pageSize ?? result.total,
      })
      return result
    } catch {
      setMedicines([])
      setMedicineMeta({ total: 0, page: 1, pageSize: options.pageSize ?? 50 })
      return { items: [], total: 0, page: 1, pageSize: options.pageSize ?? 50 }
    }
  }, [])

  const loadMedicineDetail = useCallback(async (medicineId) => {
    try {
      const [detail, batches] = await Promise.all([
        medicineApi.getMedicineById(medicineId),
        medicineApi.getMedicineBatches(medicineId).catch(() => []),
      ])
      const mapped = mapMedicineToFe(detail, batches || [])
      setMedicines((prev) => prev.map((item) => (item.id === medicineId ? mapped : item)))
      return mapped
    } catch {
      return null
    }
  }, [])

  const refreshOrders = useCallback(async () => {
    const list = await salesInvoiceApi.getSalesInvoices()
    const mapped = await Promise.all(
      list.map(async (inv) => {
        try {
          const detail = await salesInvoiceApi.getSalesInvoiceById(inv.invoiceId)
          return mapInvoiceToOrder(detail, detail.lines || [])
        } catch {
          return mapInvoiceToOrder(inv, [])
        }
      }),
    )
    setOrders(mapped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
  }, [])

  const refreshEmployees = useCallback(async () => {
    try {
      const list = await employeeApi.getEmployees()
      setEmployees(list.map((emp) => mapEmployeeToFe(emp)))
    } catch {
      setEmployees([])
    }
  }, [])

  const refreshCustomers = useCallback(async () => {
    try {
      const list = await customerApi.getCustomers()
      setCustomers(list.map(mapCustomerToFe))
    } catch {
      setCustomers([])
    }
  }, [])

  const loadAll = useCallback(async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('accessToken')
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [unitList, categoryList, supplierList] = await Promise.all([
        masterDataApi.getUnits().catch(() => []),
        masterDataApi.getCategories().catch(() => []),
        masterDataApi.getSuppliers().catch(() => []),
      ])
      setUnits(unitList)
      setCategories(categoryList)
      setSuppliers(supplierList)

      await Promise.all([
        refreshMedicines(),
        refreshOrders(),
        refreshEmployees(),
        refreshCustomers(),
      ])
    } finally {
      setLoading(false)
    }
  }, [
    refreshCustomers,
    refreshEmployees,
    refreshMedicines,
    refreshOrders,
  ])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const ensureSupplier = useCallback(
    async (supplierName) => {
      const name = supplierName?.trim() || 'NCC Mặc định'
      const existing = suppliers.find((s) => s.supplierName === name)
      if (existing) return existing.supplierId

      const supplierId = `NCC${String(Date.now()).slice(-6)}`
      const created = await masterDataApi.createSupplier({ supplierId, supplierName: name })
      setSuppliers((prev) => [...prev, created])
      return created.supplierId
    },
    [suppliers],
  )

  const importBatch = useCallback(
    async (medicineId, batch, supplierName) => {
      const supplierId = await ensureSupplier(supplierName)
      await purchaseReceiptApi.createPurchaseReceipt({
        supplierId,
        receiptDate: new Date().toISOString().slice(0, 10),
        lines: [
          {
            medicineId,
            importPrice: Number(batch.importPrice || 0),
            expiryDate: batch.expiryDate,
            quantity: Number(batch.qty || 0),
          },
        ],
      })
    },
    [ensureSupplier],
  )

  const addMedicine = useCallback(
    async (payload) => {
      if (!payload?.id || !payload?.name) return
      const body = mapMedicinePayloadToBe(payload, masterData)
      await medicineApi.createMedicine(body)

      const batch = payload.batches?.[0]
      if (batch?.qty > 0 && batch?.expiryDate) {
        await importBatch(payload.id, batch, payload.supplierName)
      }

      await refreshMedicines()
    },
    [importBatch, masterData, refreshMedicines],
  )

  const updateMedicine = useCallback(
    async (medicineId, patch) => {
      if (!medicineId || !patch) return

      const { batches, supplierName, lastImportPrice, ...fields } = patch
      const hasFieldPatch = Object.keys(fields).length > 0
      if (hasFieldPatch) {
        const body = mapMedicinePatchToBe(fields, masterData)
        if (Object.keys(body).length > 0) {
          await medicineApi.updateMedicine(medicineId, body)
        }
      }

      const current = medicines.find((m) => m.id === medicineId)
      const prevCount = current?.batches?.length || 0
      if (batches && batches.length > prevCount) {
        const newBatch = batches[batches.length - 1]
        if (newBatch?.qty > 0) {
          await importBatch(
            medicineId,
            { ...newBatch, importPrice: lastImportPrice || newBatch.importPrice },
            supplierName,
          )
        }
      }

      await refreshMedicines()
    },
    [importBatch, masterData, medicines, refreshMedicines],
  )

  const deleteMedicine = useCallback(
    async (medicineId) => {
      if (!medicineId) return
      await medicineApi.deactivateMedicine(medicineId)
      await refreshMedicines()
    },
    [refreshMedicines],
  )

  const consumeStock = useCallback(
    (items) => {
      const shortages = []
      items.forEach((line) => {
        const medicine = medicines.find((m) => m.id === line.id)
        if (!medicine) return
        const qty = Number(line.qty) || 0
        if (qty <= 0) return
        if (medicine.stock < qty) {
          shortages.push({
            id: line.id,
            name: line.name || medicine.name,
            requested: qty,
            available: medicine.stock,
          })
        }
      })
      return { ok: shortages.length === 0, shortages }
    },
    [medicines],
  )

  const addOrder = useCallback(
    async (payload) => {
      const phone = normalizePhone(payload.phone)
      const created = await salesInvoiceApi.createSalesInvoice({
        customerName: payload.customerName === 'Khách lẻ' ? null : payload.customerName,
        phone,
        items: (payload.items || []).map((item) => ({
          medicineId: item.id,
          quantity: Number(item.qty) || 0,
        })),
      })
      await Promise.all([refreshMedicines(), refreshOrders(), refreshCustomers()])
      return created
    },
    [refreshCustomers, refreshMedicines, refreshOrders],
  )

  const returnOrderItems = useCallback(
    async (orderId, returnLines, options = {}) => {
      const detail = await salesInvoiceApi.getSalesInvoiceById(orderId)
      if (!detail?.lines?.length) return null

      const user = JSON.parse(localStorage.getItem('user') || 'null')
      const isAdmin = user?.role === 'admin'
      const knownReturned = options.knownReturnedByLine || {}

      let returnedByLineId = new Map()
      if (isAdmin) {
        try {
          const result = await salesReturnApi.getReturnedQtyByLine(orderId)
          returnedByLineId = result.returnedByLineId
        } catch {
          returnedByLineId = new Map()
        }
      }

      const lines = returnLines
        .map((line) => {
          const invoiceLine = detail.lines.find((l) => l.lineId === line.lineId)
          if (!invoiceLine) return null

          const alreadyReturned = isAdmin
            ? returnedByLineId.get(invoiceLine.lineId) || 0
            : Number(knownReturned[invoiceLine.lineId] || 0)
          const maxReturnable = Math.max(0, Number(invoiceLine.quantity || 0) - alreadyReturned)
          const qty = Math.min(Math.max(0, Math.floor(Number(line.qty) || 0)), maxReturnable)
          if (qty <= 0) return null

          return {
            invoiceLineId: invoiceLine.lineId,
            quantity: qty,
            refundAmount: qty * Number(invoiceLine.unitPrice || 0),
          }
        })
        .filter(Boolean)

      if (lines.length === 0) return null

      const created = await salesReturnApi.createSalesReturn({
        invoiceId: orderId,
        reason: options.reason || null,
        lines,
      })
      await Promise.all([refreshMedicines(), refreshOrders(), refreshCustomers()])
      return created
    },
    [refreshCustomers, refreshMedicines, refreshOrders],
  )

  const cancelOrder = useCallback(
    async (orderId) => {
      await salesInvoiceApi.cancelSalesInvoice(orderId)
      await Promise.all([refreshMedicines(), refreshOrders(), refreshCustomers()])
    },
    [refreshCustomers, refreshMedicines, refreshOrders],
  )

  const loadOrderDetail = useCallback(async (orderId) => {
    const detail = await salesInvoiceApi.getSalesInvoiceById(orderId)
    let order = mapInvoiceToOrder(detail, detail.lines || [])

    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (user?.role === 'admin') {
      try {
        const { returnedByLineId, totalRefunded } =
          await salesReturnApi.getReturnedQtyByLine(orderId)
        order = salesReturnApi.applyReturnedQtyToOrder(order, returnedByLineId, totalRefunded)
      } catch {
        // ignore if returns API unavailable
      }
    }

    return order
  }, [])

  const updateEmployeeRole = useCallback(
    async (employeeId, nextRole) => {
      await employeeApi.updateEmployee(employeeId, { roleId: mapRoleToBe(nextRole) })
      await refreshEmployees()
    },
    [refreshEmployees],
  )

  const toggleEmployeeStatus = useCallback(
    async (employeeId, isActive) => {
      if (isActive) {
        await employeeApi.updateEmployee(employeeId, { isActive: true })
      } else {
        await employeeApi.deactivateEmployee(employeeId)
      }
      await refreshEmployees()
    },
    [refreshEmployees],
  )

  const lowStockAlerts = useMemo(
    () => medicines.filter((item) => Number(item.stock) <= Number(item.minStock)),
    [medicines],
  )

  const customersFromOrders = useMemo(() => {
    if (customers.length > 0) {
      return customers.filter((c) => c.name !== 'Khách lẻ')
    }
    const map = new Map()
    orders.forEach((order) => {
      if (!order.customerName || order.customerName === 'Khách lẻ') return
      const key = order.phone || order.customerName
      const prev = map.get(key) || {
        id: key,
        name: order.customerName,
        phone: order.phone || '',
        gender: '-',
        totalSpent: 0,
      }
      prev.totalSpent += Number(order.total || 0)
      map.set(key, prev)
    })
    return [...map.values()]
  }, [customers, orders])

  const orderStatusSummary = useMemo(
    () =>
      orders.reduce(
        (acc, order) => {
          if (order.status === 'Đã hủy' || order.status === 'Đã trả hàng') acc.cancelled += 1
          else acc.completed += 1
          return acc
        },
        { completed: 0, cancelled: 0 },
      ),
    [orders],
  )

  const value = useMemo(
    () => ({
      medicines,
      orders,
      employees,
      lowStockAlerts,
      customersFromOrders,
      orderStatusSummary,
      loading,
      addOrder,
      consumeStock,
      addMedicine,
      updateMedicine,
      deleteMedicine,
      returnOrderItems,
      cancelOrder,
      loadOrderDetail,
      updateEmployeeRole,
      toggleEmployeeStatus,
      refreshMedicines,
      medicineMeta,
      loadMedicineDetail,
    }),
    [
      addMedicine,
      addOrder,
      consumeStock,
      customersFromOrders,
      deleteMedicine,
      employees,
      loadMedicineDetail,
      loadOrderDetail,
      loading,
      lowStockAlerts,
      medicineMeta,
      medicines,
      orderStatusSummary,
      orders,
      refreshMedicines,
      returnOrderItems,
      cancelOrder,
      toggleEmployeeStatus,
      updateEmployeeRole,
      updateMedicine,
    ],
  )

  return (
    <InventoryAlertContext.Provider value={value}>{children}</InventoryAlertContext.Provider>
  )
}

export function useInventoryAlerts() {
  const ctx = useContext(InventoryAlertContext)
  if (!ctx) {
    throw new Error('useInventoryAlerts must be used within InventoryAlertProvider')
  }
  return ctx
}
