import api from './client'

export async function getAlerts(params = {}) {
  const res = await api.get('/alerts', { params })
  return res.data?.data || []
}

export async function resolveAlert(alertId, note) {
  const res = await api.patch(`/alerts/${alertId}/resolve`, { note: note || null })
  return res.data?.data
}

export async function rejectAlert(alertId, note) {
  const res = await api.patch(`/alerts/${alertId}/reject`, { note: note || null })
  return res.data?.data
}

export async function getNotifications() {
  const res = await api.get('/notifications')
  return {
    items: res.data?.data || [],
    unreadCount: res.data?.meta?.unreadCount ?? 0,
  }
}

export async function markNotificationRead(id) {
  const res = await api.patch(`/notifications/${id}/read`)
  return res.data?.data
}

export async function markAllNotificationsRead() {
  const res = await api.patch('/notifications/read-all')
  return res.data?.data
}
