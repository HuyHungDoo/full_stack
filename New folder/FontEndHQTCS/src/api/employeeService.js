import api from './client'

export async function getEmployees() {
  const res = await api.get('/employees')
  return res.data?.data || []
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
