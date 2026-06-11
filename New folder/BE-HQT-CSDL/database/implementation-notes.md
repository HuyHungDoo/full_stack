# Ghi chú Triển khai (Implementation Notes)

> File này ghi lại **các quyết định thiết kế, các tùy biến không có trong yêu cầu gốc, các đánh đổi (tradeoffs) và các điểm bạn cần biết** trong quá trình tạo bộ file CSDL cho hệ thống Quản lý Tài chính Nhà thuốc.

---

## 0. Phạm vi đã chốt

| Hạng mục | Quyết định |
|---------|------------|
| **Tên database** | `PharmacyFinance` |
| **Tổng số bảng** | **19** |
| **Vai trò người dùng** | Chỉ 2: `ADMIN`, `STAFF` (không có Kế toán) |
| **VAT** | ❌ Không quản lý |
| **Chiết khấu** | ❌ Không quản lý |
| **Phương thức thanh toán** | ❌ Không quản lý (mặc định tiền mặt) |
| **Chi phí vận hành** (lương, mặt bằng, điện nước…) | ❌ Không quản lý |
| **Khách hàng thân thiết** (tích điểm) | ❌ Không quản lý |
| **Account tách khỏi Employee** | ❌ Gộp chung (1 nhân viên = 1 tài khoản) |
| **Tài chính cốt lõi vẫn giữ** | ✅ Mua hàng • Bán hàng • Trả hàng • Hủy hàng hết hạn • Lợi nhuận gộp qua `CostPriceSnapshot` |

---

## 1. Các quyết định thiết kế chính (kèm lý do)

### 1.1. Đặt tên Database là `PharmacyFinance`
- Phân biệt rõ với file SQL cũ trong repo (`PharmacyManagement_SqlServer.sql`).
- Nhấn mạnh trọng tâm "tài chính" theo yêu cầu BA.
- Đổi tên: sửa 3 chỗ trong `database.sql` (`IF DB_ID`, `CREATE DATABASE`, `USE`).

### 1.2. Chỉ giữ 2 vai trò (`Role`)
| RoleId | RoleName |
|--------|----------|
| `ADMIN` | Quản trị viên |
| `STAFF` | Nhân viên bán hàng |

FE đang dùng đúng 2 role này → đồng bộ.

### 1.3. Khách lẻ là 1 record `Customer` cố định
- FE đang để "Khách lẻ" là chuỗi NVARCHAR trong `SalesInvoice.customerName`, **không có `CustomerId`**.
- Tôi quy ước: **mọi hóa đơn PHẢI có CustomerId** (`NOT NULL`).
- Bù lại, seed sẵn 1 dòng `Customer (CustomerId='KH000000', CustomerName='Khách lẻ')` để gán cho HĐ không thu thông tin khách.
- **Tradeoff:** dữ liệu chặt hơn, nhưng **buộc backend kiểm tra & fallback về `KH000000`** khi staff bỏ trống.

### 1.4. GỘP Account vào Employee (không tách bảng riêng)
- FE hiện tại có cả `accountId: number` và `employeeId: 'NV001'`, nhưng chúng map **1-1** → trùng lặp.
- Bảng `Employee` đã chứa đủ `Username`, `PasswordHash`, `RoleId`, `IsActive`.
- **Lý do gộp:**
  - Nhà thuốc nhỏ: 1 nhân viên = đúng 1 tài khoản, không có account hệ thống/service.
  - Ít bảng hơn, ít join hơn khi authenticate.
  - Dễ giải thích trong báo cáo đồ án.
- **Khi nào nên tách:** Khi 1 nhân viên có thể có nhiều account, hoặc cần "service account" không gắn nhân viên. **Không phải case của đồ án này.**
- **Đề xuất cho FE:** dùng `employeeId` ('NV001') làm khóa duy nhất; coi `accountId` (1, 2, 3) là legacy field — bỏ khi tích hợp với BE thật.

