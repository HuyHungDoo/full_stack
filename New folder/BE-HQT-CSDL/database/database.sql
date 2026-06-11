/* =============================================================================
   HỆ THỐNG QUẢN LÝ TÀI CHÍNH NHÀ THUỐC (Đồ án sinh viên)
   File: database.sql
   DBMS: Microsoft SQL Server
   Phạm vi: 1 nhà thuốc duy nhất (KHÔNG có chi nhánh)
   Chuẩn hóa: 3NF (có ngoại lệ snapshot trên dòng hóa đơn — xem notes)

   Phạm vi tài chính:
     - Ghi nhận doanh thu (Sales)
     - Ghi nhận chi phí nhập hàng (Purchase) theo lô
     - Tính giá vốn hàng bán (COGS) qua snapshot CostPriceSnapshot
     - Quản lý lô / hạn sử dụng → phiếu hủy hàng hết hạn (StockWriteOff)
     - Trả hàng → giảm trừ doanh thu thực

   Cách chạy:
     1) Mở SSMS / Azure Data Studio, kết nối SQL Server.
     2) Mở file này, bấm Execute (F5).
   ============================================================================= */

IF DB_ID(N'PharmacyFinance') IS NULL
BEGIN
    CREATE DATABASE PharmacyFinance;
END;
GO

USE PharmacyFinance;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* =============================================================================
   PHẦN 1. DANH MỤC CHUNG (Master data)
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Bảng Role — Vai trò người dùng (chỉ ADMIN & STAFF)
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.Role (
    RoleId      VARCHAR(20)     NOT NULL,
    RoleName    NVARCHAR(50)    NOT NULL,
    Description NVARCHAR(200)   NULL,
    CONSTRAINT PK_Role PRIMARY KEY (RoleId),
    CONSTRAINT UQ_Role_RoleName UNIQUE (RoleName)
);
GO

