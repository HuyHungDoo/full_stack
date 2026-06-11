# Báo cáo Phân tích Thiết kế CSDL — Hệ thống Quản lý Tài chính Nhà thuốc

> **DBMS:** Microsoft SQL Server  
> **Phạm vi:** 1 nhà thuốc duy nhất (không có chi nhánh)  
> **Đối tượng sử dụng:** Chủ nhà thuốc/Admin, Nhân viên bán hàng  
> **Chuẩn hóa:** 3NF (có ngoại lệ snapshot trên dòng hóa đơn để giữ tính bất biến của chứng từ)

**Phạm vi tài chính cốt lõi:**
- ✅ Doanh thu bán thuốc (`SalesInvoice` + `SalesInvoiceLine`)
- ✅ Chi phí nhập hàng (`PurchaseReceipt` + `PurchaseReceiptLine`)
- ✅ Lợi nhuận gộp qua `CostPriceSnapshot` (giá vốn FIFO)
- ✅ Quản lý lô / hạn sử dụng (`MedicineBatch`)
- ✅ Trả hàng (`SalesReturn` + `SalesReturnLine`) → giảm doanh thu thực
- ✅ Hủy hàng hết hạn (`StockWriteOff` + `StockWriteOffLine`) → chi phí hủy

---

## 1. Giải thích Kiến trúc CSDL

Hệ thống gồm **19 bảng** chia thành **8 module** theo trục nghiệp vụ tài chính, mỗi bảng phục vụ một mục đích duy nhất và đạt 3NF.

### 1.1. Sơ đồ logic 8 module

```
┌─────────────────────────────────────────────────────────────────────┐
│  M1. DANH MỤC CHUNG                                                 │
│  Role · Employee · Unit · MedicineCategory · Supplier · Manufacturer│
└─────────────────────────────────────────────────────────────────────┘
        ↓                                            ↓
┌──────────────────────┐                ┌─────────────────────────────┐
│  M2. THUỐC & LÔ HÀNG │                │  M3. KHÁCH HÀNG             │
│  Medicine            │                │  Customer                   │
│  MedicineBatch       │                └─────────────────────────────┘
└──────────────────────┘                          ↓
        ↓               ↘                         │
        │                ↘                        │
┌────────────────────────┐    ┌─────────────────────────────────────┐
│  M4. NHẬP HÀNG         │    │  M5. BÁN HÀNG                       │
│  PurchaseReceipt       │    │  SalesInvoice                       │
│  PurchaseReceiptLine   │    │  SalesInvoiceLine                   │
└────────────────────────┘    └─────────────────────────────────────┘
                                          ↓
                              ┌─────────────────────────────────────┐
                              │  M6. TRẢ HÀNG                       │
                              │  SalesReturn · SalesReturnLine      │
                              └─────────────────────────────────────┘

┌──────────────────────────────┐   ┌──────────────────────────────────┐
│  M7. HỦY HÀNG HẾT HẠN        │   │  M8. CẢNH BÁO & THÔNG BÁO        │
│  StockWriteOff               │   │  InventoryAlert · Notification   │
│  StockWriteOffLine           │   └──────────────────────────────────┘
└──────────────────────────────┘
```

### 1.2. Lý do chia bảng để đáp ứng bài toán TÀI CHÍNH