### 1.5. Quản lý Lô (Batch) thành bảng riêng — KHÔNG dùng `MedicineStock`
- File SQL cũ có `MedicineStock(MedicineId, QuantityOnHand)` — chỉ lưu tổng tồn.
- Tôi **bỏ** `MedicineStock` và thay bằng `MedicineBatch`. Lý do nghiệp vụ:
  - Tài chính cần biết **giá vốn từng lô** để tính COGS (Cost of Goods Sold).
  - HSD phải gắn vào **lô**, không phải vào thuốc.
  - FE đã có model `batches[]` → CSDL chỉ chuẩn hóa lại.
- **Tổng tồn 1 thuốc** = `SUM(CurrentQty)` các lô còn hạn → tính qua VIEW hoặc query.

### 1.6. Snapshot trên hóa đơn — vi phạm 3NF có chủ đích
3 cột "snapshot" trên `SalesInvoiceLine`:
- `MedicineNameSnapshot`, `UnitNameSnapshot`
- `CostPriceSnapshot` — **quan trọng nhất, để tính lợi nhuận gộp**

**Tại sao chấp nhận dư thừa?**
- Hóa đơn là **chứng từ tài chính bất biến**. Năm 2027 đổi tên `Medicine` thì hóa đơn 2026 vẫn phải in đúng tên cũ.
- `CostPriceSnapshot` đặc biệt quan trọng: dù lô sau bị xóa hoặc giá nhập đợt sau khác, vẫn tính được lợi nhuận gộp chính xác.

**Đánh đổi:** Hi sinh 3NF nghiêm ngặt ở 3 cột — đổi lại tính bất biến của bút toán → **đúng nguyên tắc kế toán**.

### 1.7. Lựa chọn `VARCHAR` thay vì `INT IDENTITY` cho PK
- Hầu hết PK là `VARCHAR` (`SP001`, `HD000123`, `LOT-SP010-01`…).
- **Lý do:**
  - FE đang sinh ID dạng đọc được → dùng `INT` thì BE phải sinh thêm cột `Code` riêng.
  - Debug nhanh hơn ở giai đoạn dự án học tập.
- **Tradeoff:** Index lớn hơn ~2-4x. Khi scale lớn (>10 triệu dòng) nên cân nhắc đổi.

### 1.8. Tách `Unit`, `MedicineCategory`, `Supplier`, `Manufacturer` ra bảng riêng
- FE đang nhập đơn vị/danh mục/NCC/NSX thành chuỗi tự do → bị `"viên"` vs `"Viên"` vs `"VIEN"`.
- Tách thành 4 bảng + FK → chuẩn hóa từ vựng, đổi tên chỉ sửa 1 dòng.
- **Tradeoff:** Form FE phải đổi từ input text → select dropdown.

### 1.9. `Customer.Phone` cho phép NULL nhưng UNIQUE khi NOT NULL
- File SQL cũ: `Phone NOT NULL + UNIQUE`.
- Tôi đổi: `Phone NULL` + **filtered unique index** (`WHERE Phone IS NOT NULL`).
- **Lý do:** khách lẻ không có SĐT; nhưng khi đã nhập SĐT thì phải duy nhất (1 SĐT = 1 KH).

### 1.10. `Notification` cho phép gửi theo Role HOẶC Employee cụ thể
- Có CHECK: **ít nhất 1 trong 2 (`TargetRoleId`, `TargetEmployeeId`) phải NOT NULL**.
- Linh hoạt: broadcast cho 1 role hoặc gửi riêng cho 1 nhân viên.

### 1.11. `IsRoot` trên Employee
- FE có concept `isRoot` (Chủ nhà thuốc — không được xóa/đổi vai trò).
- Tôi giữ y nguyên cờ `IsRoot BIT` trên `Employee`.

### 1.12. Trạng thái `SalesInvoice`
- FE chỉ dùng `Hoàn thành` & `Đã hủy`.
- CSDL: `COMPLETED | CANCELLED | RETURNED` (đã bỏ `DRAFT`).
- **Lý do bỏ DRAFT:** Tại quầy thuốc, khách thanh toán ngay → HĐ chỉ ghi khi đã thu tiền xong. Không có khái niệm "đơn nháp" như e-commerce.
- **RETURNED** cho hóa đơn đã trả 100% — phân biệt với "Đã hủy" (hủy ngay khi chưa giao).
- `PurchaseReceipt` và `StockWriteOff` **vẫn giữ DRAFT** vì có thể lập phiếu xong rồi mới duyệt (Admin có quyền nháp).