/* -----------------------------------------------------------------------------
   Bảng Employee — Nhân viên / Tài khoản đăng nhập
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.Employee (
    EmployeeId   VARCHAR(20)    NOT NULL,
    FullName     NVARCHAR(100)  NOT NULL,
    Phone        VARCHAR(20)    NULL,
    Email        VARCHAR(100)   NOT NULL,
    Username     VARCHAR(50)    NOT NULL,
    PasswordHash VARCHAR(255)   NOT NULL,
    RoleId       VARCHAR(20)    NOT NULL,
    IsActive     BIT            NOT NULL CONSTRAINT DF_Employee_IsActive DEFAULT (1),
    IsRoot       BIT            NOT NULL CONSTRAINT DF_Employee_IsRoot   DEFAULT (0),
    HireDate     DATE           NULL,
    CreatedAt    DATETIME2(0)   NOT NULL CONSTRAINT DF_Employee_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Employee PRIMARY KEY (EmployeeId),
    CONSTRAINT UQ_Employee_Email    UNIQUE (Email),
    CONSTRAINT UQ_Employee_Username UNIQUE (Username),
    CONSTRAINT FK_Employee_Role FOREIGN KEY (RoleId) REFERENCES dbo.Role (RoleId)
);
GO

/* -----------------------------------------------------------------------------
   Bảng Unit — Đơn vị tính (Viên, Vỉ, Hộp...)
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.Unit (
    UnitId   VARCHAR(20)   NOT NULL,
    UnitName NVARCHAR(50)  NOT NULL,
    CONSTRAINT PK_Unit PRIMARY KEY (UnitId),
    CONSTRAINT UQ_Unit_UnitName UNIQUE (UnitName)
);
GO

/* -----------------------------------------------------------------------------
   Bảng MedicineCategory — Nhóm thuốc
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.MedicineCategory (
    CategoryId   VARCHAR(30)   NOT NULL,
    CategoryName NVARCHAR(150) NOT NULL,
    Description  NVARCHAR(500) NULL,
    CONSTRAINT PK_MedicineCategory PRIMARY KEY (CategoryId),
    CONSTRAINT UQ_MedicineCategory_CategoryName UNIQUE (CategoryName)
);
GO

/* -----------------------------------------------------------------------------
   Bảng Supplier — Nhà cung cấp
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.Supplier (
    SupplierId    VARCHAR(20)    NOT NULL,
    SupplierName  NVARCHAR(150)  NOT NULL,
    Email         VARCHAR(100)   NULL,
    Address       NVARCHAR(255)  NULL,
    IsActive      BIT            NOT NULL CONSTRAINT DF_Supplier_IsActive DEFAULT (1),
    CONSTRAINT PK_Supplier PRIMARY KEY (SupplierId),
    CONSTRAINT UQ_Supplier_Name UNIQUE (SupplierName)
);
GO

/* -----------------------------------------------------------------------------
   Bảng Manufacturer — Hãng sản xuất
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.Manufacturer (
    ManufacturerId   VARCHAR(20)    NOT NULL,
    ManufacturerName NVARCHAR(150)  NOT NULL,
    Country          NVARCHAR(100)  NULL,
    CONSTRAINT PK_Manufacturer PRIMARY KEY (ManufacturerId),
    CONSTRAINT UQ_Manufacturer_Name UNIQUE (ManufacturerName)
);
GO

/* =============================================================================
   PHẦN 2. DANH MỤC THUỐC & LÔ HÀNG
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Bảng Medicine — Danh mục thuốc (master)
   ListPrice = giá niêm yết hiện hành. Giá vốn (cost) sống ở MedicineBatch.
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.Medicine (
    MedicineId            VARCHAR(30)    NOT NULL,
    MedicineName          NVARCHAR(200)  NOT NULL,
    CategoryId            VARCHAR(30)    NULL,
    UnitId                VARCHAR(20)    NOT NULL,
    ManufacturerId        VARCHAR(20)    NULL,
    ProductType           NVARCHAR(50)   NOT NULL,                             -- 'Thuốc kê đơn' | 'Thuốc không kê đơn' | 'Vật tư y tế'
    DrugRegistrationCode  NVARCHAR(80)   NULL,                                 -- Số đăng ký thuốc (VD-12345-19)
    ListPrice             DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Medicine_ListPrice DEFAULT (0),
    MinStock              INT            NOT NULL CONSTRAINT DF_Medicine_MinStock DEFAULT (0),
    IsActive              BIT            NOT NULL CONSTRAINT DF_Medicine_IsActive DEFAULT (1),
    Ingredient            NVARCHAR(MAX)  NULL,
    [Usage]               NVARCHAR(MAX)  NULL,
    Dosage                NVARCHAR(MAX)  NULL,
    Route                 NVARCHAR(100)  NULL,                                 -- Đường dùng (Uống, Tiêm, Bôi...)
    CreatedAt             DATETIME2(0)   NOT NULL CONSTRAINT DF_Medicine_CreatedAt DEFAULT (SYSUTCDATETIME()),
    UpdatedAt             DATETIME2(0)   NOT NULL CONSTRAINT DF_Medicine_UpdatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Medicine PRIMARY KEY (MedicineId),
    CONSTRAINT FK_Medicine_Category     FOREIGN KEY (CategoryId)     REFERENCES dbo.MedicineCategory (CategoryId),
    CONSTRAINT FK_Medicine_Unit         FOREIGN KEY (UnitId)         REFERENCES dbo.Unit (UnitId),
    CONSTRAINT FK_Medicine_Manufacturer FOREIGN KEY (ManufacturerId) REFERENCES dbo.Manufacturer (ManufacturerId),
    CONSTRAINT CK_Medicine_ListPrice    CHECK (ListPrice >= 0),
    CONSTRAINT CK_Medicine_MinStock     CHECK (MinStock  >= 0),
    CONSTRAINT CK_Medicine_ProductType  CHECK (ProductType IN (N'Thuốc kê đơn', N'Thuốc không kê đơn', N'Vật tư y tế'))
);
GO

/* -----------------------------------------------------------------------------
   Bảng MedicineBatch — LÔ HÀNG (mỗi lô có HSD & giá nhập riêng)
   Tồn kho 1 thuốc = SUM(CurrentQty) các lô chưa hết hạn.
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.MedicineBatch (
    BatchId        VARCHAR(40)    NOT NULL,
    MedicineId     VARCHAR(30)    NOT NULL,
    ImportPrice    DECIMAL(18, 2) NOT NULL,
    ImportDate     DATE           NOT NULL,
    ExpiryDate     DATE           NOT NULL,
    InitialQty     INT            NOT NULL,
    CurrentQty     INT            NOT NULL,
    SupplierId     VARCHAR(20)    NULL,
    ManufacturerId VARCHAR(20)    NULL,
    Note           NVARCHAR(500)  NULL,
    CONSTRAINT PK_MedicineBatch PRIMARY KEY (BatchId),
    CONSTRAINT FK_Batch_Medicine     FOREIGN KEY (MedicineId)     REFERENCES dbo.Medicine (MedicineId),
    CONSTRAINT FK_Batch_Supplier     FOREIGN KEY (SupplierId)     REFERENCES dbo.Supplier (SupplierId),
    CONSTRAINT FK_Batch_Manufacturer FOREIGN KEY (ManufacturerId) REFERENCES dbo.Manufacturer (ManufacturerId),
    CONSTRAINT CK_Batch_ImportPrice  CHECK (ImportPrice >= 0),
    CONSTRAINT CK_Batch_InitialQty   CHECK (InitialQty  >= 0),
    CONSTRAINT CK_Batch_CurrentQty   CHECK (CurrentQty  >= 0),
    CONSTRAINT CK_Batch_QtyConsistency CHECK (CurrentQty <= InitialQty),
    CONSTRAINT CK_Batch_ExpiryAfterImport CHECK (ExpiryDate >= ImportDate)
);
GO

CREATE INDEX IX_Batch_Medicine_Expiry ON dbo.MedicineBatch (MedicineId, ExpiryDate);
GO

/* =============================================================================
   PHẦN 3. KHÁCH HÀNG
   ============================================================================= */

