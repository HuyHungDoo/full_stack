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

export async function getEmployees(params = {}) {
  const res = await api.get('/employees', { params })
  return parseListResponse(res)
}

export async function updateEmployee(id, data) {
  const res = await api.patch(`/employees/${id}`, data)
  return res.data?.data
}

export async function changePassword(id, data) {
  const res = await api.patch(`/employees/${id}/password`, data)
  return res.data
}

export async function deactivateEmployee(id) {
  const res = await api.delete(`/employees/${id}`)
  return res.data
}
