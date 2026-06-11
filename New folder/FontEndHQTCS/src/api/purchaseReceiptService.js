import api from './client'

export async function createPurchaseReceipt(data) {
  const res = await api.post('/purchase-receipts', data)
  return res.data?.data
}
