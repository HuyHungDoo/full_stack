import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from '../components/layout/MainLayout'
import ProtectedRoute from '../components/common/ProtectedRoute'

import Login from '../pages/auth/Login'
import Register from '../pages/auth/Register'
import AdminHome from '../pages/admin/AdminHome'
import StaffHome from '../pages/staff/StaffHome'
import Medicines from '../pages/admin/Medicines'
import Employees from '../pages/admin/Employees'
import Inventory from '../components/common/Inventory'
import Customers from '../pages/admin/Customers'
import Orders from '../pages/admin/Orders'
import Sales from '../pages/staff/Sales'
import Profile from '../pages/common/Profile'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* TẤT CẢ CÁC TRANG TRONG BLOCK NÀY SẼ CÓ SIDEBAR & HEADER */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin" replace />} />

        <Route
          path="admin"
          element={
            <ProtectedRoute allowRoles={['admin']}>
              <AdminHome />
            </ProtectedRoute>
          }
        />

        <Route
          path="staff"
          element={
            <ProtectedRoute allowRoles={['staff', 'admin']}>
              <StaffHome />
            </ProtectedRoute>
          }
        />

        <Route
          path="medicines"
          element={
            <ProtectedRoute allowRoles={['admin']}>
              <Medicines />
            </ProtectedRoute>
          }
        />

        <Route
          path="employees"
          element={
            <ProtectedRoute allowRoles={['admin']}>
              <Employees />
            </ProtectedRoute>
          }
        />

        <Route
          path="inventory"
          element={
            <ProtectedRoute allowRoles={['admin']}>
              <Inventory />
            </ProtectedRoute>
          }
        />

        <Route
          path="customers"
          element={
            <ProtectedRoute allowRoles={['admin', 'staff']}>
              <Customers />
            </ProtectedRoute>
          }
        />

        <Route
          path="orders"
          element={
            <ProtectedRoute allowRoles={['admin', 'staff']}>
              <Orders />
            </ProtectedRoute>
          }
        />

        {/* ĐÃ THÊM ROUTE BÁN HÀNG TẠI ĐÂY */}
        <Route
          path="sales"
          element={
            <ProtectedRoute allowRoles={['admin', 'staff']}>
              <Sales />
            </ProtectedRoute>
          }
        />

        <Route
          path="profile"
          element={
            <ProtectedRoute allowRoles={['admin', 'staff']}>
              <Profile />
            </ProtectedRoute>
          }
        />
        
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}