CREATE TABLE dbo.Customer (
    CustomerId   VARCHAR(20)    NOT NULL,
    CustomerName NVARCHAR(100)  NOT NULL,
    Phone        VARCHAR(20)    NULL,                                          -- UNIQUE khi NOT NULL (filtered index)
    Gender       NVARCHAR(10)   NULL,
    TotalSpent   DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Customer_TotalSpent DEFAULT (0),
    CreatedAt    DATETIME2(0)   NOT NULL CONSTRAINT DF_Customer_CreatedAt  DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Customer PRIMARY KEY (CustomerId),
    CONSTRAINT CK_Customer_TotalSpent CHECK (TotalSpent >= 0),
    CONSTRAINT CK_Customer_Gender CHECK (Gender IS NULL OR Gender IN (N'Nam', N'Nữ', N'Khác'))
);
GO

CREATE UNIQUE INDEX UQ_Customer_Phone ON dbo.Customer (Phone) WHERE Phone IS NOT NULL;
GO

/* =============================================================================
   PHẦN 4. NHẬP HÀNG
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Bảng PurchaseReceipt — Phiếu nhập hàng (chi phí mua thuốc)
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.PurchaseReceipt (
    ReceiptId    VARCHAR(30)    NOT NULL,
    SupplierId   VARCHAR(20)    NOT NULL,
    EmployeeId   VARCHAR(20)    NOT NULL,
    ReceiptDate  DATETIME2(0)   NOT NULL CONSTRAINT DF_Receipt_Date DEFAULT (SYSUTCDATETIME()),
    TotalAmount  DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Receipt_TotalAmount DEFAULT (0),
    Status       NVARCHAR(20)   NOT NULL CONSTRAINT DF_Receipt_Status DEFAULT (N'COMPLETED'),
    Note         NVARCHAR(500)  NULL,
    CONSTRAINT PK_PurchaseReceipt PRIMARY KEY (ReceiptId),
    CONSTRAINT FK_Receipt_Supplier FOREIGN KEY (SupplierId) REFERENCES dbo.Supplier (SupplierId),
    CONSTRAINT FK_Receipt_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employee (EmployeeId),
    CONSTRAINT CK_Receipt_TotalAmount CHECK (TotalAmount >= 0),
    CONSTRAINT CK_Receipt_Status      CHECK (Status IN (N'DRAFT', N'COMPLETED', N'CANCELLED'))
);
GO

/* -----------------------------------------------------------------------------
   Bảng PurchaseReceiptLine — Chi tiết phiếu nhập (1 dòng = 1 lô mới)
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.PurchaseReceiptLine (
    LineId      VARCHAR(40)    NOT NULL,
    ReceiptId   VARCHAR(30)    NOT NULL,
    MedicineId  VARCHAR(30)    NOT NULL,
    BatchId     VARCHAR(40)    NOT NULL,
    Quantity    INT            NOT NULL,
    UnitCost    DECIMAL(18, 2) NOT NULL,
    LineTotal   DECIMAL(18, 2) NOT NULL,                                       -- = Quantity * UnitCost
    CONSTRAINT PK_PurchaseReceiptLine PRIMARY KEY (LineId),
    CONSTRAINT FK_RL_Receipt   FOREIGN KEY (ReceiptId)  REFERENCES dbo.PurchaseReceipt (ReceiptId),
    CONSTRAINT FK_RL_Medicine  FOREIGN KEY (MedicineId) REFERENCES dbo.Medicine (MedicineId),
    CONSTRAINT FK_RL_Batch     FOREIGN KEY (BatchId)    REFERENCES dbo.MedicineBatch (BatchId),
    CONSTRAINT UQ_RL_Batch     UNIQUE (BatchId),
    CONSTRAINT CK_RL_Quantity  CHECK (Quantity  > 0),
    CONSTRAINT CK_RL_UnitCost  CHECK (UnitCost  >= 0),
    CONSTRAINT CK_RL_LineTotal CHECK (LineTotal >= 0)
);
GO

/* =============================================================================
   PHẦN 5. BÁN HÀNG (doanh thu)
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Bảng SalesInvoice — Hóa đơn bán hàng (header)
   TotalAmount = SUM(LineTotal) ở SalesInvoiceLine
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.SalesInvoice (
    InvoiceId            VARCHAR(30)    NOT NULL,
    EmployeeId           VARCHAR(20)    NOT NULL,
    CustomerId           VARCHAR(20)    NOT NULL,                              -- Dùng 'KH000000' cho khách lẻ
    CustomerNameSnapshot NVARCHAR(100)  NOT NULL,
    PhoneSnapshot        VARCHAR(20)    NULL,
    InvoiceDate          DATETIME2(0)   NOT NULL CONSTRAINT DF_Invoice_Date DEFAULT (SYSUTCDATETIME()),
    TotalAmount          DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Invoice_TotalAmount DEFAULT (0),
    Status               NVARCHAR(20)   NOT NULL CONSTRAINT DF_Invoice_Status DEFAULT (N'COMPLETED'),
    Note                 NVARCHAR(500)  NULL,
    CONSTRAINT PK_SalesInvoice PRIMARY KEY (InvoiceId),
    CONSTRAINT FK_Invoice_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employee (EmployeeId),
    CONSTRAINT FK_Invoice_Customer FOREIGN KEY (CustomerId) REFERENCES dbo.Customer (CustomerId),
    CONSTRAINT CK_Invoice_TotalAmount CHECK (TotalAmount >= 0),
    CONSTRAINT CK_Invoice_Status      CHECK (Status IN (N'COMPLETED', N'CANCELLED', N'RETURNED'))
);
GO

CREATE INDEX IX_Invoice_Date ON dbo.SalesInvoice (InvoiceDate);
GO

/* -----------------------------------------------------------------------------
   Bảng SalesInvoiceLine — Chi tiết hóa đơn
   - BatchId chỉ định LÔ XUẤT (FIFO theo HSD gần nhất).
   - CostPriceSnapshot lưu giá vốn lô → tính lợi nhuận gộp.
   - LineTotal = Quantity * UnitPrice
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.SalesInvoiceLine (
    LineId               VARCHAR(40)    NOT NULL,
    InvoiceId            VARCHAR(30)    NOT NULL,
    MedicineId           VARCHAR(30)    NOT NULL,
    BatchId              VARCHAR(40)    NOT NULL,
    MedicineNameSnapshot NVARCHAR(200)  NOT NULL,
    UnitNameSnapshot     NVARCHAR(50)   NOT NULL,
    Quantity             INT            NOT NULL,
    UnitPrice            DECIMAL(18, 2) NOT NULL,
    LineTotal            DECIMAL(18, 2) NOT NULL,                              -- = Quantity * UnitPrice
    CostPriceSnapshot    DECIMAL(18, 2) NOT NULL,                              -- Giá vốn lô (snapshot) → COGS
    CONSTRAINT PK_SalesInvoiceLine PRIMARY KEY (LineId),
    CONSTRAINT FK_IL_Invoice  FOREIGN KEY (InvoiceId)  REFERENCES dbo.SalesInvoice (InvoiceId),
    CONSTRAINT FK_IL_Medicine FOREIGN KEY (MedicineId) REFERENCES dbo.Medicine (MedicineId),
    CONSTRAINT FK_IL_Batch    FOREIGN KEY (BatchId)    REFERENCES dbo.MedicineBatch (BatchId),
    CONSTRAINT CK_IL_Quantity          CHECK (Quantity          > 0),
    CONSTRAINT CK_IL_UnitPrice         CHECK (UnitPrice         >= 0),
    CONSTRAINT CK_IL_LineTotal         CHECK (LineTotal         >= 0),
    CONSTRAINT CK_IL_CostPriceSnapshot CHECK (CostPriceSnapshot >= 0)
);
GO

CREATE INDEX IX_IL_Invoice ON dbo.SalesInvoiceLine (InvoiceId);
GO

/* =============================================================================
   PHẦN 6. TRẢ HÀNG (giảm doanh thu)
   ============================================================================= */