| Bảng | Lý do tồn tại |
|------|--------------|
| `Role`, `Unit`, `MedicineCategory`, `Supplier`, `Manufacturer` | **Tách bảng danh mục** để loại bỏ phụ thuộc bắc cầu (vi phạm 3NF nếu nhét string vào `Medicine`). Khi đổi tên đơn vị/NCC chỉ sửa **1 dòng**. |
| `Employee` | Là **chủ thể của mọi nghiệp vụ tài chính**: lập hóa đơn (`SalesInvoice.EmployeeId`), nhập hàng (`PurchaseReceipt.EmployeeId`), hủy hàng (`StockWriteOff.EmployeeId`). Truy vết trách nhiệm. |
| `Medicine` | Thông tin "master" của thuốc (tên, đăng ký, giá niêm yết). **Không** chứa số lượng tồn — vì tồn kho phải tính theo lô. |
| `MedicineBatch` | **Chìa khóa của bài toán tài chính**: mỗi lô có **giá nhập riêng** và **HSD riêng**. Có lô mới biết: (1) giá vốn FIFO khi bán, (2) lô nào sắp hết hạn để hủy, (3) chi phí hủy hàng thực tế. |
| `Customer` | Tách khỏi `SalesInvoice` để phân tích doanh thu theo khách hàng + lịch sử mua. `Customer 'KH000000'` đại diện cho "Khách lẻ". |
| `PurchaseReceipt` / `PurchaseReceiptLine` | **Đầu vào chi phí mua hàng** = phần lớn chi phí của nhà thuốc. Mỗi dòng chi tiết sinh **đúng 1 lô** (`UNIQUE BatchId`). |
| `SalesInvoice` / `SalesInvoiceLine` | **Đầu ra doanh thu**. Dòng chứa `CostPriceSnapshot` (giá vốn snapshot) → tính lợi nhuận gộp ngay tại thời điểm bán, không phụ thuộc vào giá nhập đã thay đổi sau này. |
| `SalesReturn` / `SalesReturnLine` | Trả hàng → **giảm doanh thu thực** + **trả tồn vào lô gốc**. Tách bảng riêng (không sửa `SalesInvoice`) để giữ tính bất biến của bút toán bán. |
| `StockWriteOff` / `StockWriteOffLine` | Khi lô **hết hạn** hoặc **hỏng/mất** → tạo phiếu hủy = **bút toán chi phí hủy hàng**. Trừ `CurrentQty` về 0 của lô, ghi nhận chi phí theo giá vốn của lô. |
| `InventoryAlert`, `Notification` | Hỗ trợ vận hành (cảnh báo tồn thấp / sắp hết hạn). Cần thiết để Frontend hiển thị widget cảnh báo. |

### 1.3. Các quyết định chuẩn hóa 3NF nổi bật

1. **Tách `Unit`** ra khỏi `Medicine`: dùng `UnitId` thay vì lưu chuỗi `UnitName`.
2. **Tách `Manufacturer`** khỏi `Medicine` và `MedicineBatch`: hãng SX là một thực thể độc lập.
3. **Tách `Supplier`** khỏi `MedicineBatch`: 1 lô do 1 NCC cấp, 1 NCC cấp nhiều lô → 1-N chuẩn.
4. **Snapshot trên dòng hóa đơn** (`MedicineNameSnapshot`, `UnitNameSnapshot`, `CostPriceSnapshot`): **đây là ngoại lệ có chủ đích so với 3NF nghiêm ngặt** — vì hóa đơn là chứng từ tài chính bất biến (xem chi tiết ở `implementation-notes.md`).
5. **`Medicine.ListPrice`** lưu giá niêm yết hiện hành; còn **giá nhập (cost)** sống ở `MedicineBatch.ImportPrice` — vì 1 thuốc có nhiều lô với giá nhập khác nhau theo thời gian.

---

## 2. Luồng Nghiệp vụ Xử lý (Workflows)

### 2.1. Workflow 1 — Nhập hàng từ Nhà cung cấp

**Mục đích:** Ghi nhận chi phí mua hàng & tăng tồn kho.

```
[Admin] → Tạo PurchaseReceipt(SupplierId, EmployeeId, Date)
        → Với mỗi sản phẩm nhập:
            1. Tạo MedicineBatch mới (BatchId tự sinh, ImportPrice, ExpiryDate,
                                       InitialQty = Quantity, CurrentQty = Quantity,
                                       SupplierId, ManufacturerId)
            2. Tạo PurchaseReceiptLine (ReceiptId, MedicineId, BatchId,
                                        Quantity, UnitCost, LineTotal)
        → Cập nhật TotalAmount = SUM(LineTotal)
        → Status = 'COMPLETED'
```

**Bút toán tài chính phát sinh:**
- **Tổng chi phí nhập** trong kỳ = `SUM(PurchaseReceipt.TotalAmount WHERE Status='COMPLETED' AND ReceiptDate BETWEEN @from AND @to)`

---

### 2.2. Workflow 2 — Bán hàng tại quầy (POS)

**Mục đích:** Ghi nhận doanh thu, trừ tồn theo FIFO, lưu giá vốn snapshot để tính lợi nhuận gộp.

