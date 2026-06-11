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

export async function getSalesInvoices(params = {}) {
  const res = await api.get('/sales-invoices', { params })
  return parseListResponse(res)
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