CREATE TABLE dbo.SalesReturn (
    ReturnId    VARCHAR(30)    NOT NULL,
    InvoiceId   VARCHAR(30)    NOT NULL,
    EmployeeId  VARCHAR(20)    NOT NULL,
    ReturnDate  DATETIME2(0)   NOT NULL CONSTRAINT DF_Return_Date DEFAULT (SYSUTCDATETIME()),
    TotalRefund DECIMAL(18, 2) NOT NULL CONSTRAINT DF_Return_TotalRefund DEFAULT (0),
    Reason      NVARCHAR(500)  NULL,
    Status      NVARCHAR(20)   NOT NULL CONSTRAINT DF_Return_Status DEFAULT (N'COMPLETED'),
    CONSTRAINT PK_SalesReturn PRIMARY KEY (ReturnId),
    CONSTRAINT FK_Return_Invoice  FOREIGN KEY (InvoiceId)  REFERENCES dbo.SalesInvoice (InvoiceId),
    CONSTRAINT FK_Return_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employee (EmployeeId),
    CONSTRAINT CK_Return_TotalRefund CHECK (TotalRefund >= 0),
    CONSTRAINT CK_Return_Status      CHECK (Status IN (N'COMPLETED', N'CANCELLED'))
);
GO

CREATE TABLE dbo.SalesReturnLine (
    LineId         VARCHAR(40)    NOT NULL,
    ReturnId       VARCHAR(30)    NOT NULL,
    InvoiceLineId  VARCHAR(40)    NOT NULL,
    Quantity       INT            NOT NULL,
    RefundAmount   DECIMAL(18, 2) NOT NULL,
    Reason         NVARCHAR(300)  NULL,
    CONSTRAINT PK_SalesReturnLine PRIMARY KEY (LineId),
    CONSTRAINT FK_RTL_Return      FOREIGN KEY (ReturnId)      REFERENCES dbo.SalesReturn (ReturnId),
    CONSTRAINT FK_RTL_InvoiceLine FOREIGN KEY (InvoiceLineId) REFERENCES dbo.SalesInvoiceLine (LineId),
    CONSTRAINT CK_RTL_Quantity     CHECK (Quantity     > 0),
    CONSTRAINT CK_RTL_RefundAmount CHECK (RefundAmount >= 0)
);
GO