```
[Staff] → Bước 0 — Upsert khách hàng:
            IF user nhập SĐT:
                SELECT CustomerId FROM Customer WHERE Phone = @phone
                IF chưa có → INSERT Customer(CustomerName, Phone)  -- sinh ra hồ sơ KH từ HĐ
            ELSE
                CustomerId = 'KH000000'  -- khách lẻ

        → Tạo SalesInvoice (Header)
            InvoiceId, EmployeeId, CustomerId,
            CustomerNameSnapshot, PhoneSnapshot

        → Với mỗi sản phẩm:
            1. Chọn lô xuất theo FIFO:
                  SELECT TOP 1 BatchId, ImportPrice, ExpiryDate
                  FROM MedicineBatch
                  WHERE MedicineId = @M
                    AND CurrentQty > 0
                    AND ExpiryDate >= GETDATE()
                  ORDER BY ExpiryDate ASC
            2. Nếu CurrentQty của lô < Quantity → tách thành nhiều dòng
               (nhiều SalesInvoiceLine cùng MedicineId nhưng khác BatchId)
            3. Tạo SalesInvoiceLine:
                  UnitPrice         = Medicine.ListPrice (snapshot)
                  CostPriceSnapshot = MedicineBatch.ImportPrice (snapshot)
                  LineTotal         = Quantity * UnitPrice
            4. Trừ tồn: MedicineBatch.CurrentQty -= Quantity (CHECK CK_Batch_CurrentQty)

        → Tổng hợp:
            TotalAmount = SUM(LineTotal)
        → Customer.TotalSpent += TotalAmount  (cập nhật qua trigger / backend)
        → Status = 'COMPLETED'
```

**Lợi nhuận gộp (Gross Profit) tức thời cho 1 hóa đơn:**
```
GrossProfit = SUM(LineTotal - Quantity * CostPriceSnapshot)
            = SUM(Quantity * (UnitPrice - CostPriceSnapshot))
```

---

### 2.3. Workflow 3 — Trả hàng

**Mục đích:** Giảm doanh thu thực, trả tồn vào lô gốc.

```
[Staff/Admin] → Mở SalesInvoice → Chọn dòng cần trả
              → Tạo SalesReturn (InvoiceId, EmployeeId)
              → Với mỗi dòng trả:
                  1. Tạo SalesReturnLine(InvoiceLineId, Quantity, RefundAmount)
                  2. Hoàn tồn:
                     MedicineBatch.CurrentQty += Quantity  (về đúng lô đã xuất)
              → TotalRefund = SUM(RefundAmount)

              → Nếu tất cả dòng đã trả hết:
                  SalesInvoice.Status = 'RETURNED'
              → Customer.TotalSpent -= TotalRefund
```

**Doanh thu thuần (Net Revenue) trong kỳ:**
```
NetRevenue = SUM(SalesInvoice.TotalAmount WHERE Status='COMPLETED')
           - SUM(SalesReturn.TotalRefund   WHERE Status='COMPLETED')
```

---

### 2.4. Workflow 4 — Hủy hàng hết hạn

**Mục đích:** Ghi nhận chi phí hủy hàng & cập nhật tồn về 0.

```
[Admin] → Định kỳ quét MedicineBatch WHERE ExpiryDate < TODAY AND CurrentQty > 0
        → Tạo StockWriteOff (EmployeeId, Reason='Hết hạn sử dụng')
        → Với mỗi lô hết hạn:
            1. Tạo StockWriteOffLine:
                 BatchId, MedicineId, Quantity = CurrentQty,
                 UnitCost = ImportPrice (snapshot),
                 LineCost = Quantity * UnitCost
            2. MedicineBatch.CurrentQty = 0
        → TotalCost = SUM(LineCost)
        → Status = 'COMPLETED'
```

**Chi phí hủy hàng trong kỳ:**
```
DisposalCost = SUM(StockWriteOff.TotalCost WHERE Status='COMPLETED'
                                             AND WriteOffDate BETWEEN @from AND @to)
```

---

### 2.5. Workflow 5 — Báo cáo Lợi nhuận theo Kỳ

Công thức Profit & Loss (P&L) đơn giản dựa trên các bút toán trong CSDL:

