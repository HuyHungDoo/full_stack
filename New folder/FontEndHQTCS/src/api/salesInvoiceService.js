import api from './client'

export async function getSalesInvoices(params) {
  const res = await api.get('/sales-invoices', { params })
  return res.data?.data || []
}

export async function getSalesInvoiceById(id) {
  const res = await api.get(`/sales-invoices/${id}`)
  return res.data?.data
}

export async function createSalesInvoice(data) {
  const res = await api.post('/sales-invoices', data)
  return res.data?.data
}

export async function cancelSalesInvoice(id) {
  const res = await api.patch(`/sales-invoices/${id}/cancel`)
  return res.data?.data
}