/* =============================================================================
   PHẦN 7. HỦY HÀNG HẾT HẠN
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Bảng StockWriteOff — Phiếu hủy hàng (thuốc hết hạn / hỏng / mất)
   Mỗi phiếu = 1 bút toán chi phí hủy hàng → ảnh hưởng lợi nhuận.
   ----------------------------------------------------------------------------- */
CREATE TABLE dbo.StockWriteOff (
    WriteOffId   VARCHAR(30)    NOT NULL,
    EmployeeId   VARCHAR(20)    NOT NULL,
    WriteOffDate DATETIME2(0)   NOT NULL CONSTRAINT DF_WriteOff_Date DEFAULT (SYSUTCDATETIME()),
    TotalCost    DECIMAL(18, 2) NOT NULL CONSTRAINT DF_WriteOff_TotalCost DEFAULT (0),
    Reason       NVARCHAR(500)  NULL,
    Status       NVARCHAR(20)   NOT NULL CONSTRAINT DF_WriteOff_Status DEFAULT (N'COMPLETED'),
    CONSTRAINT PK_StockWriteOff PRIMARY KEY (WriteOffId),
    CONSTRAINT FK_WriteOff_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employee (EmployeeId),
    CONSTRAINT CK_WriteOff_TotalCost CHECK (TotalCost >= 0),
    CONSTRAINT CK_WriteOff_Status    CHECK (Status IN (N'DRAFT', N'COMPLETED', N'CANCELLED'))
);
GO