```sql
DECLARE @from DATE = '2026-05-01', @to DATE = '2026-05-31';

WITH Revenue AS (
    SELECT SUM(TotalAmount) AS GrossRevenue
    FROM dbo.SalesInvoice
    WHERE Status = N'COMPLETED'
      AND InvoiceDate BETWEEN @from AND @to
),
Returns AS (
    SELECT SUM(TotalRefund) AS TotalRefund
    FROM dbo.SalesReturn
    WHERE Status = N'COMPLETED'
      AND ReturnDate BETWEEN @from AND @to
),
COGS AS (
    SELECT SUM(il.Quantity * il.CostPriceSnapshot) AS Cogs
    FROM dbo.SalesInvoiceLine il
    JOIN dbo.SalesInvoice si ON si.InvoiceId = il.InvoiceId
    WHERE si.Status = N'COMPLETED'
      AND si.InvoiceDate BETWEEN @from AND @to
),
Disposal AS (
    SELECT SUM(TotalCost) AS DisposalCost
    FROM dbo.StockWriteOff
    WHERE Status = N'COMPLETED'
      AND WriteOffDate BETWEEN @from AND @to
)
SELECT
    R.GrossRevenue                                                AS DoanhThuGop,
    ISNULL(Rt.TotalRefund, 0)                                     AS TienHoanTra,
    R.GrossRevenue - ISNULL(Rt.TotalRefund, 0)                    AS DoanhThuThuan,
    C.Cogs                                                        AS GiaVonHangBan,
    R.GrossRevenue - ISNULL(Rt.TotalRefund, 0) - C.Cogs           AS LoiNhuanGop,
    ISNULL(D.DisposalCost, 0)                                     AS ChiPhiHuyHang,
    R.GrossRevenue - ISNULL(Rt.TotalRefund, 0) - C.Cogs
                   - ISNULL(D.DisposalCost, 0)                    AS LoiNhuanSauHuyHang
FROM Revenue R, Returns Rt, COGS C, Disposal D;
```

> 📌 Đây là "Lợi nhuận sau hủy hàng" — chưa phải Net Profit kế toán vì hệ thống không quản lý chi phí vận hành (lương, mặt bằng, điện nước…). Tuy nhiên, nó **đã đủ phản ánh hiệu quả kinh doanh thuốc** của nhà thuốc (mua vào – bán ra – hao hụt do hết hạn).

---

## 3. Đánh giá và Hạn chế của Frontend

Dưới góc nhìn của **Database Architect** & **Business Analyst tài chính**, FE đáp ứng các nghiệp vụ cơ bản nhưng còn các thiếu sót sau:

### 3.1. Thiếu sót về quản lý Lô (Batch)

| # | Thiếu sót | Tác động | Đề xuất khắc phục |
|---|-----------|----------|-------------------|
| 1 | **Chọn lô khi bán hàng** không hiển thị | `Sales.jsx` chỉ trừ tổng tồn — FE/BE phải tự chạy FIFO ngầm | Hiển thị popup "Chọn lô" khi có >1 lô khả dụng, mặc định lô HSD gần nhất |
| 2 | **Không có form Phiếu nhập** (`PurchaseReceipt`) độc lập | Hiện tại `Inventory.jsx > openImportModal` chỉ tạo lô đơn lẻ → mỗi lần nhập 10 thuốc phải mở 10 lần | Tạo `/admin/purchase-receipts` với 1 phiếu = nhiều dòng + thông tin NCC, tổng tiền |
| 3 | **`importPrice` của batch** có khi rỗng trong dữ liệu seed | Lô bị thiếu giá nhập → không tính được COGS chính xác | Bắt buộc `importPrice` khi nhập lô; validate `> 0` |
| 4 | **Không có module Hủy hàng chính thức** | FE chỉ "ẩn lô hết hạn" → không ghi chi phí hủy → báo cáo lợi nhuận **sai** | Khi `isBatchExpired(batch)`, thêm nút **"Lập phiếu hủy"** → ghi vào `StockWriteOff` |

### 3.2. Thiếu sót về Khách hàng & Hóa đơn

| # | Thiếu sót | Tác động | Đề xuất |
|---|-----------|----------|---------|
| 5 | **Customer chưa có khóa định danh chính thức** (FE: `customersFromOrders` chỉ gom theo tên+SĐT) | Đổi tên KH thì lịch sử mua bị tách thành 2 KH khác nhau | BE cần upsert KH theo `Phone` (UNIQUE filtered) ngay khi tạo HĐ → gắn `CustomerId` cố định |
| 6 | **Không có `CustomerId` cố định** trên đơn hàng | Đơn hàng không liên kết được về 1 dòng `Customer` để tổng hợp `TotalSpent` | Bắt buộc `CustomerId` trên `SalesInvoice` (kể cả khách lẻ → gán `KH000000`) |
| 7 | **Không hiển thị giá vốn / lợi nhuận** trên hóa đơn cho Admin | Admin không biết hóa đơn nào lời/lỗ ngay | Thêm cột "Lợi nhuận gộp" trên `Orders.jsx` cho role `admin` |