### 1.13. Bỏ cờ `IsPrescription` và `IsDirectSale` trên `Medicine`
- Ban đầu tôi thêm 2 cờ này theo thói quen của hệ POS thương mại.
- **Phát hiện dư thừa:** `ProductType` đã có 3 giá trị `'Thuốc kê đơn' | 'Thuốc không kê đơn' | 'Vật tư y tế'` → bao hàm luôn tính chất kê đơn.
- `IsDirectSale` có thể được suy ra: thuốc kê đơn không bán trực tiếp; còn lại bán trực tiếp được. Trường hợp ngừng kinh doanh dùng `IsActive = 0` là đủ.
- **Quyết định:** Bỏ cả 2 cờ, dựa trên `ProductType` + `IsActive` cho logic POS.

### 1.14. Bỏ `Medicine.Barcode` và `Medicine.ShelfLocation`
- **Barcode:** Đồ án không có thiết bị quét mã vạch, FE cũng không dùng → bỏ. Khi cần có thể tra theo `DrugRegistrationCode` hoặc `MedicineId`.
- **ShelfLocation:** Trong phạm vi 1 nhà thuốc nhỏ, NV thuộc lòng vị trí kệ — không cần lưu DB. Khi cần có thể thêm sau.

### 1.15. Bỏ `MedicineBatch.LotCode`
- Ban đầu tôi tách `LotCode` (mã lô NSX in trên bao bì) khỏi `BatchId` (mã nội bộ) để truy vết NSX.
- Trong đồ án sinh viên, **không có dữ liệu LotCode thực** và FE cũng đang sinh tự động bằng timestamp → không có giá trị thực tế.
- **Quyết định:** Bỏ `LotCode` và `UQ_Batch_LotCode`. `BatchId` (PK) đủ vai trò định danh lô. Trong trường hợp thực tế cần truy vết NSX, có thể thêm sau như cột nullable.

### 1.16. Bỏ `Supplier.Phone` và `Supplier.ContactPerson`
- Đồ án không có nghiệp vụ "gọi NCC tự động" → không dùng tới `Phone`/`ContactPerson`.
- Giữ `Email`, `Address` (tùy chọn) là đủ thông tin định danh.
- Thêm `UNIQUE(SupplierName)` để tránh tạo trùng NCC.

### 1.17. Customer rút gọn (bỏ `Email`, `DateOfBirth`, `Address`)
- Khách hàng được **sinh ra từ hóa đơn bán hàng** (NV nhập SĐT + tên lúc thanh toán) → không có form CRUD riêng.
- 3 cột trên (Email, DateOfBirth, Address) **không có dữ liệu nguồn** từ luồng bán hàng tại quầy → bỏ.
- Bảng Customer còn: `CustomerId`, `CustomerName`, `Phone`, `Gender`, `TotalSpent`, `CreatedAt`.
- **Phone là khóa nghiệp vụ** để upsert (UNIQUE filtered) — BE check tồn tại theo `Phone`.

---

## 2. Những điểm tôi PHẢI thay đổi so với Frontend hiện tại

### 2.1. ❗ `Order.createdBy` đang lưu **TÊN** chứ không phải ID
- FE code: `order.createdBy = currentUser?.name || 'Nhân viên'`
- Trong CSDL, `SalesInvoice.EmployeeId` là **FK tới `Employee.EmployeeId`** (NOT NULL).
- → Khi triển khai backend, **bắt buộc** đổi từ "lưu tên" sang "lưu ID nhân viên".

### 2.2. ❗ `customersFromOrders` (FE) là **VIEW ảo** tạo từ Order
- FE tự gom KH từ `orders`.
- Trong CSDL, **Customer là bảng độc lập**. FE phải đổi để **chọn KH từ danh sách** (hoặc tạo mới) trước khi `addOrder`.

### 2.3. ❗ `consumeStock` của FE trừ tồn theo FIFO **trên client**
- FE đang chạy logic FIFO trong `InventoryAlertContext.consumeStock`.
- Khi chuyển sang backend, **phải lock dòng `MedicineBatch`** (`SELECT … WITH (UPDLOCK, ROWLOCK)`) trong transaction để tránh race condition khi 2 staff bán cùng lúc.

