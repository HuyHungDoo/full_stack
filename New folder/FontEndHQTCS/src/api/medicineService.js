import api from './client'

function parseListResponse(res) {
  const meta = res.data?.meta || {}
  return {
    items: res.data?.data || [],
    meta: {
      total: meta.total ?? 0,
      page: meta.page ?? 1,
      limit: meta.limit ?? 25,
      totalPages: meta.totalPages ?? 1,
      summary: meta.summary,
    },
  }
}

export async function getMedicines(params = {}) {
  const res = await api.get('/medicines', { params })
  return parseListResponse(res)
}

export async function getMedicineStats() {
  const res = await api.get('/medicines/stats')
  return res.data?.data || { totalMedicines: 0, lowStock: 0 }
}

export async function getMedicineBatches(id) {
  const res = await api.get(`/medicines/${id}/batches`)
  return res.data?.data || []
}

export async function getMedicineStock(id) {
  const res = await api.get(`/medicines/${id}/stock`)
  return res.data?.data
}

export async function getInventoryStats() {
  const [statsRes, expiringRes] = await Promise.all([
    getMedicineStats(),
    api.get('/stock-writeoffs/expiring', { params: { daysAhead: 7 } }).catch(() => ({ data: { data: [] } })),
  ])

  const expiring = expiringRes.data?.data || []
  const expiredBatches = expiring.filter((item) => Number(item.daysUntilExpiry ?? 0) < 0).length
  const expiringBatches = expiring.filter((item) => Number(item.daysUntilExpiry ?? 0) >= 0).length

  return {
    totalMedicines: statsRes.totalMedicines || 0,
    lowStock: statsRes.lowStock || 0,
    expiredBatches,
    expiringBatches,
  }
}

export async function getMedicineById(id) {
  const res = await api.get(`/medicines/${id}`)
  return res.data?.data
}

export async function createMedicine(data) {
  const res = await api.post('/medicines', data)
  return res.data?.data
}

export async function updateMedicine(id, data) {
  const res = await api.patch(`/medicines/${id}`, data)
  return res.data?.data
}

export async function deactivateMedicine(id) {
  const res = await api.patch(`/medicines/${id}/deactivate`)
  return res.data
}