CREATE TABLE dbo.StockWriteOffLine (
    LineId      VARCHAR(40)    NOT NULL,
    WriteOffId  VARCHAR(30)    NOT NULL,
    BatchId     VARCHAR(40)    NOT NULL,
    MedicineId  VARCHAR(30)    NOT NULL,
    Quantity    INT            NOT NULL,
    UnitCost    DECIMAL(18, 2) NOT NULL,                                       -- = ImportPrice của lô (snapshot)
    LineCost    DECIMAL(18, 2) NOT NULL,                                       -- = Quantity * UnitCost
    Reason      NVARCHAR(300)  NULL,
    CONSTRAINT PK_StockWriteOffLine PRIMARY KEY (LineId),
    CONSTRAINT FK_WOL_WriteOff FOREIGN KEY (WriteOffId) REFERENCES dbo.StockWriteOff (WriteOffId),
    CONSTRAINT FK_WOL_Batch    FOREIGN KEY (BatchId)    REFERENCES dbo.MedicineBatch (BatchId),
    CONSTRAINT FK_WOL_Medicine FOREIGN KEY (MedicineId) REFERENCES dbo.Medicine (MedicineId),
    CONSTRAINT CK_WOL_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_WOL_UnitCost CHECK (UnitCost >= 0),
    CONSTRAINT CK_WOL_LineCost CHECK (LineCost >= 0)
);
GO

/* =============================================================================
   PHẦN 8. CẢNH BÁO & THÔNG BÁO
   ============================================================================= */

