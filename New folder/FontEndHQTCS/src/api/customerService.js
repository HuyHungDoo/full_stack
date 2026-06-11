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

function normalizePhone(input) {
  if (!input) return null
  const s = String(input).trim().replace(/\s/g, '')
  if (s.startsWith('+84')) return `0${s.slice(3)}`
  if (s.startsWith('84') && s.length >= 11) return `0${s.slice(2)}`
  if (/^0\d{9}$/.test(s)) return s
  return null
}

export async function getCustomers(params = {}) {
  const res = await api.get('/customers', { params })
  return parseListResponse(res)
}

export async function getCustomerInvoices(customerId, params = {}) {
  const res = await api.get(`/customers/${customerId}/invoices`, { params })
  return parseListResponse(res)
}

export async function lookupCustomer(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const res = await api.post('/customers/lookup', { phone: normalized })
  return res.data?.data
}
