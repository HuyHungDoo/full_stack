import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as medicineApi from '../api/medicineService'
import * as masterDataApi from '../api/masterDataService'
import * as employeeApi from '../api/employeeService'
import * as salesInvoiceApi from '../api/salesInvoiceService'
import * as salesReturnApi from '../api/salesReturnService'
import * as purchaseReceiptApi from '../api/purchaseReceiptService'
import {
  mapInvoiceToOrder,
  mapMedicinePayloadToBe,
  mapMedicinePatchToBe,
  mapMedicineToFe,
  mapRoleToBe,
} from '../api/mappers'
import { formatLocalDate } from '../utils/dateUtils'

const EXPIRY_WARNING_DAYS = 7

const InventoryAlertContext = createContext(null)

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
  const [units, setUnits] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  const masterData = useMemo(() => ({ units, categories, suppliers }), [units, categories, suppliers])

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
    } finally {
      setLoading(false)
    }
  }, [])

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
        receiptDate: formatLocalDate(),
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

  const loadMedicineDetail = useCallback(async (medicineId) => {
    try {
      const [detail, batches] = await Promise.all([
        medicineApi.getMedicineById(medicineId),
        medicineApi.getMedicineBatches(medicineId).catch(() => []),
      ])
      return mapMedicineToFe(detail, batches || [])
    } catch {
      return null
    }
  }, [])

  const addMedicine = useCallback(
    async (payload) => {
      if (!payload?.id || !payload?.name) return
      const body = mapMedicinePayloadToBe(payload, masterData)
      await medicineApi.createMedicine(body)

      const batch = payload.batches?.[0]
      if (batch?.qty > 0 && batch?.expiryDate) {
        await importBatch(payload.id, batch, payload.supplierName)
      }
    },
    [importBatch, masterData],
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

      if (batches?.length) {
        const current = await loadMedicineDetail(medicineId)
        const prevBatches = current?.batches || []
        const prevById = new Map(prevBatches.map((batch) => [batch.id, batch]))

        const newBatches = batches.filter((batch) => !prevById.has(batch.id))
        for (const newBatch of newBatches) {
          if (newBatch?.qty > 0 && newBatch?.expiryDate) {
            await importBatch(
              medicineId,
              { ...newBatch, importPrice: lastImportPrice || newBatch.importPrice },
              supplierName,
            )
          }
        }

        for (const batch of batches) {
          const prev = prevById.get(batch.id)
          if (!prev) continue

          const nextQty = Number(batch.qty)
          const prevQty = Number(prev.qty)
          const nextPrice = Number(batch.importPrice ?? lastImportPrice ?? prev.importPrice)
          const prevPrice = Number(prev.importPrice)
          const nextExpiry = batch.expiryDate || prev.expiryDate
          const prevExpiry = prev.expiryDate

          if (
            nextQty !== prevQty ||
            nextPrice !== prevPrice ||
            nextExpiry !== prevExpiry
          ) {
            await medicineApi.updateMedicineBatch(medicineId, batch.id, {
              currentQty: nextQty,
              importPrice: nextPrice,
              expiryDate: nextExpiry,
            })
          }
        }
      }
    },
    [importBatch, loadMedicineDetail, masterData],
  )

  const deleteMedicine = useCallback(async (medicineId) => {
    if (!medicineId) return
    await medicineApi.deactivateMedicine(medicineId)
  }, [])

  const consumeStock = useCallback(async (items) => {
    const shortages = []
    for (const line of items) {
      const qty = Number(line.qty) || 0
      if (qty <= 0) continue
      try {
        const stockInfo = await medicineApi.getMedicineStock(line.id)
        const available = Number(stockInfo?.currentStock ?? stockInfo?.totalQty ?? 0)
        if (available < qty) {
          shortages.push({
            id: line.id,
            name: line.name || line.id,
            requested: qty,
            available,
          })
        }
      } catch {
        shortages.push({
          id: line.id,
          name: line.name || line.id,
          requested: qty,
          available: 0,
        })
      }
    }
    return { ok: shortages.length === 0, shortages }
  }, [])

  const addOrder = useCallback(async (payload) => {
    const phone = normalizePhone(payload.phone)
    return salesInvoiceApi.createSalesInvoice({
      customerName: payload.customerName === 'Khách lẻ' ? null : payload.customerName,
      phone,
      items: (payload.items || []).map((item) => ({
        medicineId: item.id,
        quantity: Number(item.qty) || 0,
      })),
    })
  }, [])

  const returnOrderItems = useCallback(async (orderId, returnLines, options = {}) => {
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

    return salesReturnApi.createSalesReturn({
      invoiceId: orderId,
      reason: options.reason || null,
      lines,
    })
  }, [])

  const cancelOrder = useCallback(async (orderId) => {
    await salesInvoiceApi.cancelSalesInvoice(orderId)
  }, [])

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

  const updateEmployeeRole = useCallback(async (employeeId, nextRole) => {
    await employeeApi.updateEmployee(employeeId, { roleId: mapRoleToBe(nextRole) })
  }, [])

  const toggleEmployeeStatus = useCallback(async (employeeId, isActive) => {
    if (isActive) {
      await employeeApi.updateEmployee(employeeId, { isActive: true })
    } else {
      await employeeApi.deactivateEmployee(employeeId)
    }
  }, [])

  const value = useMemo(
    () => ({
      masterData,
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
      loadMedicineDetail,
    }),
    [
      addMedicine,
      addOrder,
      cancelOrder,
      consumeStock,
      deleteMedicine,
      loadMedicineDetail,
      loadOrderDetail,
      loading,
      masterData,
      returnOrderItems,
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
