import { NavLink } from 'react-router-dom'
import {
  FaChartPie,
  FaPills,
  FaWarehouse,
  FaUsers,
  FaFileInvoiceDollar,
  FaCashRegister,
  FaUserTie,
} from 'react-icons/fa'
import { FaStaffSnake } from 'react-icons/fa6';

export default function Sidebar() {
  const user = JSON.parse(localStorage.getItem('user') || 'null')

  if (!user) return null

  const adminMenu = [
    { to: '/admin', label: 'Dashboard', icon: <FaChartPie /> },
    { to: '/employees', label: 'Quản lý nhân viên', icon: <FaUserTie /> },
    { to: '/medicines', label: 'Quản lý thuốc', icon: <FaPills /> },
    { to: '/inventory', label: 'Quản lý kho', icon: <FaWarehouse /> },
    { to: '/customers', label: 'Khách hàng', icon: <FaUsers /> },
    { to: '/orders', label: 'Đơn hàng', icon: <FaFileInvoiceDollar /> },
  ]

  const staffMenu = [
    { to: '/staff', label: 'Tổng quan', icon: <FaChartPie /> },
    { to: '/sales', label: 'Bán hàng', icon: <FaCashRegister /> }, // <-- SỬA TỪ '/cashier' THÀNH '/sales'
    { to: '/orders', label: 'Đơn hàng', icon: <FaFileInvoiceDollar /> },
  ]

  const menuItems = user.role === 'admin' ? adminMenu : staffMenu

  return (
    <aside className="hidden w-[280px] shrink-0 bg-gradient-to-b from-emerald-600 via-green-600 to-teal-500 p-5 text-white lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-xl shadow-lg backdrop-blur">
          <FaStaffSnake />
        </div>

        <div>
          <h1 className="text-xl font-bold">Pharmacy Manager</h1>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin' || item.to === '/staff'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-white text-emerald-700 shadow-lg' // Mình đổi nhẹ text-indigo-700 thành emerald-700 cho hợp tông màu xanh lá của bạn
                  : 'text-white/85 hover:bg-white/15'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}