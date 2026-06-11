# BACKEND-HQT — Backend API cho Hệ thống Quản lý Tài chính Nhà thuốc

## Tổng quan

Backend RESTful API phục vụ cho ứng dụng quản lý tài chính nhà thuốc (`FontEndHQTCS`).  
Thay thế hoàn toàn `InventoryAlertContext` (in-memory + localStorage) bằng dữ liệu thật từ SQL Server.

---

## Stack công nghệ

| Hạng mục | Công nghệ | Lý do chọn |
|---------|-----------|------------|
| Runtime | **Node.js 20 LTS** | Đồng bộ với FE vốn đã là JS |
| Framework | **Express 4** | Gọn, phổ biến, dễ học |
| Database driver | **mssql 10** | Kết nối SQL Server, hỗ trợ connection pool + transaction |
| Auth | **jsonwebtoken** + **bcryptjs** | JWT stateless, bcrypt hash mật khẩu |
| Validation | **zod** | Validate request body, trả lỗi rõ ràng |
| Biến môi trường | **dotenv** | Tách cấu hình ra file `.env` |
| Dev tooling | **nodemon** | Auto-reload khi phát triển |
| CORS | **cors** | Cho phép FE (`localhost:5173`) gọi API |

---

## Kiến trúc thư mục

```
BACKEND-HQT/
├── src/
│   ├── app.js                  ← Khởi tạo Express app, đăng ký middleware + routes
│   ├── server.js               ← Điểm khởi động (listen port)
│   ├── config/
│   │   └── db.js               ← SQL Server connection pool
│   ├── middleware/
│   │   ├── auth.js             ← Kiểm tra JWT, gắn req.user
│   │   ├── requireRole.js      ← Kiểm tra role (ADMIN/STAFF)
│   │   └── errorHandler.js     ← Global error handler
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── employee.routes.js
│   │   ├── masterData.routes.js
│   │   ├── medicine.routes.js
│   │   ├── purchaseReceipt.routes.js
│   │   ├── customer.routes.js
│   │   ├── salesInvoice.routes.js
│   │   ├── salesReturn.routes.js
│   │   ├── stockWriteOff.routes.js
│   │   ├── alert.routes.js
│   │   └── report.routes.js
│   ├── controllers/            ← Nhận req/res, gọi service
│   ├── services/               ← Xử lý logic nghiệp vụ, gọi DB
│   └── utils/
│       ├── AppError.js         ← Class lỗi có statusCode
│       └── catchAsync.js       ← Bọc async controller, tránh try-catch lặp
├── docs/                       ← Tài liệu prompt cho từng module
│   ├── 00-setup.md
│   ├── 01-database-connection.md
│   ├── 02-auth.md
│   ├── ...
├── .env.example                ← Mẫu biến môi trường
├── .gitignore
└── package.json
```

---

## Luồng request

```
FE (React)
  │  HTTP Request (+ Authorization: Bearer <JWT>)
  ▼
Express Router
  │
  ▼
Middleware: auth.js → xác thực JWT → gắn req.user
  │
  ▼
Middleware: requireRole.js → kiểm tra quyền (nếu cần)
  │
  ▼
Controller → validate input (zod) → gọi Service
  │
  ▼
Service → xử lý nghiệp vụ → gọi DB (mssql pool / transaction)
  │
  ▼
DB: SQL Server (PharmacyFinance)
  │
  ◄── Kết quả
  │
Controller → trả về JSON { success, data } hoặc gọi next(error)
  │
  ▼ (nếu lỗi)
errorHandler.js → trả { success: false, message, code }
```

---

## Quy tắc API

### URL convention
```
GET    /api/medicines               ← Lấy danh sách
GET    /api/medicines/:id           ← Lấy 1 bản ghi
POST   /api/medicines               ← Tạo mới
PATCH  /api/medicines/:id           ← Cập nhật 1 phần
DELETE /api/medicines/:id           ← Xóa (thường là soft-delete IsActive=0)
```

### Response format thống nhất
```json
// Thành công
{
  "success": true,
  "data": { ... },           // hoặc [ ... ] nếu là list
  "meta": {                  // chỉ có khi trả về list
    "total": 100,
    "page": 1,
    "limit": 20
  }
}

// Lỗi
{
  "success": false,
  "message": "Không tìm thấy thuốc với mã SP999",
  "code": "MEDICINE_NOT_FOUND"
}
```

### HTTP Status Codes
| Code | Khi nào dùng |
|------|-------------|
| 200 | GET/PATCH thành công |
| 201 | POST tạo mới thành công |
| 400 | Validation lỗi (zod) |
| 401 | Chưa đăng nhập / token hết hạn |
| 403 | Không đủ quyền |
| 404 | Không tìm thấy resource |
| 409 | Conflict (vd: trùng username) |
| 500 | Lỗi server không lường trước |

