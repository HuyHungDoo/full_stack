import { useEffect, useMemo, useRef, useState } from 'react'
import { FaBell } from 'react-icons/fa'
import {
  getDisplayStatus,
  getExpiryWarning,
  useInventoryAlerts,
} from '../../context/InventoryAlertContext'
import { useNavigate } from 'react-router-dom'
import { usePageHeader } from '../../context/PageHeaderContext'

export default function Header() {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [openLowStockPopup, setOpenLowStockPopup] = useState(false)
  const notificationRef = useRef(null)
  const { medicines, lowStockAlerts } = useInventoryAlerts()
  const { pageHeader } = usePageHeader()
  const isAdmin = user?.role === 'admin'
  const expiryAlerts = useMemo(
    () =>
      medicines
        .map((medicine) => ({
          medicine,
          expiry: getExpiryWarning(medicine),
        }))
        .filter((item) => item.expiry.isWarning),
    [medicines],
  )
  const notificationItems = useMemo(() => {
    const map = new Map()
    lowStockAlerts.forEach((medicine) => {
      map.set(medicine.id, { medicine, lowStock: true, expiry: getExpiryWarning(medicine) })
    })
    expiryAlerts.forEach(({ medicine, expiry }) => {
      const prev = map.get(medicine.id) || { medicine, lowStock: false, expiry }
      map.set(medicine.id, { ...prev, expiry })
    })
    return [...map.values()]
  }, [expiryAlerts, lowStockAlerts])
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

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openLowStockPopup])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/login')
  }

  const handleAlertClick = () => {
    setOpenLowStockPopup(false)
    navigate('/inventory')
  }

  if (!user) return null

  return (
    <header className="relative z-40 overflow-visible border-b border-slate-200/70 bg-white/50 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          {pageHeader.title ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                {pageHeader.title}
              </h1>
              {pageHeader.subtitle ? (
                <p className="mt-1 text-sm text-slate-500">{pageHeader.subtitle}</p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
          {isAdmin && (
            <div ref={notificationRef} className="relative z-50">
              <button
                type="button"
                onClick={() => setOpenLowStockPopup((prev) => !prev)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                title="Thông báo kho"
              >
                <FaBell />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {notificationCount}
                  </span>
                )}
              </button>

              {isAdmin && openLowStockPopup && (
                <div className="absolute right-0 top-12 z-[100] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Thông báo kho</h3>
                    <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600">
                      {notificationCount} thông báo
                    </span>
                  </div>

                  {notificationPreview.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      Không có thuốc sắp hết hàng hoặc hết hạn.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {notificationPreview.map(({ medicine, lowStock, expiry }) => {
                        const status = getDisplayStatus(medicine)
                        return (
                          <button
                            key={medicine.id}
                            type="button"
                            onClick={handleAlertClick}
                            className="w-full rounded-xl bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100"
                          >
                            <p className="text-xs font-semibold text-slate-800">
                              {medicine.name} ({medicine.id})
                            </p>
                            {lowStock && (
                              <p className="mt-1 text-[11px] text-slate-600">
                                Tồn: <span className="font-bold text-red-600">{medicine.stock}</span> /
                                Min: {medicine.minStock} · {status.label}
                              </p>
                            )}
                            {expiry.isWarning && expiry.batch && (
                              <p className="mt-1 text-[11px] font-semibold text-red-600">
                                {expiry.isExpired
                                  ? `Lô ${expiry.batch.lotCode} quá hạn ${Math.abs(expiry.daysLeft)} ngày`
                                  : `Lô ${expiry.batch.lotCode} còn ${expiry.daysLeft} ngày HSD`}
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-3 py-2 text-left shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 font-bold text-white">
              {(user.name || 'U').charAt(0)}
            </div>

            <div className="hidden md:block">
              <p className="text-sm font-semibold text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-500">
                {user.role === 'admin' ? 'Administrator' : 'Staff'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-600"
          >
            Đăng xuất
          </button>

        </div>
      </div>
    </header>
  )
}
