import api from './client'

export async function getProfitLoss(from, to) {
  const res = await api.get('/reports/profit-loss', { params: { from, to } })
  return res.data?.data
}

export async function getRevenue(from, to, groupBy = 'day') {
  const res = await api.get('/reports/revenue', { params: { from, to, groupBy } })
  return res.data?.data || []
}

export async function getTopMedicines(from, to, limit = 10) {
  const res = await api.get('/reports/top-medicines', { params: { from, to, limit } })
  return res.data?.data || []
}