### 2.4. ❗ FE đang sinh nhiều ID bằng `Date.now()`
- VD: `LOT-SP001-${Date.now()}` → 13 chữ số.
- Vẫn dùng được vì `VARCHAR(40)`, nhưng **rủi ro va đập** nếu 2 hành động trong cùng 1ms.
- **Đề nghị:** backend dùng `NEWID()` (GUID) cho an toàn.

### 2.5. ❗ FE chưa có module Phiếu hủy hàng (`StockWriteOff`)
- FE chỉ "ẩn lô hết hạn" trong UI nhưng không lưu chứng từ.
- Cần thêm chức năng "Lập phiếu hủy" trên `Inventory.jsx` để ghi `StockWriteOff` → tính chi phí hủy hàng vào lợi nhuận.

---

## 3. Các bảng tôi đã **bổ sung mà FE chưa có**

| Bảng | Lý do thêm |
|------|-----------|
| `Supplier` | FE chỉ có `supplierName` dạng chuỗi → chuẩn hóa thành bảng |
| `Manufacturer` | Tương tự, tách khỏi chuỗi `manufacturerName` |
| `Unit` | Chuẩn hóa từ vựng đơn vị tính |
| `PurchaseReceipt`/`PurchaseReceiptLine` | FE chỉ có "nhập từng lô lẻ" — cần phiếu nhập để tính tổng chi phí mua hàng theo phiếu |
| `SalesReturn`/`SalesReturnLine` | FE có function `returnOrderItems` nhưng **không lưu thành bảng độc lập** → mất truy vết tài chính |
| `StockWriteOff`/`StockWriteOffLine` | FE chỉ "ẩn lô hết hạn" → không ghi chi phí. Bắt buộc thêm bảng phiếu hủy để báo cáo lợi nhuận đúng |

---

## 4. Đánh đổi (Tradeoffs) tôi đã chấp nhận

### 4.1. Hiệu năng vs Đúng đắn nghiệp vụ
- Lưu **snapshot** ở dòng HĐ → dư thừa dữ liệu (~3 cột × N dòng) nhưng đảm bảo bất biến.
- Tách **MedicineBatch** → nhiều dòng hơn 1 thuốc nhưng tính được COGS chính xác.

### 4.2. Tính linh hoạt vs Toàn vẹn tham chiếu
- Mặc định `ON DELETE NO ACTION` cho mọi FK.
- → **Không thể xóa cứng** Medicine/Customer/Supplier khi đang được tham chiếu.
- → **Đúng nguyên tắc kế toán**: chứng từ phải bất biến.
- → FE phải dùng soft delete (set `IsActive = 0`), điều này đã đúng với Medicine trong FE hiện tại.

### 4.3. Tính đầy đủ vs Đơn giản hóa
- Bỏ VAT/Chiết khấu/PaymentMethod/Chi phí vận hành → schema gọn (**19 bảng**).
- **Mất:** Không tính được báo cáo VAT phải nộp; không đối soát quỹ tiền mặt vs chuyển khoản; "Lợi nhuận" tính được chỉ là "Lợi nhuận sau hủy hàng", chưa phải Net Profit kế toán.
- **Được:** Sinh viên có thể giải thích được toàn bộ schema trong báo cáo; demo dễ; phù hợp scope đồ án.

### 4.4. Indexing — chỉ thêm index thực sự cần
- Đã thêm: `IX_Batch_Medicine_Expiry`, `IX_Invoice_Date`, `IX_IL_Invoice`.
- Khi data tăng có thể thêm: `IX_Invoice_Customer`, `IX_Invoice_Employee`, `IX_Receipt_Supplier`…

---

## 5. Những thứ tôi CỐ Ý không làm