### 3.3. Thiếu sót về Báo cáo (Reports)

| # | Thiếu sót | Tác động | Đề xuất |
|---|-----------|----------|---------|
| 8 | `AdminRevenueReport.jsx` dùng **mock data hard-code** (`revenueData`, `topMedicines`) | Số liệu không khớp đơn hàng thực | Đọc từ `orders` qua aggregate hoặc gọi API; nhóm theo ngày/tuần/tháng |
| 9 | **Không có báo cáo P&L** (Doanh thu − COGS − Hủy hàng) | Chủ nhà thuốc không biết tháng này **lãi/lỗ thật** | Thêm trang `/admin/profit-loss` triển khai công thức ở mục 2.5 |
| 10 | **Không có báo cáo Tồn kho theo giá trị** | Không biết tổng vốn đang nằm trong kho | Thêm view `InventoryValuation` = SUM(CurrentQty × ImportPrice) |
| 11 | **Không có báo cáo chi phí hủy hàng** | Không đánh giá được rủi ro tồn quá hạn | Thêm widget "Chi phí hủy hàng tháng" trên `AdminHome.jsx` |

### 3.4. Thiếu sót về bảo mật & toàn vẹn dữ liệu

| # | Thiếu sót | Tác động | Đề xuất |
|---|-----------|----------|---------|
| 12 | **Lưu user vào `localStorage`** với mật khẩu so sánh plaintext `'123456'` trong code (`Login.jsx`) | Bất kỳ ai mở DevTools đều thấy mật khẩu | Triển khai BE thật: JWT + bcrypt cho `PasswordHash` |
| 13 | **`InventoryAlertContext` lưu toàn bộ state vào `localStorage`** | Nhiều tab → race condition; xóa cache mất hết | Chuyển sang BE thật với SQL Server |
| 14 | **`addOrder` không có transaction** | Trừ tồn lô và ghi `SalesInvoice` có thể đứt giữa chừng | BE phải dùng `BEGIN TRAN…COMMIT TRAN` bọc toàn bộ workflow bán hàng |

### 3.5. Tóm tắt mức độ ưu tiên khắc phục

| Mức ưu tiên | Hạng mục |
|-------------|----------|
| **P0 — Bắt buộc cho tài chính** | (4) Phiếu hủy hàng, (9) Báo cáo P&L, (10) Tồn kho theo giá trị |
| **P1 — Cần cho vận hành đúng** | (1) Chọn lô FIFO, (2) Phiếu nhập độc lập, (3) Giá nhập bắt buộc, (14) Transaction |
| **P2 — Cải thiện trải nghiệm** | (5) Upsert KH theo Phone, (6) CustomerId cố định, (8) Báo cáo real-data |
| **P3 — Bảo mật & nâng cao** | (12) BE thật + JWT/bcrypt, (13) Realtime, (7) Hiển thị lợi nhuận cho Admin, (11) Widget chi phí hủy hàng |

---

## 4. Kết luận

Thiết kế CSDL **19 bảng** trên SQL Server đạt **3NF**, đáp ứng phạm vi tài chính cốt lõi của nhà thuốc:

- **Đầy đủ luồng tài chính:** nhập hàng → bán hàng → trả hàng → hủy hàng hết hạn.
- **Tính chính xác lợi nhuận gộp** (qua `CostPriceSnapshot`) và lợi nhuận sau hủy hàng.
- **Quản lý lô theo HSD chuẩn FIFO**, tránh thất thoát do hết hạn.
- **Tách bạch chứng từ tài chính bất biến** (snapshot) khỏi master data có thể thay đổi.

Frontend hiện tại đáp ứng được **bán hàng cơ bản** và đang gần với schema này. Cần bổ sung 14 hạng mục đã liệt kê, trong đó **3 hạng mục P0** là quan trọng nhất để đồ án có giá trị thực với Chủ nhà thuốc.