---

## Danh sách tất cả API endpoint

### Auth
```
POST   /api/auth/register           ← Đăng ký tài khoản (public, luôn tạo STAFF)
POST   /api/auth/login              ← Đăng nhập → trả JWT
POST   /api/auth/logout             ← Đăng xuất (invalidate token phía FE)
GET    /api/auth/me                 ← Lấy thông tin user đang đăng nhập
PATCH  /api/auth/me                 ← Cập nhật hồ sơ cá nhân (fullName, phone, email)
```

### Employee
```
GET    /api/employees               ← [ADMIN] Danh sách nhân viên
GET    /api/employees/:id
POST   /api/employees               ← [ADMIN] Tạo nhân viên (chọn ADMIN hoặc STAFF)
PATCH  /api/employees/:id           ← [ADMIN] Cập nhật (bao gồm đổi role)
PATCH  /api/employees/:id/password  ← Đổi MK (tự đổi cần MK cũ; ADMIN đặt MK mới cho NV)
DELETE /api/employees/:id           ← [ADMIN] Soft-delete (IsActive=0)
```

### Master Data (Danh mục chung)
```
GET    /api/units                   ← Danh sách đơn vị tính
GET    /api/categories              ← Danh sách nhóm thuốc
POST   /api/categories

GET    /api/suppliers               ← [ADMIN] Danh sách NCC
POST   /api/suppliers
PATCH  /api/suppliers/:id

GET    /api/manufacturers           ← Danh sách hãng SX
POST   /api/manufacturers
```

### Medicine
```
GET    /api/medicines               ← Danh sách thuốc (filter: type, category, search, isActive)
GET    /api/medicines/:id           ← Chi tiết 1 thuốc (kèm batches)
GET    /api/medicines/:id/batches   ← Danh sách lô của 1 thuốc
GET    /api/medicines/:id/stock     ← Tồn kho thực = SUM(CurrentQty) lô còn hạn
POST   /api/medicines               ← [ADMIN] Tạo thuốc
PATCH  /api/medicines/:id           ← [ADMIN] Cập nhật
PATCH  /api/medicines/:id/deactivate ← [ADMIN] Ngừng kinh doanh (IsActive=0)
```

### Purchase Receipt (Nhập hàng)
```
GET    /api/purchase-receipts       ← [ADMIN] Danh sách phiếu nhập
GET    /api/purchase-receipts/:id   ← Chi tiết phiếu nhập + lines
POST   /api/purchase-receipts       ← [ADMIN] Tạo phiếu nhập (transaction)
PATCH  /api/purchase-receipts/:id/cancel ← [ADMIN] Hủy phiếu DRAFT
```

### Customer
```
GET    /api/customers               ← [ADMIN] Danh sách KH + tổng chi
GET    /api/customers/:id           ← Chi tiết KH
GET    /api/customers/:id/invoices  ← Lịch sử mua hàng
POST   /api/customers/lookup        ← Tìm KH theo phone (dùng lúc bán)
```

### Sales Invoice (Bán hàng)
```
GET    /api/sales-invoices          ← Danh sách HĐ (filter: date, status, customer)
GET    /api/sales-invoices/:id      ← Chi tiết HĐ + lines + profit gộp
POST   /api/sales-invoices          ← Tạo HĐ (FIFO mặc định, hỗ trợ chỉ định batchId)
PATCH  /api/sales-invoices/:id/cancel ← Hủy HĐ (hoàn tồn lô)
```

### Sales Return (Trả hàng)
```
GET    /api/sales-returns           ← [ADMIN] Danh sách phiếu trả
GET    /api/sales-returns/:id       ← [ADMIN] Chi tiết phiếu trả
POST   /api/sales-returns           ← [ADMIN/STAFF] Tạo phiếu trả (transaction: hoàn tồn lô gốc)
```

### Stock Write-Off (Hủy hàng hết hạn)
```
GET    /api/stock-writeoffs
GET    /api/stock-writeoffs/:id
GET    /api/stock-writeoffs/expiring ← Lấy danh sách lô hết hạn hoặc sắp hết hạn
POST   /api/stock-writeoffs          ← [ADMIN] Tạo phiếu hủy (transaction)
```

### Alert & Notification
```
GET    /api/alerts                  ← Danh sách cảnh báo tồn/HSD
GET    /api/alerts/:id
PATCH  /api/alerts/:id/resolve      ← [ADMIN] Xử lý cảnh báo
PATCH  /api/alerts/:id/reject

GET    /api/notifications           ← Thông báo cho user đang đăng nhập
PATCH  /api/notifications/:id/read  ← Đánh dấu đã đọc
PATCH  /api/notifications/read-all  ← Đọc tất cả
```

