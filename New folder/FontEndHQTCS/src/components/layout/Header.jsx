import { useEffect, useMemo, useRef, useState } from 'react'
import { FaBell, FaChevronDown, FaSignOutAlt, FaUserCircle } from 'react-icons/fa'
import { getAlerts } from '../../api/alertService'
import { getMe } from '../../api/authService'
import { useNavigate } from 'react-router-dom'
import { usePageHeader } from '../../context/PageHeaderContext'

function getRoleLabel(role) {
  return role === 'admin' ? 'Quản trị viên' : 'Nhân viên'
}

function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export default function Header() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [openLowStockPopup, setOpenLowStockPopup] = useState(false)
  const [openUserMenu, setOpenUserMenu] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [alertMeta, setAlertMeta] = useState({
    total: 0,
    summary: { total: 0, lowStock: 0, nearExpiry: 0, expired: 0 },
  })
  const notificationRef = useRef(null)
  const userMenuRef = useRef(null)
  const { pageHeader } = usePageHeader()
  const isAdmin = user?.role === 'admin'

  const syncUserFromStorage = () => {
    setUser(JSON.parse(localStorage.getItem('user') || 'null'))
  }

  useEffect(() => {
    getMe()
      .then((me) => {
        const nextUser = { ...JSON.parse(localStorage.getItem('user') || 'null'), ...me }
        localStorage.setItem('user', JSON.stringify(nextUser))
        setUser(nextUser)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) {
      setAlerts([])
      setAlertMeta({ total: 0, summary: { total: 0, lowStock: 0, nearExpiry: 0, expired: 0 } })
      return
    }
    getAlerts({ status: 'PENDING', limit: 8, page: 1, refresh: true })
      .then(({ items, meta }) => {
        setAlerts(items)
        setAlertMeta({
          total: meta.total || 0,
          summary: meta.summary || { total: meta.total || 0, lowStock: 0, nearExpiry: 0, expired: 0 },
        })
      })
      .catch(() => {
        setAlerts([])
        setAlertMeta({ total: 0, summary: { total: 0, lowStock: 0, nearExpiry: 0, expired: 0 } })
      })
  }, [user])

  const notificationItems = useMemo(
    () =>
      alerts.map((alert) => ({
        id: alert.alertId,
        medicineId: alert.medicineId,
        alertType: alert.alertType,
        title: alert.medicineName || alert.medicineId,
        message:
          alert.alertType === 'EXPIRED'
            ? 'Lô thuốc đã hết hạn'
            : alert.alertType === 'NEAR_EXPIRY'
              ? 'Lô thuốc sắp hết hạn'
              : alert.alertType === 'LOW_STOCK'
                ? `Tồn kho: ${alert.stockSnapshot ?? 0} (tối thiểu ${alert.minStock ?? 0})`
                : alert.note || 'Cảnh báo tồn kho / hạn dùng',
        severity: alert.severity,
      })),
    [alerts],
  )

  const getBatchFilterForAlert = (alertType) => {
    if (alertType === 'EXPIRED') return 'Hết hạn'
    if (alertType === 'NEAR_EXPIRY') return 'Sắp hết hạn'
    if (alertType === 'LOW_STOCK') return 'Hết hàng'
    return ''
  }

  const openInventoryAlert = (item) => {
    if (!item?.medicineId) {
      setOpenLowStockPopup(false)
      navigate('/inventory')
      return
    }

    const params = new URLSearchParams({ medicineId: item.medicineId })
    const batchFilter = getBatchFilterForAlert(item.alertType)
    if (batchFilter) params.set('batchFilter', batchFilter)

    setOpenLowStockPopup(false)
    navigate(`/inventory?${params.toString()}`)
  }

  const notificationCount = alertMeta.total
  const notificationPreview = notificationItems
  const alertSummaryText = useMemo(() => {
    const summary = alertMeta.summary || {}
    const parts = []
    if (summary.lowStock > 0) parts.push(`${summary.lowStock} tồn thấp`)
    const expiryCount = Number(summary.nearExpiry || 0) + Number(summary.expired || 0)
    if (expiryCount > 0) parts.push(`${expiryCount} hạn dùng`)
    if (parts.length === 0) return `${notificationCount} cảnh báo đang chờ`
    return `${notificationCount} cảnh báo (${parts.join(' · ')})`
  }, [alertMeta.summary, notificationCount])
  const displayName = user?.name || user?.fullName || user?.username || 'Người dùng'

  useEffect(() => {
    window.addEventListener('user-updated', syncUserFromStorage)
    window.addEventListener('storage', syncUserFromStorage)
    return () => {
      window.removeEventListener('user-updated', syncUserFromStorage)
      window.removeEventListener('storage', syncUserFromStorage)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!notificationRef.current?.contains(event.target)) {
        setOpenLowStockPopup(false)
      }
      if (!userMenuRef.current?.contains(event.target)) {
        setOpenUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const openProfile = () => {
    setOpenUserMenu(false)
    navigate('/profile')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{pageHeader.title}</h1>
          {pageHeader.subtitle ? (
            <p className="mt-0.5 text-sm text-slate-500">{pageHeader.subtitle}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          {isAdmin && (
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => {
                  setOpenUserMenu(false)
                  setOpenLowStockPopup((prev) => !prev)
                }}
                className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                title="Thông báo cảnh báo"
              >
                <FaBell />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </button>

              {openLowStockPopup && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-bold text-slate-800">Cảnh báo hệ thống</p>
                    <p className="text-xs text-slate-500">{alertSummaryText}</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notificationPreview.length > 0 ? (
                      notificationPreview.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openInventoryAlert(item)}
                          className="w-full border-b border-slate-50 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                        >
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.message}</p>
                        </button>
                      ))
                    ) : (
                      <p className="px-4 py-6 text-center text-sm text-slate-400">Không có cảnh báo mới</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenLowStockPopup(false)
                      navigate('/inventory')
                    }}
                    className="w-full border-t border-slate-100 px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-slate-50"
                  >
                    Xem quản lý kho
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => {
                setOpenLowStockPopup(false)
                setOpenUserMenu((prev) => !prev)
              }}
              className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-slate-100"
              title="Tài khoản của bạn"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white shadow-sm">
                {getInitials(displayName)}
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-800">{displayName}</p>
                <p className="text-xs text-slate-500">{getRoleLabel(user?.role)}</p>
              </div>
              <FaChevronDown
                className={`hidden text-slate-400 transition sm:block ${openUserMenu ? 'rotate-180' : ''}`}
                size={12}
              />
            </button>

            {openUserMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-bold text-slate-800">{displayName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{user?.username || user?.email || ''}</p>
                </div>
                <button
                  type="button"
                  onClick={openProfile}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <FaUserCircle className="text-slate-400" />
                  Chỉnh sửa hồ sơ
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <FaSignOutAlt />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