| Mục | Lý do bỏ qua |
|-----|-------------|
| **Stored Procedure / Function tổng hợp** | Yêu cầu chỉ nói tạo bảng + ràng buộc. Có sẵn câu SQL P&L mẫu trong `report.md` (mục 2.5). |
| **Trigger tự động cập nhật `Customer.TotalSpent`** | Trigger gây phức tạp debug. Nên cập nhật ở tầng backend trong cùng transaction với `addOrder`. |
| **View materialized cho báo cáo** | Phụ thuộc cách query của FE, để pha tối ưu sau. |
| **Bảng `Promotion` (khuyến mãi)** | Phạm vi không cần. |
| **Bảng `Customer Loyalty` (tích điểm)** | Phạm vi không cần. |
| **e-Invoice / chữ ký số** | Ngoài phạm vi học tập. |
| **Bảng Audit Log** | FE chưa có. Khi cần, thêm `AuditLog(LogId, TableName, RecordId, Action, ChangedBy, ChangedAt, OldValue, NewValue)`. |
| **Phân quyền chi tiết (Permission table)** | FE chỉ có 2 role + `ProtectedRoute` đơn giản. |

---

## 6. Hướng dẫn chạy nhanh

```sql
-- 1) Mở SSMS hoặc Azure Data Studio, kết nối tới SQL Server.
-- 2) Mở file database/database.sql.
-- 3) Bấm Execute (F5). Script sẽ:
--    - Tạo database PharmacyFinance nếu chưa có.
--    - Tạo 19 bảng + tất cả khóa, CHECK, DEFAULT.
--    - Seed Role (ADMIN, STAFF), Unit (8 đơn vị), Customer 'Khách lẻ'.

-- 4) Để xem ERD, mở https://dbdiagram.io
--    → New Diagram → Paste nội dung file database/erd.dbml.

-- 5) Đọc database/report.md để hiểu workflow và đánh giá FE.
```

---

## 7. Hướng dẫn lấy dữ liệu seed (cho đồ án)

Đây là câu hỏi rất thực tế: **dữ liệu NCC, thuốc, KH lấy ở đâu?** Tôi liệt kê 5 hướng đi từ dễ tới chuyên nghiệp.

### 7.1. Hướng 1 — Tự nghĩ tên realistic
Cho `Supplier`, `Manufacturer`, `MedicineCategory`: chỉ cần tên hợp lý, không cần data thật.

VD Supplier: "Công ty CP Dược DHG", "Dược phẩm Minh Phúc", "Bayer Việt Nam", "Sanofi Vietnam"…
VD Manufacturer: "Sanofi", "Bayer", "Traphaco", "Hậu Giang Pharma"…

### 7.2. Hướng 2 — Tái sử dụng mock data có sẵn trong FE
File `src/context/InventoryAlertContext.jsx` đã có sẵn:
- **10 thuốc mẫu** (`SP001`–`SP010`) với đầy đủ tên, giá, lô, HSD.
- **8 NCC** xuất hiện trong các `supplierName`.
- **6 hãng SX** xuất hiện trong các `manufacturer`.

Code script Node.js đọc file này → INSERT vào DB là cách nhanh nhất. **Đủ cho demo đồ án.**

