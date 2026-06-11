import api from './client'

export async function getMedicines(params) {
  const res = await api.get('/medicines', { params })
  return {
    items: res.data?.data || [],
    total: res.data?.meta?.total ?? (res.data?.data?.length || 0),
    page: res.data?.meta?.page ?? 1,
    pageSize: res.data?.meta?.pageSize ?? (res.data?.data?.length || 0),
  }
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
  const [medicinesRes, expiringRes] = await Promise.all([
    api.get('/medicines', { params: { isActive: true } }),
    api.get('/stock-writeoffs/expiring', { params: { daysAhead: 7 } }).catch(() => ({ data: { data: [] } })),
  ])

  const medicines = medicinesRes.data?.data || []
  const expiring = expiringRes.data?.data || []
  const lowStock = medicines.filter(
    (item) => Number(item.currentStock || 0) <= Number(item.minStock || 0),
  ).length
  const expiredBatches = expiring.filter((item) => Number(item.daysUntilExpiry ?? 0) < 0).length
  const expiringBatches = expiring.filter((item) => Number(item.daysUntilExpiry ?? 0) >= 0).length

  return {
    totalMedicines: medicines.length,
    lowStock,
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
