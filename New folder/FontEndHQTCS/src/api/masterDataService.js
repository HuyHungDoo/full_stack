import api from './client'

export async function getUnits() {
  const res = await api.get('/units')
  return res.data?.data || []
}

export async function getCategories() {
  const res = await api.get('/categories')
  return res.data?.data || []
}

export async function getSuppliers() {
  const res = await api.get('/suppliers')
  return res.data?.data || []
}

export async function createSupplier(data) {
  const res = await api.post('/suppliers', data)
  return res.data?.data
}