CREATE TABLE dbo.InventoryAlert (
    AlertId        VARCHAR(40)    NOT NULL,
    MedicineId     VARCHAR(30)    NOT NULL,
    AlertType      NVARCHAR(30)   NOT NULL,                                    -- 'LOW_STOCK' | 'NEAR_EXPIRY' | 'EXPIRED'
    StockSnapshot  INT            NOT NULL,
    MinStock       INT            NOT NULL,
    Note           NVARCHAR(500)  NULL,
    Status         NVARCHAR(20)   NOT NULL CONSTRAINT DF_Alert_Status DEFAULT (N'PENDING'),
    CreatedBy      VARCHAR(20)    NULL,
    CreatedAt      DATETIME2(0)   NOT NULL CONSTRAINT DF_Alert_CreatedAt DEFAULT (SYSUTCDATETIME()),
    ResolvedBy     VARCHAR(20)    NULL,
    ResolvedAt     DATETIME2(0)   NULL,
    ResolutionType NVARCHAR(20)   NULL,                                        -- 'RECEIPT' | 'ADJUSTMENT' | 'REJECT'
    ResolutionNote NVARCHAR(500)  NULL,
    CONSTRAINT PK_InventoryAlert PRIMARY KEY (AlertId),
    CONSTRAINT FK_Alert_Medicine    FOREIGN KEY (MedicineId) REFERENCES dbo.Medicine (MedicineId),
    CONSTRAINT FK_Alert_CreatedBy   FOREIGN KEY (CreatedBy)  REFERENCES dbo.Employee (EmployeeId),
    CONSTRAINT FK_Alert_ResolvedBy  FOREIGN KEY (ResolvedBy) REFERENCES dbo.Employee (EmployeeId),
    CONSTRAINT CK_Alert_AlertType   CHECK (AlertType IN (N'LOW_STOCK', N'NEAR_EXPIRY', N'EXPIRED')),
    CONSTRAINT CK_Alert_Status      CHECK (Status    IN (N'PENDING', N'RESOLVED', N'REJECTED')),
    CONSTRAINT CK_Alert_ResolutionType CHECK (ResolutionType IS NULL OR ResolutionType IN (N'RECEIPT', N'ADJUSTMENT', N'REJECT'))
);
GO

CREATE TABLE dbo.Notification (
    NotificationId   VARCHAR(40)   NOT NULL,
    TargetRoleId     VARCHAR(20)   NULL,
    TargetEmployeeId VARCHAR(20)   NULL,
    Message          NVARCHAR(500) NOT NULL,
    IsRead           BIT           NOT NULL CONSTRAINT DF_Notification_IsRead DEFAULT (0),
    CreatedAt        DATETIME2(0)  NOT NULL CONSTRAINT DF_Notification_CreatedAt DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Notification PRIMARY KEY (NotificationId),
    CONSTRAINT FK_Notification_Role     FOREIGN KEY (TargetRoleId)     REFERENCES dbo.Role (RoleId),
    CONSTRAINT FK_Notification_Employee FOREIGN KEY (TargetEmployeeId) REFERENCES dbo.Employee (EmployeeId),
    CONSTRAINT CK_Notification_Target   CHECK (TargetRoleId IS NOT NULL OR TargetEmployeeId IS NOT NULL)
);
GO

/* =============================================================================
   PHẦN 9. DỮ LIỆU MẶC ĐỊNH (seed)
   ============================================================================= */

INSERT INTO dbo.Role (RoleId, RoleName, Description) VALUES
    ('ADMIN', N'Quản trị viên',      N'Chủ nhà thuốc / Admin toàn hệ thống'),
    ('STAFF', N'Nhân viên bán hàng', N'Bán hàng tại quầy, tạo hóa đơn');
GO

INSERT INTO dbo.Unit (UnitId, UnitName) VALUES
    ('VIEN', N'Viên'),
    ('VI',   N'Vỉ'),
    ('HOP',  N'Hộp'),
    ('CHAI', N'Chai'),
    ('GOI',  N'Gói'),
    ('LO',   N'Lọ'),
    ('TUYP', N'Tuýp'),
    ('CAI',  N'Cái');
GO

-- Khách lẻ mặc định
INSERT INTO dbo.Customer (CustomerId, CustomerName, Phone, Gender)
VALUES ('KH000000', N'Khách lẻ', NULL, NULL);
GO

PRINT N'>>> Đã tạo xong CSDL PharmacyFinance.';
GO


USE PharmacyFinance;

INSERT INTO dbo.Employee (
    EmployeeId, FullName, Phone, Email, Username,
    PasswordHash, RoleId, IsActive, IsRoot, HireDate
)
VALUES (
    'NV001',
    N'Nguyễn Văn An',
    '0901111222',
    'admin01@pharmacy.local',
    'admin01',
    '$2b$10$wwbuplPwY1DSEB3nWKlnZeMRpUgKwWn7TWTo9mNolEgz7zIcvaOpy',
    'ADMIN',
    1,
    1,
    '2025-01-01'
);