import api from './client'

export async function getSalesReturns(params = {}) {
  const res = await api.get('/sales-returns', { params })
  return res.data?.data || []
}

export async function getSalesReturnById(id) {
  const res = await api.get(`/sales-returns/${id}`)
  return res.data?.data
}

export async function createSalesReturn(data) {
  const res = await api.post('/sales-returns', data)
  return res.data?.data
}

export async function getReturnedQtyByLine(invoiceId) {
  const list = await getSalesReturns({ invoiceId })
  const returnedByLineId = new Map()
  let totalRefunded = 0

  await Promise.all(
    list.map(async (item) => {
      const detail = await getSalesReturnById(item.returnId)
      for (const line of detail?.lines || []) {
        const prev = returnedByLineId.get(line.invoiceLineId) || 0
        returnedByLineId.set(line.invoiceLineId, prev + Number(line.quantity || 0))
        totalRefunded += Number(line.refundAmount || 0)
      }
    }),
  )

  return { returnedByLineId, totalRefunded }
}

export function applyReturnedQtyToOrder(order, returnedByLineId, totalRefunded = 0) {
  const byLine =
    returnedByLineId instanceof Map
      ? returnedByLineId
      : new Map(Object.entries(returnedByLineId || {}))

  let computedRefund = totalRefunded
  if (!computedRefund) {
    computedRefund = (order.items || []).reduce((sum, item) => {
      const returnedQty = byLine.get(item.lineId) || 0
      return sum + returnedQty * Number(item.price || 0)
    }, 0)
  }

  return {
    ...order,
    totalRefunded: computedRefund,
    originalTotal: Number(order.total || 0) + computedRefund,
    items: (order.items || []).map((item) => {
      const returnedQty = byLine.get(item.lineId) || 0
      const maxReturnable = Math.max(0, Number(item.qty || 0) - returnedQty)
      return { ...item, returnedQty, maxReturnable }
    }),
  }
}

/** Gộp số lượng vừa hoàn (Staff không đọc được GET /sales-returns). */
export function mergeReturnedIntoOrder(order, additionalByLineId = {}) {
  const returnedByLineId = new Map()
  for (const item of order.items || []) {
    if (!item.lineId) continue
    const prev = Number(item.returnedQty || 0)
    if (prev > 0) returnedByLineId.set(item.lineId, prev)
  }
  for (const [lineId, qty] of Object.entries(additionalByLineId)) {
    const add = Number(qty || 0)
    if (add <= 0) continue
    returnedByLineId.set(lineId, (returnedByLineId.get(lineId) || 0) + add)
  }
  return applyReturnedQtyToOrder(order, returnedByLineId)
}
