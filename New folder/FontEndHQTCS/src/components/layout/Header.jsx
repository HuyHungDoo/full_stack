import { useEffect, useMemo, useRef, useState } from 'react'
import { FaBell } from 'react-icons/fa'
import { getAlerts } from '../../api/alertService'
import { useNavigate } from 'react-router-dom'
import { usePageHeader } from '../../context/PageHeaderContext'

export default function Header() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [openLowStockPopup, setOpenLowStockPopup] = useState(false)
  const [alerts, setAlerts] = useState([])
  const notificationRef = useRef(null)
  const { pageHeader } = usePageHeader()
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!user) {
      setAlerts([])
      return
    }
    getAlerts({ status: 'PENDING', limit: 20 })
      .then(setAlerts)
      .catch(() => setAlerts([]))
  }, [user])

  const notificationItems = useMemo(
    () =>
      alerts.map((alert) => ({
        id: alert.alertId,
        title: alert.medicineName || alert.medicineId,
        message:
          alert.alertType === 'EXPIRED'
            ? 'Lô thuốc đã hết hạn'
            : alert.alertType === 'LOW_STOCK'
              ? `Tồn kho: ${alert.stockSnapshot ?? 0} (tối thiểu ${alert.minStock ?? 0})`
              : alert.note || 'Cảnh báo tồn kho / hạn dùng',
        severity: alert.severity,
      })),
    [alerts],
  )

  const notificationCount = notificationItems.length
  const notificationPreview = useMemo(() => notificationItems.slice(0, 8), [notificationItems])

  useEffect(() => {
    const syncUser = () => setUser(JSON.parse(localStorage.getItem('user') || 'null'))
    window.addEventListener('user-updated', syncUser)
    window.addEventListener('storage', syncUser)
    return () => {
      window.removeEventListener('user-updated', syncUser)
      window.removeEventListener('storage', syncUser)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!notificationRef.current?.contains(event.target)) {
        setOpenLowStockPopup(false)
      }
    }

    if (openLowStockPopup) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openLowStockPopup])

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
                onClick={() => setOpenLowStockPopup((prev) => !prev)}
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
                    <p className="text-xs text-slate-500">{notificationCount} thông báo đang chờ</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notificationPreview.length > 0 ? (
                      notificationPreview.map((item) => (
                        <div key={item.id} className="border-b border-slate-50 px-4 py-3 last:border-b-0">
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.message}</p>
                        </div>
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

          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-800">{user?.name || 'Người dùng'}</p>
            <p className="text-xs text-slate-500">{user?.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
