# Hướng dẫn tích hợp Backend cho Frontend

## Mục lục

1. [Chạy thử BE trước khi sửa FE](#1-chạy-thử-be-trước-khi-sửa-fe)
2. [Cấu hình môi trường FE](#2-cấu-hình-môi-trường-fe)
3. [Tạo lớp HTTP client + token](#3-tạo-lớp-http-client--token)
4. [Tạo các service file gọi API](#4-tạo-các-service-file-gọi-api)
5. [Sửa Auth flow (localStorage user → JWT)](#5-sửa-auth-flow-localstorage-user--jwt)
6. [Thay `InventoryAlertContext` bằng dữ liệu server](#6-thay-inventoryalertcontext-bằng-dữ-liệu-server)
7. [Mapping endpoint cho từng trang](#7-mapping-endpoint-cho-từng-trang)
8. [Mapping field — bỏ / đổi / thêm](#8-mapping-field--bỏ--đổi--thêm)
9. [Format response và xử lý lỗi](#9-format-response-và-xử-lý-lỗi)
10. [Role và phân quyền](#10-role-và-phân-quyền)
11. [Checklist từng trang](#11-checklist-từng-trang)
12. [Các trang nên thêm mới](#12-các-trang-nên-thêm-mới)
13. [Các lỗi thường gặp khi tích hợp](#13-các-lỗi-thường-gặp-khi-tích-hợp)

---

## 1. Chạy thử BE trước khi sửa FE

```bash
cd ../BACKEND-HQT
cp .env.example .env
# sửa .env: DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD, JWT_SECRET
npm install
npm run dev
# Server chạy ở http://localhost:3001
```

Trước khi tích hợp, tạo 1 user ADMIN và 1 user STAFF trong DB:

```sql
-- Mat khau 'admin123' bcrypt hash (chay node -e ".." de tao)
-- Vi du hash cua 'admin123':
INSERT INTO dbo.Employee (EmployeeId, Username, PasswordHash, FullName, RoleId, IsActive)
VALUES ('NV001', 'admin', '<bcrypt-hash>', N'Quản trị viên', 'ADMIN', 1);

-- Seed Khach le (bat buoc - module 08 can)
INSERT INTO dbo.Customer (CustomerId, CustomerName, TotalSpent)
VALUES ('KH000000', N'Khách lẻ', 0);
```

Tạo bcrypt hash bằng:
```bash
node -e "console.log(require('bcryptjs').hashSync('admin123', 10))"
```

Test nhanh:
```bash
curl http://localhost:3001/api/health
# {"success":true,"status":"ok"}

curl -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
# {"success":true,"data":{"token":"...","employee":{...}}}
```

---

## 2. Cấu hình môi trường FE

### Tạo file `.env.local` ở root FE

```env
VITE_API_URL=http://localhost:3001/api
```

> Lưu ý: Vite chỉ expose biến có prefix `VITE_`. Sau khi tạo, **restart `npm run dev`** để Vite load lại env.

### Cấu hình CORS

BE đã set `CORS_ORIGIN=http://localhost:5173` trong `.env`. Nếu FE chạy port khác → sửa `BACKEND-HQT/.env`.

---

## 3. Tạo lớp HTTP client + token

### Tạo file mới: `src/lib/apiClient.js`

```javascript
import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' },
})

// gan token vao moi request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// xu ly response - mo .data ra san
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status
    const data = error.response?.data

    // token het han / khong hop le -> logout
    if (status === 401 && (data?.code === 'TOKEN_EXPIRED' || data?.code === 'INVALID_TOKEN' || data?.code === 'UNAUTHORIZED')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }

    // chuan hoa loi
    return Promise.reject({
      status,
      message: data?.message || error.message || 'Lỗi không xác định',
      code: data?.code || 'UNKNOWN',
    })
  }
)

export default apiClient
```

### Cách dùng

```javascript
// truoc:
// const data = await axios.get('/api/medicines')
// data.data = { success: true, data: [...] }

// sau:
import api from '@/lib/apiClient'
const result = await api.get('/medicines')
// result = { success: true, data: [...] }
// -> result.data = [...] (mang thuoc)
```

---

## 4. Tạo các service file gọi API

Tạo folder `src/services/` và các file dưới đây:

### `src/services/auth.service.js`

```javascript
import api from '@/lib/apiClient'

export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateMe: (data) => api.patch('/auth/me', data),
}
```

### `src/services/medicine.service.js`

```javascript
import api from '@/lib/apiClient'

export const medicineService = {
  getAll: (filters = {}) => api.get('/medicines', { params: filters }),
  getById: (id) => api.get(`/medicines/${id}`),
  getBatches: (id) => api.get(`/medicines/${id}/batches`),
  getStock: (id) => api.get(`/medicines/${id}/stock`),
  create: (data) => api.post('/medicines', data),
  update: (id, data) => api.patch(`/medicines/${id}`, data),
  deactivate: (id) => api.patch(`/medicines/${id}/deactivate`),
}
```

### `src/services/masterData.service.js`

```javascript
import api from '@/lib/apiClient'

export const unitService = {
  getAll: () => api.get('/units'),
  create: (data) => api.post('/units', data),
}

export const categoryService = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.patch(`/categories/${id}`, data),
  remove: (id) => api.delete(`/categories/${id}`),
}

export const supplierService = {
  getAll: () => api.get('/suppliers'),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.patch(`/suppliers/${id}`, data),
  deactivate: (id) => api.patch(`/suppliers/${id}/deactivate`),
}

export const manufacturerService = {
  getAll: () => api.get('/manufacturers'),
  create: (data) => api.post('/manufacturers', data),
  update: (id, data) => api.patch(`/manufacturers/${id}`, data),
}
```

### `src/services/purchaseReceipt.service.js`

```javascript
import api from '@/lib/apiClient'

export const purchaseReceiptService = {
  getAll: (filters = {}) => api.get('/purchase-receipts', { params: filters }),
  getById: (id) => api.get(`/purchase-receipts/${id}`),
  create: (data) => api.post('/purchase-receipts', data),
  cancel: (id) => api.patch(`/purchase-receipts/${id}/cancel`),
}
```

### `src/services/customer.service.js`

```javascript
import api from '@/lib/apiClient'

export const customerService = {
  getAll: (filters = {}) => api.get('/customers', { params: filters }),
  getById: (id) => api.get(`/customers/${id}`),
  getInvoices: (id) => api.get(`/customers/${id}/invoices`),
  lookup: (phone) => api.post('/customers/lookup', { phone }),
  update: (id, data) => api.patch(`/customers/${id}`, data),
}
```

### `src/services/salesInvoice.service.js`

```javascript
import api from '@/lib/apiClient'

export const salesInvoiceService = {
  getAll: (filters = {}) => api.get('/sales-invoices', { params: filters }),
  getById: (id) => api.get(`/sales-invoices/${id}`),
  create: (data) => api.post('/sales-invoices', data),
  cancel: (id) => api.patch(`/sales-invoices/${id}/cancel`),
}
```

### `src/services/salesReturn.service.js`

```javascript
import api from '@/lib/apiClient'

export const salesReturnService = {
  getAll: (filters = {}) => api.get('/sales-returns', { params: filters }),
  getById: (id) => api.get(`/sales-returns/${id}`),
  create: (data) => api.post('/sales-returns', data),
}
```

### `src/services/stockWriteOff.service.js`

```javascript
import api from '@/lib/apiClient'

export const stockWriteOffService = {
  getExpiring: (daysAhead = 30) => api.get('/stock-writeoffs/expiring', { params: { daysAhead } }),
  getAll: (filters = {}) => api.get('/stock-writeoffs', { params: filters }),
  getById: (id) => api.get(`/stock-writeoffs/${id}`),
  create: (data) => api.post('/stock-writeoffs', data),
}
```

### `src/services/alert.service.js`

```javascript
import api from '@/lib/apiClient'

export const alertService = {
  getAlerts: (filters = {}) => api.get('/alerts', { params: filters }),
  getById: (id) => api.get(`/alerts/${id}`),
  resolve: (id, note) => api.patch(`/alerts/${id}/resolve`, { note }),
  reject: (id, note) => api.patch(`/alerts/${id}/reject`, { note }),

  getNotifications: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
}
```

### `src/services/employee.service.js`

```javascript
import api from '@/lib/apiClient'

export const employeeService = {
  getAll: () => api.get('/employees'),
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.patch(`/employees/${id}`, data),
  changePassword: (id, currentPassword, newPassword) =>
    api.patch(`/employees/${id}/password`, { currentPassword, newPassword }),
  deactivate: (id) => api.delete(`/employees/${id}`),
}
```

### `src/services/report.service.js`

```javascript
import api from '@/lib/apiClient'

export const reportService = {
  profitLoss: (from, to) => api.get('/reports/profit-loss', { params: { from, to } }),
  revenue: (from, to, groupBy = 'day') => api.get('/reports/revenue', { params: { from, to, groupBy } }),
  topMedicines: (from, to, limit = 10) => api.get('/reports/top-medicines', { params: { from, to, limit } }),
  inventoryValue: () => api.get('/reports/inventory-value'),
  disposalCost: (from, to) => api.get('/reports/disposal-cost', { params: { from, to } }),
}
```

---

## 5. Sửa Auth flow (localStorage user → JWT)

### File `src/pages/auth/Login.jsx`

**Hiện tại:** so khớp cứng email/password với `admin@gmail.com / 123456`.

**Sửa thành:**

```javascript
import { authService } from '@/services/auth.service'

const handleLogin = async (formData) => {
  try {
    // formData phai co { username, password } - KHONG dung email nua
    const result = await authService.login(formData.username, formData.password)

    // result.data = { token, employee: { employeeId, username, fullName, roleId, ... } }
    localStorage.setItem('token', result.data.token)
    localStorage.setItem('user', JSON.stringify({
      employeeId: result.data.employee.employeeId,
      username: result.data.employee.username,
      name: result.data.employee.fullName,
      role: result.data.employee.roleId.toLowerCase(), // 'ADMIN' -> 'admin'
    }))

    navigate(result.data.employee.roleId === 'ADMIN' ? '/admin' : '/staff')
  } catch (err) {
    setError(err.message || 'Đăng nhập thất bại')
  }
}
```

> **Quan trọng:** BE dùng **`username`** (không phải `email`). Cần đổi field `email` → `username` trong form Login.

### File `src/pages/auth/Register.jsx`

Nhân viên **tự đăng ký** qua `POST /api/auth/register` (public). Luôn tạo vai trò **STAFF** — không đăng ký được ADMIN.

Body: `{ fullName, username, email, phone?, password, confirmPassword }` — `phone` format `0xxxxxxxxx` (10 số).

Sau đăng ký thành công → chuyển `/login`. ADMIN vẫn có thể tạo NV (kể cả ADMIN) qua `POST /api/employees`.

### File `src/components/common/ProtectedRoute.jsx`

Hiện tại đang đọc `localStorage.user`. Thêm kiểm tra token:

```javascript
const token = localStorage.getItem('token')
const user = JSON.parse(localStorage.getItem('user') || 'null')

if (!token || !user) {
  return <Navigate to="/login" replace />
}
```

### File `src/components/layout/Header.jsx` (logout)

```javascript
import { authService } from '@/services/auth.service'

const handleLogout = async () => {
  try { await authService.logout() } catch {}
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  navigate('/login')
}
```

### Đổi `role` lowercase

BE trả `roleId = 'ADMIN' | 'STAFF'`, FE đang dùng `'admin' | 'staff'`. Có 2 cách:

- **Cách 1 (khuyến nghị):** chuẩn hoá ở chỗ lưu (như ví dụ `Login.jsx` ở trên) — toàn FE dùng lowercase.
- **Cách 2:** sửa `ProtectedRoute.allowRoles` thành `['ADMIN']`, `['STAFF', 'ADMIN']`.

---

## 6. Thay `InventoryAlertContext` bằng dữ liệu server

Context hiện tại đang giữ **toàn bộ dữ liệu mock + persist `localStorage`**. Có 2 hướng:

### Hướng A (đơn giản, khuyến nghị): bỏ context, gọi API trực tiếp ở từng page

Mỗi trang gọi service tương ứng bằng `useEffect`. Đỡ đồng bộ phức tạp.

```javascript
// src/pages/admin/Medicines.jsx
import { useState, useEffect } from 'react'
import { medicineService } from '@/services/medicine.service'

const [medicines, setMedicines] = useState([])
const [loading, setLoading] = useState(true)

useEffect(() => {
  medicineService.getAll()
    .then(result => setMedicines(result.data))
    .catch(err => alert(err.message))
    .finally(() => setLoading(false))
}, [])
```

### Hướng B: giữ context, đổi internal sang gọi API

Vẫn dùng `useInventoryAlerts()`, nhưng các action như `addMedicine`, `addOrder`, `consumeStock` trong context **gọi service** thay vì cập nhật `localStorage`. Phù hợp nếu UI hiện tại đã phụ thuộc nhiều vào context.

```javascript
// vi du action moi trong context
const addMedicine = async (medicineData) => {
  const result = await medicineService.create(medicineData)
  // refetch list de FE thay update
  const list = await medicineService.getAll()
  setMedicines(list.data)
  return result.data
}
```

**Khuyến nghị:** chọn **Hướng A** — đỡ rủi ro race condition, code đơn giản hơn.

### Các seed cần xoá

Khi xoá `InventoryAlertContext`, đồng thời xoá:
- Các `localStorage` key cũ: `inventory_alert_store_v2`, `demo_expired_batches_seeded_v1`, `demo_expired_medicine_seeded_v1`, `demo_many_batch_medicine_seeded_v1`
- Các mảng `initialMedicines`, `initialOrders`, `initialEmployees`, ...

---

## 7. Mapping endpoint cho từng trang

| Trang FE | Endpoint BE | Method | Role |
|----------|-------------|--------|------|
| **Login** | `/auth/login` | POST | – |
| **Profile** — load | `/auth/me` | GET | Auth |
| **Profile** — sửa thông tin | `/auth/me` | PATCH | Auth (fullName, phone, email) |
| **Profile** — đổi MK | `/employees/:id/password` | PATCH | Auth (chính mình) |
| **AdminHome** — KPI | gộp `/reports/profit-loss` + `/reports/inventory-value` | GET | ADMIN |
| **AdminRevenueReport** — biểu đồ | `/reports/revenue?groupBy=day` | GET | ADMIN |
| **AdminRevenueReport** — top thuốc | `/reports/top-medicines` | GET | ADMIN |
| **Medicines** — list | `/medicines` | GET | Auth |
| **Medicines** — thêm | `/medicines` | POST | ADMIN |
| **Medicines** — sửa | `/medicines/:id` | PATCH | ADMIN |
| **Medicines** — sửa giá | `/medicines/:id` (body `{ listPrice }`) | PATCH | ADMIN |
| **Medicines** — ngừng KD | `/medicines/:id/deactivate` | PATCH | ADMIN |
| **Inventory** — danh sách lô | `/medicines/:id/batches` | GET | Auth |
| **Inventory** — tồn theo SP | `/medicines/:id/stock` | GET | Auth |
| **Inventory** — nhập hàng | `/purchase-receipts` | POST | ADMIN |
| **Inventory** — hủy hàng | `/stock-writeoffs` | POST | ADMIN |
| **Inventory** — lô sắp HSD | `/stock-writeoffs/expiring?daysAhead=30` | GET | Auth |
| **Inventory** — cảnh báo | `/alerts?refresh=true` | GET | Auth |
| **Employees** — list | `/employees` | GET | ADMIN |
| **Employees** — thêm | `/employees` | POST | ADMIN |
| **Employees** — đổi role / kích hoạt | `/employees/:id` | PATCH | ADMIN |
| **Employees** — tắt | `/employees/:id` | DELETE | ADMIN |
| **Customers** — list | `/customers` | GET | ADMIN |
| **Customers** — chi tiết | `/customers/:id` | GET | ADMIN |
| **Customers** — lịch sử mua | `/customers/:id/invoices` | GET | ADMIN |
| **Orders (admin)** — list | `/sales-invoices` | GET | Auth |
| **Orders** — chi tiết | `/sales-invoices/:id` | GET | Auth |
| **Orders** — hủy | `/sales-invoices/:id/cancel` | PATCH | ADMIN |
| **Orders** — trả hàng | `/sales-returns` | POST | STAFF + ADMIN |
| **Sales (POS)** — tìm KH theo SĐT | `/customers/lookup` | POST | Auth |
| **Sales (POS)** — thanh toán | `/sales-invoices` | POST | Auth |
| **(Mới)** — Master data | `/units`, `/categories`, `/suppliers`, `/manufacturers` | GET / POST / PATCH | Auth / ADMIN |
| **(Mới)** — Thông báo | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` | GET / PATCH | Auth |

---

## 8. Mapping field — bỏ / đổi / thêm

### 8.1. Medicine (thuốc)

| Field FE đang dùng | BE | Hành động |
|--------------------|------|----------|
| `id` / `code` | `medicineId` | đổi tên |
| `name` | `medicineName` | đổi tên |
| `salePrice` / `listPrice` / `price` | `listPrice` | thống nhất `listPrice` |
| `costPrice` | – | **bỏ** (giá vốn thuộc về **lô** = `MedicineBatch.ImportPrice`) |
| `type` (text "Thuốc kê đơn"...) | `productType` | đổi tên — giá trị: `'Thuốc kê đơn'`, `'Thuốc không kê đơn'`, `'Vật tư y tế'` |
| `IsPrescription` (nếu có) | – | **bỏ** — dùng `productType` |
| `barcode` | – | **bỏ** (BE không lưu) |
| `location` / `shelfLocation` | – | **bỏ** |
| `directSale` | – | **bỏ** (suy ra từ `productType`) |
| `weight` | – | **bỏ** |
| `group` / `category` | `categoryId` | đổi sang ID (cần fetch danh sách từ `/categories`) |
| `unit` (text "Viên") | `unitId` | đổi sang ID (cần fetch từ `/units`, ví dụ `'VIEN'`) |
| `drugCode` / `drugRegistrationCode` | `drugRegistrationCode` | giữ |
| `stock` | – | **không gửi khi tạo SP**; xem `/medicines/:id/stock` |
| `minStock` | `minStock` | giữ |
| `manufacturerName` | `manufacturerId` | đổi sang ID (fetch từ `/manufacturers`) |
| `supplierName` | – | **không thuộc Medicine** — gán vào lô khi nhập hàng |
| `ingredient` / `usage` / `dosage` / `route` | giữ y nguyên (BE có) | – |
| `status` (ACTIVE/INACTIVE) | `isActive` | đổi sang boolean |
| `batches` (mảng lô gắn ngay trong SP) | – | **bỏ** — lô được sinh khi tạo `purchase-receipt` |

**Payload mẫu tạo thuốc:**

```javascript
{
  medicineId: 'SP001',
  medicineName: 'Paracetamol 500mg',
  unitId: 'VIEN',
  categoryId: 'NHOM_GIAM_DAU',         // optional
  manufacturerId: 'NSX_TRAPHACO',       // optional
  productType: 'Thuốc không kê đơn',
  drugRegistrationCode: 'VD-12345-19',  // optional
  listPrice: 1500,
  minStock: 50,
  ingredient: '...',  // optional
  usage: '...',       // optional
  dosage: '...',      // optional
  route: 'Uống',      // optional
}
```

### 8.2. Sales Invoice (hóa đơn)

| Field FE | BE | Hành động |
|----------|------|----------|
| `customerName` | `customerName` | giữ (optional) |
| `customerPhone` / `phone` | `phone` | đổi tên thành `phone`, format `0xxxxxxxxx` (10 chữ số) |
| `total` | `totalAmount` | **BE tự tính** — không gửi |
| `status: 'Hoàn thành'` | `status: 'COMPLETED'` | dùng enum tiếng Anh |
| `items[].id` | `items[].medicineId` | đổi tên |
| `items[].qty` | `items[].quantity` | đổi tên |
| `items[].batchId` (mới) | `items[].batchId` (optional) | **mới** — chỉ định lô cụ thể, không truyền = FIFO |
| `items[].price` | – | **không gửi** — BE lấy từ `Medicine.ListPrice` |
| `items[].total` | – | **không gửi** — BE tính |
| `vat` / `tax` | – | **bỏ** — không có VAT trong project |
| `discount` | – | **bỏ** |
| `paymentMethod` | – | **bỏ** |
| `createdBy` / employee | tự nhận từ token | bỏ field này khỏi payload |
| `createdAt` / date | `SYSUTCDATETIME()` | bỏ field này khỏi payload |

**Payload mẫu tạo hóa đơn (FIFO mặc định):**

```javascript
{
  customerName: 'Nguyễn Văn A',  // optional
  phone: '0901234567',            // optional
  gender: 'Nam',                  // optional
  note: '...',                    // optional
  items: [
    { medicineId: 'SP001', quantity: 3 },                          // FIFO
    { medicineId: 'SP002', quantity: 1, batchId: 'PN000002-L01' }, // bán đúng lô
  ]
}
```

**Hai chế độ chọn lô:**

| `batchId` | Hành vi BE |
|-----------|------------|
| Không truyền (`undefined` / `null`) | FIFO — chọn lô gần hết hạn nhất trước, có thể tạo **nhiều `lines`** cho 1 SP nếu phải lấy từ nhiều lô |
| Truyền giá trị | Bán **đúng lô đó** — chỉ tạo 1 line, BE từ chối nếu lô không tồn tại / không thuộc SP / đã hết hạn / không đủ tồn |

> **Nghiệp vụ nhà thuốc:** dược sĩ có thể nhìn HSD của từng lô, nếu khách định dùng dài hạn mà lô gần hết hạn → bỏ lô đó qua chọn lô tiếp theo. Xem [§11 — Sales (POS)](#11-checklist-từng-trang) để biết cách hiển thị UI cảnh báo.

**Response BE trả về:**

```javascript
{
  invoiceId: 'HD000001',
  invoiceDate: '2026-05-20T...',
  totalAmount: 6500,
  grossProfit: 2100,
  status: 'COMPLETED',
  customerNameSnapshot: 'Nguyễn Văn A',
  phoneSnapshot: '0901234567',
  lines: [
    {
      lineId: '...',
      medicineId: 'SP001',
      batchId: 'PN000001-L01',
      medicineNameSnapshot: 'Paracetamol 500mg',
      unitNameSnapshot: 'Viên',
      quantity: 3,
      unitPrice: 1500,
      lineTotal: 4500,
      costPriceSnapshot: 1100,
      lineProfit: 1200,
    },
    // ...
  ]
}
```

> Lưu ý: 1 `medicineId` có thể tạo **nhiều `lines`** nếu phải lấy từ nhiều lô (FIFO).

### 8.3. Phiếu nhập hàng — thuốc & NCC mới (Cách B)

**Quyết định:** BE **không** nhận `_isNew` / nested `medicine` trong `POST /purchase-receipts`. FE tạo master data trước bằng API riêng.

#### Luồng UX (FE team tự implement — không nằm trong phạm vi BE/DB)

```
┌─────────────────────────────────────────────────────────┐
│  Modal "Nhập hàng"                                       │
│  1. [Dropdown NCC]  [+ Thêm NCC mới]  ← QuickAddSupplier │
│  2. [Tên thuốc]     [+ Thêm thuốc mới] ← QuickAddMedicine│
│  3. (chỉ enable khi đã chọn thuốc)                        │
│     Số lượng, HSD, giá nhập, NSX lô...                   │
│  4. [Nhập hàng] → POST /purchase-receipts                │
└─────────────────────────────────────────────────────────┘
```

#### Bước 1 — NCC mới (nếu cần)

```javascript
// QuickAddSupplierModal submit
const res = await supplierService.create({
  supplierId: 'NCC004',      // FE tự sinh hoặc user nhập
  supplierName: 'Cty Dược XYZ',
  email: null,
  address: '...',
})
// res.data = { supplierId, supplierName, ... }
setReceiptForm(f => ({ ...f, supplierId: res.data.supplierId }))
```

#### Bước 2 — Thuốc mới (nếu cần)

```javascript
// QuickAddMedicineModal submit — đủ field bắt buộc theo §8.1
const res = await medicineService.create({
  medicineId: 'SP099',
  medicineName: 'Amoxicillin 500mg',
  unitId: 'VIEN',
  productType: 'Thuốc kê đơn',
  listPrice: 5000,
  minStock: 50,
  ingredient: '...',
  usage: '...',
  dosage: '...',
})
setLineDraft(f => ({ ...f, medicineId: res.data.medicineId }))
// Giữ modal nhập hàng mở, user điền tiếp lô
```

#### Bước 3 — Tạo phiếu nhập

```javascript
await purchaseReceiptService.create({
  supplierId: 'NCC004',
  note: 'Nhập tháng 5',
  lines: [
    {
      medicineId: 'SP099',
      importPrice: 3500,
      expiryDate: '2027-12-31',
      quantity: 100,
      manufacturerId: 'DHG',  // optional
    },
  ],
})
```

#### Xử lý lỗi từng bước

| Bước | Lỗi | Xử lý FE |
|------|-----|----------|
| POST `/medicines` | 409 `MEDICINE_EXISTS` | Báo trùng mã, đề xuất chọn thuốc có sẵn |
| POST `/suppliers` | 409 / unique name | Báo trùng tên NCC |
| POST `/purchase-receipts` | 400 `MEDICINE_NOT_FOUND` | Thuốc chưa tạo — quay lại bước 2 |
| POST `/purchase-receipts` | 400 FK supplier | NCC chưa tạo — quay lại bước 1 |

#### Gợi ý component FE (team FE tự code)

| Modal / màn hình | API gọi khi Lưu |
|------------------|-----------------|
| `QuickAddMedicineModal` (tên gợi ý) | `POST /medicines` |
| `QuickAddSupplierModal` (tên gợi ý) | `POST /suppliers` |
| Form phiếu nhập | `POST /purchase-receipts` — chỉ khi đã có `medicineId`, `supplierId` |

#### Không làm trên BE

- Gộp tạo thuốc + phiếu nhập trong 1 request BE
- Tạo thuốc mới ngầm khi submit form nhập (logic cũ trên FE)

---

### 8.4. Sales Return (trả hàng)

| Field cần | Ghi chú |
|-----------|---------|
| `invoiceId` | Mã HĐ gốc |
| `reason` | optional |
| `lines[].invoiceLineId` | **PHẢI** là `lineId` của `SalesInvoiceLine` (mỗi line trên HĐ có thể có nhiều dòng nếu phân nhiều lô) |
| `lines[].quantity` | Số lượng trả ≤ số đã bán |
| `lines[].refundAmount` | Số tiền hoàn ≤ `unitPrice × quantity` |

Quy trình FE:
1. Lấy `/sales-invoices/:id` để có `lines[]`
2. Cho user chọn từng line + nhập `quantity` + `refundAmount`
3. Gửi `POST /sales-returns`

### 8.5. Customer (khách hàng)

| Field FE | BE | Hành động |
|----------|------|----------|
| `id` | `customerId` (format `KH000001`) | đổi tên |
| `name` | `customerName` | đổi tên |
| `phone` | `phone` | giữ |
| `gender` | `gender` (enum `'Nam' \| 'Nữ' \| 'Khác'`) | đổi enum |
| `email` | – | **bỏ** — không lưu |
| `dateOfBirth` | – | **bỏ** |
| `address` | – | **bỏ** |
| `totalSpent` | `totalSpent` | giữ |

**Quan trọng:** không có endpoint tạo khách hàng riêng. Khách được **tự sinh** khi hóa đơn bán hàng có `phone`. Trang Customers chỉ list + sửa tên/giới tính (không sửa được `phone`).

### 8.6. Supplier (nhà cung cấp)

| Field FE | BE |
|----------|------|
| `supplierName` | `supplierName` |
| `contactPerson` | **bỏ** |
| `phone` | **bỏ** |
| `address` | `address` (giữ) |
| `email` | `email` (giữ) |

### 8.7. Employee (nhân viên)

| Field FE | BE | Hành động |
|----------|------|----------|
| `id` / `accountId` | `employeeId` (format `NV001`) | đổi tên |
| `username` | `username` | giữ |
| `password` | `password` (chỉ khi tạo / đổi MK) | giữ |
| `fullName` | `fullName` | giữ |
| `email` | `email` | giữ |
| `phone` | `phone` | giữ |
| `role` (`'admin' \| 'staff'`) | `roleId` (`'ADMIN' \| 'STAFF'`) | uppercase |
| `isActive` | `isActive` | giữ |
| `isRoot` | – | BE không có cờ này (mặc định employee đầu tiên là root, BE chặn việc đổi role của root) |

### 8.8. Inventory / Lô hàng (MedicineBatch)

Lô hàng **không CRUD trực tiếp** từ FE. Lô được tạo qua **phiếu nhập hàng** (`POST /purchase-receipts`):

```javascript
{
  supplierId: 'NCC001',
  note: '...',
  lines: [
    {
      medicineId: 'SP001',
      quantity: 100,
      unitCost: 1000,
      expiryDate: '2027-12-31',
      importDate: '2026-05-20',   // optional
      manufacturerId: 'NSX_TRAPHACO',  // optional
    }
  ]
}
```

BE sẽ tự sinh `BatchId` (vd `PN000001-L01`) cho mỗi line.

### 8.9. Stock Write-Off (hủy hàng)

```javascript
{
  reason: 'Hủy lô hết hạn',
  lines: [
    { batchId: 'PN000001-L01', quantity: 50, reason: 'Hết hạn 2026-05-01' }
  ]
}
```

`batchId` lấy từ `/stock-writeoffs/expiring`.

---

## 9. Format response và xử lý lỗi

### Response thành công

```json
{ "success": true, "data": ... }
```

Hoặc có `meta`:
```json
{ "success": true, "data": [...], "meta": { "unreadCount": 3 } }
```

### Response lỗi

```json
{ "success": false, "message": "Không đủ tồn kho. SP001 yêu cầu 5, hiện có 2", "code": "INSUFFICIENT_STOCK" }
```

### Bảng `code` thường gặp

| HTTP | code | Ý nghĩa | FE nên hiển thị |
|------|------|---------|-----------------|
| 400 | `VALIDATION_ERROR` | Dữ liệu form sai | Hiện message dưới field tương ứng |
| 400 | `INSUFFICIENT_STOCK` | Không đủ tồn (hoặc lô chỉ định không đủ) | Toast đỏ, gợi ý nhập thêm |
| 400 | `BATCH_NOT_FOUND` | `batchId` chỉ định không tồn tại | Toast đỏ, refresh danh sách lô |
| 400 | `BATCH_MEDICINE_MISMATCH` | Lô không thuộc thuốc đang bán | Toast đỏ |
| 400 | `BATCH_EXPIRED` | Lô đã quá HSD, không bán được | Toast đỏ, chọn lô khác |
| 400 | `RETURN_QTY_EXCEEDED` | Trả vượt mua | Toast đỏ |
| 400 | `REFUND_AMOUNT_EXCEEDED` | Hoàn quá giá bán | Toast đỏ |
| 400 | `INVOICE_CANCELLED` | HĐ đã hủy | Toast cảnh báo |
| 400 | `ALREADY_CANCELLED` / `ALREADY_RETURNED` | Đã thao tác trước đó | Toast vàng |
| 400 | `HAS_RETURN` | HĐ có phiếu trả, không hủy được | Toast vàng |
| 401 | `UNAUTHORIZED` / `INVALID_TOKEN` / `TOKEN_EXPIRED` | Hết phiên | **Tự logout** (đã làm trong interceptor) |
| 403 | `FORBIDDEN` | Sai role | Toast đỏ "Bạn không có quyền" |
| 404 | `*_NOT_FOUND` | Không tìm thấy | Toast hoặc trang 404 |
| 409 | `DUPLICATE_ENTRY` | Trùng dữ liệu | Toast: "Đã tồn tại" |
| 409 | `FK_CONSTRAINT` | Đang được tham chiếu | Toast: "Không thể xóa..." |
| 500 | `INTERNAL_ERROR` | Lỗi server | Toast đỏ chung chung |

### Pattern xử lý lỗi trong component

```javascript
try {
  const result = await medicineService.create(data)
  toast.success('Tạo thuốc thành công')
} catch (err) {
  // err = { status, message, code } - da chuan hoa trong interceptor
  if (err.code === 'VALIDATION_ERROR') {
    setFormError(err.message)
  } else {
    toast.error(err.message)
  }
}
```

---

## 10. Role và phân quyền

### Mapping role

| BE | FE hiện tại | Hành động |
|------|-------------|----------|
| `ADMIN` | `admin` | Lưu lowercase trong `localStorage.user.role`, BE tự nhận token |
| `STAFF` | `staff` | – |

### Phân quyền route (theo BE)

| Phạm vi | Endpoint |
|---------|----------|
| **ADMIN only** | `/employees/*` (trừ đổi MK của chính mình), `/medicines POST/PATCH/DELETE`, `/suppliers POST/PATCH/DELETE`, `/manufacturers POST/PATCH`, `/categories POST/PATCH/DELETE`, `/customers GET`, `/purchase-receipts/*`, `/sales-returns GET`, `/sales-returns/:id GET`, `/stock-writeoffs POST/GET`, `/sales-invoices/:id/cancel`, `/alerts/:id/resolve|reject`, `/reports/*` |
| **STAFF + ADMIN** | `/auth/me` GET/PATCH, `/medicines GET`, `/customers/lookup`, `/sales-invoices GET/POST` (STAFF chỉ thấy của mình), `/sales-returns POST`, `/stock-writeoffs/expiring`, `/alerts GET` (STAFF chỉ thấy PENDING), `/notifications/*`, `/units GET`, `/categories GET`, `/manufacturers GET` |

Sidebar nên ẩn các link không khớp role. Hiện tại `Sidebar.jsx` đã có logic theo role — chỉ cần cập nhật menu cho đúng phân quyền BE.

---

## 11. Checklist từng trang

### `Login.jsx`
- [ ] Đổi field `email` → `username`
- [ ] Gọi `authService.login(username, password)`
- [ ] Lưu `token` vào `localStorage`
- [ ] Lưu `user` chuẩn hoá (`role` lowercase)
- [ ] Bỏ MOCK accounts cứng
- [ ] Bỏ phần "Quên mật khẩu" mock (BE chưa có)

### `Register.jsx`
- [ ] Form: họ tên, username, email, SĐT, MK, nhập lại MK
- [ ] Submit → `authService.register(...)` → toast/alert → `navigate('/login')`
- [ ] Giữ link "Đăng ký" từ Login

### `Employees.jsx` (ADMIN đặt lại mật khẩu)
- [ ] Nút "Đặt mật khẩu" / modal → `PATCH /api/employees/:id/password` body `{ newPassword }` (không gửi `currentPassword` khi ADMIN)

### `ProtectedRoute.jsx`
- [ ] Kiểm tra cả `token` lẫn `user`
- [ ] Đồng bộ role (lowercase)

### `Header.jsx`
- [ ] Logout: xoá `token` + `user`, gọi `authService.logout()`
- [ ] Hiển thị badge `unreadCount` từ `alertService.getNotifications()` (định kỳ poll mỗi 30s, hoặc khi click chuông)

### `AdminHome.jsx`
- [ ] Gọi `reportService.profitLoss(from, to)` cho KPI (revenue, profit)
- [ ] Gọi `reportService.inventoryValue()` cho card "Giá trị tồn kho"
- [ ] Bỏ số `285.400.000đ` hard-code
- [ ] Có thể thêm card `unresolvedAlerts` từ `alertService.getAlerts()`

### `AdminRevenueReport.jsx`
- [ ] `reportService.revenue(from, to, 'day')` cho biểu đồ ngày
- [ ] `reportService.topMedicines(from, to, 10)` cho top thuốc
- [ ] Bỏ `revenueData` hard-code

### `Medicines.jsx`
- [ ] `medicineService.getAll()` load list
- [ ] Form thêm/sửa: dùng các field map ở [§8.1](#81-medicine-thuốc)
- [ ] **Cần thêm dropdown** `Unit`, `Category`, `Manufacturer` (gọi `unitService.getAll()`, ...)
- [ ] Bỏ field `barcode`, `location`, `directSale`, `weight`, `costPrice`
- [ ] Bỏ phần thêm lô trực tiếp trong form thuốc — chuyển sang trang Inventory (qua phiếu nhập)
- [ ] Nút "Sửa giá" → `medicineService.update(id, { listPrice: ... })`

### `Inventory.jsx`
- [ ] Tab Tồn kho: hiển thị `/medicines` + tổng tồn từ `/medicines/:id/stock` (có thể gộp với `reportService.inventoryValue()`)
- [ ] Tab Lô hàng: `/medicines/:id/batches`
- [ ] Tab Nhập hàng: form gọi `purchaseReceiptService.create()` với **mảng lines** (1 phiếu = nhiều lô)
- [ ] **Cách B — thuốc/NCC mới:** modal thêm thuốc/NCC (gọi `POST /medicines`, `POST /suppliers` trước), rồi `purchaseReceiptService.create()` — xem [§8.3](#83-phiếu-nhập-hàng--thuốc--ncc-mới-cách-b)
- [ ] Tab Cảnh báo HSD: `/stock-writeoffs/expiring?daysAhead=30`
- [ ] Nút "Hủy lô": form gọi `stockWriteOffService.create()`
- [ ] Bỏ logic mock `seedExpiredBatches`

### `Customers.jsx`
- [ ] `customerService.getAll({ search })` load list
- [ ] Click vào KH → modal hiện `customerService.getInvoices(id)` cho lịch sử
- [ ] Bỏ tự derive từ orders — server đã làm rồi (qua `upsertFromInvoice`)
- [ ] Form sửa: chỉ cho phép sửa `customerName` và `gender`

### `Orders.jsx`
- [ ] `salesInvoiceService.getAll(filters)` load list (filter `from`, `to`, `status`)
- [ ] Click chi tiết → `salesInvoiceService.getById(id)` hiện `lines[]` + `grossProfit`
- [ ] Nút "Hủy HĐ" (ADMIN) → `salesInvoiceService.cancel(id)`
- [ ] Nút "Trả hàng" → modal chọn lines + qty + refund → `salesReturnService.create(...)`
- [ ] Trạng thái: `COMPLETED` / `CANCELLED` / `RETURNED` (đổi text hiển thị)
- [ ] PDF xuất hóa đơn giữ nguyên, dùng data từ `getById`

### `Sales.jsx` (POS)
- [ ] Bỏ load thuốc từ context → gọi `medicineService.getAll({ search, isActive: true })`
- [ ] Khi user nhập SĐT → debounce gọi `customerService.lookup(phone)` để hiện tên gợi ý
- [ ] Khi checkout → `salesInvoiceService.create({ customerName, phone, items: cart.map(c => ({ medicineId, quantity, batchId? })) })`
- [ ] Nhận response `lines[]` và in hóa đơn (PDF) từ đó
- [ ] **Bỏ logic `consumeStock`** — BE tự trừ FIFO
- [ ] Hiển thị error `INSUFFICIENT_STOCK` / `BATCH_EXPIRED` / `BATCH_MEDICINE_MISMATCH` nếu có
- [ ] **(KHUYẾN NGHỊ) Cảnh báo HSD khi thêm vào giỏ:**
  - Khi click 1 SP để thêm vào giỏ → gọi `medicineService.getBatches(medicineId)` để xem lô gần hết hạn nhất
  - Mỗi batch trả về có `daysUntilExpiry` (số ngày từ hôm nay đến HSD, âm = đã quá hạn)
  - Nếu lô gần nhất có `daysUntilExpiry < 14` (cấu hình tuỳ ý) → hiện cảnh báo:
    ```
    ⚠️ Lô gần hết hạn nhất (PN000001-L01) còn 3 ngày HSD.
       Khách dự kiến dùng dài hạn?
       [ Đồng ý FIFO mặc định ] [ Chọn lô khác ]
    ```
  - Nếu dược sĩ "Chọn lô khác" → mở modal danh sách lô, mỗi lô hiển thị `batchId`, `expiryDate`, `currentQty`, `daysUntilExpiry`. Lô đã hết hạn (`isExpired=true`) bị disable
  - Khi dược sĩ chọn lô → gán `batchId` vào item của giỏ hàng, gửi kèm trong payload `create`
- [ ] Khi giỏ có item với `batchId` cụ thể → hiển thị badge "Lô: PN000001-L01 (HSD: 30/05/2026)"

### `Employees.jsx`
- [ ] `employeeService.getAll()` load
- [ ] **Thêm form tạo nhân viên** (BE có endpoint nhưng FE hiện chưa có)
- [ ] Đổi role: `employeeService.update(id, { roleId: 'STAFF' })`
- [ ] Bật/tắt: `employeeService.update(id, { isActive: true/false })` hoặc `DELETE` để soft delete

### `Profile.jsx`
- [ ] Load info: `authService.getMe()`
- [ ] Sửa fullName/email/phone: `authService.updateMe({ fullName, phone, email })` — ADMIN và STAFF đều dùng được
- [ ] Đổi MK: `employeeService.changePassword(myId, currentPassword, newPassword)`

---

## 12. Các trang nên thêm mới

| Trang | Vai trò | Endpoints |
|-------|---------|-----------|
| **Master Data** (Admin) | CRUD `Unit`, `Category`, `Supplier`, `Manufacturer` | `/units`, `/categories`, `/suppliers`, `/manufacturers` |
| **Cảnh báo** (Admin + Staff) | Xem `InventoryAlert`, ADMIN resolve/reject | `/alerts/*` |
| **Thông báo** (Header dropdown) | Chuông + dropdown list | `/notifications/*` |
| **Phiếu nhập** (Admin) | List `/purchase-receipts`, xem chi tiết, có thể hủy | `/purchase-receipts/*` |
| **Phiếu hủy** (Admin) | List `/stock-writeoffs`, xem chi tiết | `/stock-writeoffs` (GET/POST) |
| **Phiếu trả** (Admin) | List `/sales-returns` | `/sales-returns` (GET) |

Có thể gộp 3 mục cuối thành 1 trang "Nghiệp vụ kho" có tabs.

---

## 13. Các lỗi thường gặp khi tích hợp

### CORS lỗi
```
Access to XMLHttpRequest at 'http://localhost:3001/api/...' from origin 'http://localhost:5173' has been blocked by CORS policy
```
**Sửa:** `BACKEND-HQT/.env` cập nhật `CORS_ORIGIN=http://localhost:5173` rồi restart BE.

### `null` từ API hiện thành "null" trên UI
Một vài field (vd `phoneSnapshot`, `customerNameSnapshot`) có thể là `null`. Khi render dùng `?? '-'` thay vì `||`.

### Token format
- Header phải là `Authorization: Bearer <token>` (đã có trong interceptor)
- Không quote/wrap token

### Date / DateTime
- BE trả ISO string (vd `'2026-05-20T07:30:00.000Z'`)
- FE muốn `'20/05/2026 14:30'` → dùng `new Date(str).toLocaleString('vi-VN')`
- BE nhận `from`/`to` ở reports theo định dạng `YYYY-MM-DD`

### Decimal precision
BE trả các trường tiền dạng `Number` (đã parse từ DECIMAL). Format `.toLocaleString('vi-VN')` để hiển thị "1.500.000".

### `medicineId` text vs auto
Hiện BE **yêu cầu FE truyền `medicineId`** khi tạo thuốc (vd `'SP001'`). Nếu muốn auto-generate, có thể sửa BE sau (xem `medicine.service.js`). Tạm thời FE tự sinh hoặc nhập tay theo quy ước (`SP` + số).

### Sales POS — race condition
2 staff bán cùng 1 lô cùng lúc: BE đã có `WITH (UPDLOCK, ROWLOCK)`, sẽ không bug. FE chỉ cần handle `INSUFFICIENT_STOCK` (toast + refresh stock).

### Sales POS — cảnh báo HSD khi thêm SP vào giỏ

Snippet tham khảo:

```javascript
// khi user click them SP 'SP001' vao gio hang
async function addToCart(medicineId) {
  const result = await medicineService.getBatches(medicineId)
  const usableBatches = result.data.filter(b => !b.isExpired && b.currentQty > 0)

  if (usableBatches.length === 0) {
    toast.error('Sản phẩm đã hết hàng')
    return
  }

  const earliest = usableBatches[0]  // BE da ORDER BY ExpiryDate ASC
  const WARN_THRESHOLD_DAYS = 14

  if (earliest.daysUntilExpiry < WARN_THRESHOLD_DAYS) {
    const ok = await confirm(
      `Lô gần nhất (${earliest.batchId}) còn ${earliest.daysUntilExpiry} ngày HSD.\n` +
      `Khách dùng dài hạn? Bấm OK để xem các lô khác.`
    )
    if (ok) {
      // mo modal cho user chon lo - ham nay tu viet
      const chosenBatchId = await openBatchPicker(usableBatches)
      cart.push({ medicineId, quantity: 1, batchId: chosenBatchId })
      return
    }
  }

  // mac dinh: FIFO (khong gan batchId)
  cart.push({ medicineId, quantity: 1 })
}
```

### Hết hạn token khi đang dùng app
Interceptor đã auto-redirect `/login`. Hoặc FE có thể thêm timer kiểm tra `exp` claim của JWT (decode bằng `jwt-decode`) để cảnh báo trước 5 phút.

### Lỗi "404 NOT_FOUND" cho route đúng
Kiểm tra:
- `VITE_API_URL` có **dấu `/api`** ở cuối không? Nếu service file gọi `/medicines` thì `baseURL` phải kết thúc bằng `/api`.
- Mount path trên BE: `app.use('/api/medicines', ...)` — đúng.

---

## Kết luận

Sau khi áp dụng đầy đủ hướng dẫn:

1. **Toàn bộ data FE đến từ BE qua REST API** (không còn mock)
2. **Auth dùng JWT** thay vì user object trong `localStorage`
3. **Form fields** match đúng với schema DB (bỏ VAT, discount, payment method, barcode, ShelfLocation, ContactPerson, Email khách, DOB)
4. **Phân quyền** rõ ràng theo role (ADMIN/STAFF)
5. **Có sẵn các endpoint** cho mọi chức năng hiện có + thêm: master data, cảnh báo, thông báo, phiếu trả, phiếu hủy

Khuyến nghị **làm theo thứ tự**:

1. Setup `apiClient` + service files (1–2 buổi)
2. Sửa Auth flow (Login + ProtectedRoute) — chạy được trang Profile + Admin Home (1 buổi)
3. Sửa Medicines + Inventory — luồng nhập hàng đầu cuối (1–2 buổi)
4. Sửa Sales (POS) + Orders — luồng bán hàng (1–2 buổi)
5. Customers + Employees (1 buổi)
6. Reports + Alerts + Notifications (1 buổi)
7. Master data (Units/Categories/Suppliers/Manufacturers) (1 buổi)

Tổng cộng **~7–10 buổi** cho 1 dev FE quen tay.

Nếu có vướng mắc, đọc thêm:
- `BACKEND-HQT/README.md` — kiến trúc tổng thể
- `BACKEND-HQT/docs/*.md` — chi tiết từng module (API spec, validation, lưu ý)
- `database/db-explanation.html` — giải thích schema DB
