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

/** Lấy toàn bộ hóa đơn theo filter — tự phân trang (BE giới hạn 100/trang). */
export async function getAllSalesInvoices(params = {}) {
  const pageSize = 100
  const allItems = []
  let page = 1
  let totalPages = 1

  do {
    const result = await getSalesInvoices({ ...params, page, limit: pageSize })
    allItems.push(...(result.items || []))
    totalPages = result.meta?.totalPages || 1
    page += 1
  } while (page <= totalPages)

  return allItems
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
