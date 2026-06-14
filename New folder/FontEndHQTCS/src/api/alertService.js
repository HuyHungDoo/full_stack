import api from './client'

function parseAlertListResponse(res) {
  const meta = res.data?.meta || {}
  return {
    items: res.data?.data || [],
    meta: {
      total: meta.total ?? 0,
      page: meta.page ?? 1,
      limit: meta.limit ?? 8,
      totalPages: meta.totalPages ?? 1,
      summary: meta.summary || {
        total: meta.total ?? 0,
        lowStock: 0,
        nearExpiry: 0,
        expired: 0,
      },
    },
  }
}

export async function getAlerts(params = {}) {
  const res = await api.get('/alerts', { params })
  return parseAlertListResponse(res)
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
