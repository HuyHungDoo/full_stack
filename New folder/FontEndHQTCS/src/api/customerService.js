import api from './client'

function normalizePhone(input) {
  if (!input) return null
  const s = String(input).trim().replace(/\s/g, '')
  if (s.startsWith('+84')) return `0${s.slice(3)}`
  if (s.startsWith('84') && s.length >= 11) return `0${s.slice(2)}`
  if (/^0\d{9}$/.test(s)) return s
  return null
}

export async function getCustomers(params) {
  const res = await api.get('/customers', { params })
  return res.data?.data || []
}

export async function lookupCustomer(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const res = await api.post('/customers/lookup', { phone: normalized })
  return res.data?.data
}