### 7.3. Hướng 3 — Crawl từ nguồn công khai
**Chỉ lấy 3 trường:** tên thuốc, số đăng ký, nhóm.
- [drugbank.vn](https://drugbank.vn) — Cục Quản lý Dược, dữ liệu thuốc công khai.
- Lưu CSV thủ công 30–50 thuốc phổ biến → import bằng `BULK INSERT` hoặc SSMS Import Wizard.

### 7.4. Hướng 4 — Faker library sinh giả lập số lượng lớn
Khi cần test performance hoặc demo có nhiều dữ liệu:

```js
// package.json: "@faker-js/faker"
import { faker } from '@faker-js/faker';
faker.locale = 'vi';

for (let i = 0; i < 100; i++) {
  await sql.query`
    INSERT INTO Customer (CustomerId, CustomerName, Phone, Gender)
    VALUES (${`KH${String(i+1).padStart(6,'0')}`},
            ${faker.person.fullName()},
            ${faker.phone.number('09########')},
            ${faker.helpers.arrayElement([N'Nam', N'Nữ', null])})
  `;
}
```

### 7.5. Hướng 5 — AI sinh dữ liệu
Dán prompt vào ChatGPT/Gemini:
> "Sinh 30 thuốc thực tế tại Việt Nam dưới dạng CSV với các cột: MedicineName, CategoryName, UnitName, ListPrice (VND), MinStock, ProductType (Thuốc kê đơn|Thuốc không kê đơn|Vật tư y tế). Ví dụ: Paracetamol 500mg, Vitamin C 1000mg…"

Copy paste output → save CSV → import.

### 7.6. Khuyến nghị áp dụng cho đồ án

| Bảng | Hướng nên dùng | Số dòng đề xuất |
|------|-----------------|----------------|
| `Role` | Đã seed sẵn trong `database.sql` | 2 |
| `Unit` | Đã seed sẵn | 8 |
| `Employee` | Tự tạo: 1 ADMIN + 2-3 STAFF | 3–4 |
| `Supplier` | Hướng 1+2 | 8–10 |
| `Manufacturer` | Hướng 2 | 6 |
| `MedicineCategory` | Hướng 2 (lấy từ `Medicines.jsx`) | 18 |
| `Medicine` | Hướng 2 + Hướng 3 (drugbank.vn) | 30–50 |
| `MedicineBatch` | Tự tạo 2–3 lô cho mỗi thuốc | 60–150 |
| `Customer` | Hướng 4 (Faker) hoặc demo nhập tay | 20–100 |
| `SalesInvoice` | Demo bán hàng trực tiếp trên FE → có data thật | Phát sinh theo demo |
| `PurchaseReceipt` | Tự tạo 5–10 phiếu nhập | 5–10 |

---

## 8. Tóm tắt 19 bảng (cheatsheet)

| # | Bảng | Vai trò chính |
|---|------|--------------|
| 1 | `Role` | Vai trò người dùng (ADMIN/STAFF) |
| 2 | `Employee` | Nhân viên = tài khoản đăng nhập |
| 3 | `Unit` | Đơn vị tính (Viên, Vỉ, Hộp…) |
| 4 | `MedicineCategory` | Nhóm thuốc |
| 5 | `Supplier` | Nhà cung cấp |
| 6 | `Manufacturer` | Hãng sản xuất |
| 7 | `Medicine` | Master thuốc (tên, giá niêm yết, mô tả) |
| 8 | `MedicineBatch` | **Lô thuốc** (giá nhập + HSD riêng) — tồn kho thực |
| 9 | `Customer` | Khách hàng (có dòng `KH000000` = Khách lẻ) |
| 10 | `PurchaseReceipt` | Phiếu nhập (header) — chi phí mua hàng |
| 11 | `PurchaseReceiptLine` | Chi tiết phiếu nhập (1 dòng = 1 lô mới) |
| 12 | `SalesInvoice` | Hóa đơn bán hàng (header) — doanh thu |
| 13 | `SalesInvoiceLine` | Chi tiết HĐ — có `CostPriceSnapshot` |
| 14 | `SalesReturn` | Phiếu trả hàng (header) — giảm doanh thu |
| 15 | `SalesReturnLine` | Chi tiết trả hàng |
| 16 | `StockWriteOff` | Phiếu hủy hàng — chi phí hủy |
| 17 | `StockWriteOffLine` | Chi tiết phiếu hủy |
| 18 | `InventoryAlert` | Cảnh báo tồn thấp / sắp hết hạn |
| 19 | `Notification` | Thông báo nội bộ (cho role hoặc nhân viên) |

---

## 12. Nhập hàng — thuốc/NCC mới (Cách B, 2026-05)

**Quyết định:** Không tự `INSERT Medicine` / `Supplier` trong transaction `POST /purchase-receipts`.

**Luồng ứng dụng:**
1. `POST /medicines` (nếu SP mới) — validation đầy đủ master data
2. `POST /suppliers` (nếu NCC mới)
3. `POST /purchase-receipts` — chỉ tham chiếu `medicineId`, `supplierId` đã tồn tại

**Lý do:** tránh trùng mã thuốc, tránh thiếu field pháp lý (`productType`, `listPrice`…), tách trách nhiệm danh mục vs nghiệp vụ kho.

**FE (team khác):** modal "Thêm nhanh" khi nhập hàng — hướng dẫn tích hợp trong `BACKEND-HQT/FRONTEND-INTEGRATION-GUIDE.md` §8.3. Không implement trong repo BE/DB.