### Reports (Báo cáo)
```
GET    /api/reports/profit-loss     ← Báo cáo P&L theo kỳ (?from=&to=)
GET    /api/reports/revenue         ← Doanh thu theo ngày/tháng
GET    /api/reports/top-medicines   ← Thuốc bán chạy nhất
GET    /api/reports/inventory-value ← Giá trị tồn kho
GET    /api/reports/disposal-cost   ← Chi phí hủy hàng theo kỳ
```

---

## Các luồng nghiệp vụ phức tạp cần transaction

### 1. Tạo phiếu nhập hàng
```
BEGIN TRANSACTION
  INSERT PurchaseReceipt (header)
  FOR EACH line:
    INSERT MedicineBatch (lô mới, CurrentQty = InitialQty)
    INSERT PurchaseReceiptLine
  UPDATE PurchaseReceipt.TotalAmount = SUM(LineTotal)
COMMIT
```

### 2. Tạo hóa đơn bán hàng (phức tạp nhất)
```
BEGIN TRANSACTION
  Upsert Customer (theo Phone)
  INSERT SalesInvoice (header)
  FOR EACH item trong giỏ:
    NẾU item có 'batchId' (FE chỉ định lô cụ thể):
      Lock lô → check tồn, thuốc khớp, lô còn hạn → INSERT 1 SalesInvoiceLine
    NGƯỢC LẠI (FIFO mặc định):
      SELECT batches theo MedicineId, ExpiryDate ASC, CurrentQty > 0
      Phân phối số lượng qua các lô (có thể 1 item → nhiều BatchId)
      FOR EACH lô được chọn:
        INSERT SalesInvoiceLine (CostPriceSnapshot = batch.ImportPrice)
        UPDATE MedicineBatch SET CurrentQty -= qty (WITH UPDLOCK)
  UPDATE SalesInvoice.TotalAmount = SUM(LineTotal)
  UPDATE Customer.TotalSpent += TotalAmount
  -- Sau commit: alertService.checkAndCreateLowStockAlert cho từng SP (async)
COMMIT
```

### 3. Trả hàng
```
BEGIN TRANSACTION
  INSERT SalesReturn (header)
  FOR EACH dòng trả:
    INSERT SalesReturnLine (tham chiếu InvoiceLineId gốc)
    UPDATE MedicineBatch SET CurrentQty += qty (lô gốc từ InvoiceLine)
  UPDATE SalesReturn.TotalRefund = SUM(RefundAmount)
  UPDATE Customer.TotalSpent -= TotalRefund
  UPDATE SalesInvoice.Status = 'RETURNED' nếu tất cả đã trả
COMMIT
```

### 4. Hủy hàng hết hạn
```
BEGIN TRANSACTION
  INSERT StockWriteOff (header)
  FOR EACH lô hết hạn:
    INSERT StockWriteOffLine (Quantity = CurrentQty, UnitCost = ImportPrice snapshot)
    UPDATE MedicineBatch SET CurrentQty = 0
  UPDATE StockWriteOff.TotalCost = SUM(LineCost)
COMMIT
```

---

## Phân quyền

| Endpoint | ADMIN | STAFF |
|---------|-------|-------|
| Đăng nhập | ✅ | ✅ |
| Xem danh mục thuốc | ✅ | ✅ |
| Xem tồn kho + lô | ✅ | ✅ |
| Tạo hóa đơn bán hàng | ✅ | ✅ |
| Xem hóa đơn của mình | ✅ | ✅ |
| Xem tất cả hóa đơn | ✅ | ❌ |
| Tạo phiếu trả hàng | ✅ | ✅ |
| Tạo/sửa thuốc | ✅ | ❌ |
| Nhập hàng | ✅ | ❌ |
| Hủy hàng hết hạn | ✅ | ❌ |
| Quản lý nhân viên | ✅ | ❌ |
| Xem báo cáo tài chính | ✅ | ❌ |
| Xử lý cảnh báo | ✅ | ❌ |

---

## Biến môi trường (.env)

```env
# Server
PORT=3001
NODE_ENV=development

# SQL Server
DB_SERVER=localhost
DB_DATABASE=PharmacyFinance
DB_USER=sa
DB_PASSWORD=your_password_here
DB_TRUST_SERVER_CERTIFICATE=true
DB_ENCRYPT=false

# JWT
JWT_SECRET=pharmacy_secret_key_change_in_production
JWT_EXPIRES_IN=8h

# CORS - Địa chỉ Frontend
CORS_ORIGIN=http://localhost:5173
```



