param(
  [string]$SourceServer = "localhost\SQLEXPRESS",
  [string]$SourceDatabase = "PharmacyFinance",
  [string]$TargetServer = "localhost",
  [string]$TargetDatabase = "HQT_BanChuan"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Data

$srcConnStr = "Server=$SourceServer;Database=$SourceDatabase;Trusted_Connection=True;TrustServerCertificate=True"
$dstConnStr = "Server=$TargetServer;Database=$TargetDatabase;Trusted_Connection=True;TrustServerCertificate=True"

$srcConn = New-Object System.Data.SqlClient.SqlConnection($srcConnStr)
$dstConn = New-Object System.Data.SqlClient.SqlConnection($dstConnStr)
$srcConn.Open()
$dstConn.Open()

function Invoke-TargetSql([string]$Query) {
  $cmd = $dstConn.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 600
  [void]$cmd.ExecuteNonQuery()
}

function Copy-QueryToGold([string]$DestinationTable, [string]$SourceQuery) {
  Write-Host "  $DestinationTable ..."
  $srcCmd = $srcConn.CreateCommand()
  $srcCmd.CommandText = $SourceQuery
  $srcCmd.CommandTimeout = 600
  $reader = $srcCmd.ExecuteReader()
  try {
    $bulk = New-Object System.Data.SqlClient.SqlBulkCopy($dstConn)
    $bulk.DestinationTableName = $DestinationTable
    $bulk.BatchSize = 5000
    $bulk.BulkCopyTimeout = 600
    for ($i = 0; $i -lt $reader.FieldCount; $i++) {
      [void]$bulk.ColumnMappings.Add($reader.GetName($i), $reader.GetName($i))
    }
    $bulk.WriteToServer($reader)
  } finally {
    $reader.Close()
  }
}

Write-Host "Clearing gold layer in $TargetDatabase ..."
Invoke-TargetSql @"
ALTER TABLE gold.Fact_Sales NOCHECK CONSTRAINT ALL;
ALTER TABLE gold.Fact_Purchases NOCHECK CONSTRAINT ALL;
ALTER TABLE gold.Fact_Inventory_Snapshot NOCHECK CONSTRAINT ALL;
ALTER TABLE gold.Fact_Stock_Loss NOCHECK CONSTRAINT ALL;

DELETE FROM gold.Fact_Sales;
DELETE FROM gold.Fact_Purchases;
DELETE FROM gold.Fact_Inventory_Snapshot;
DELETE FROM gold.Fact_Stock_Loss;
DELETE FROM gold.Dim_Product;
DELETE FROM gold.Dim_Customer;
DELETE FROM gold.Dim_Employee;
DELETE FROM gold.Dim_Supplier;
DELETE FROM gold.Dim_Date;

DBCC CHECKIDENT ('gold.Fact_Sales', RESEED, 0);
DBCC CHECKIDENT ('gold.Fact_Purchases', RESEED, 0);
DBCC CHECKIDENT ('gold.Fact_Inventory_Snapshot', RESEED, 0);
DBCC CHECKIDENT ('gold.Fact_Stock_Loss', RESEED, 0);

ALTER TABLE gold.Fact_Sales CHECK CONSTRAINT ALL;
ALTER TABLE gold.Fact_Purchases CHECK CONSTRAINT ALL;
ALTER TABLE gold.Fact_Inventory_Snapshot CHECK CONSTRAINT ALL;
ALTER TABLE gold.Fact_Stock_Loss CHECK CONSTRAINT ALL;
"@

Write-Host "Loading dimensions and facts from $SourceDatabase ..."

Copy-QueryToGold 'gold.Dim_Customer' @"
SELECT
  c.CustomerId AS CustomerKey,
  c.CustomerName,
  ISNULL(NULLIF(LTRIM(RTRIM(c.Phone)), ''), N'Không có') AS Phone,
  ISNULL(NULLIF(LTRIM(RTRIM(c.Gender)), ''), N'Chưa rõ') AS Gender,
  c.TotalSpent,
  c.CreatedAt AS CustomerCreatedAt
FROM dbo.Customer c
"@

Copy-QueryToGold 'gold.Dim_Employee' @"
SELECT
  e.EmployeeId AS EmployeeKey,
  e.FullName,
  e.Phone,
  e.Email,
  r.RoleName,
  e.IsActive
FROM dbo.Employee e
INNER JOIN dbo.Role r ON r.RoleId = e.RoleId
"@

Copy-QueryToGold 'gold.Dim_Supplier' @"
SELECT
  s.SupplierId AS SupplierKey,
  s.SupplierName,
  s.Address
FROM dbo.Supplier s
"@

Copy-QueryToGold 'gold.Dim_Product' @"
SELECT
  m.MedicineId AS ProductKey,
  m.MedicineName AS ProductName,
  m.ProductType,
  mc.CategoryName,
  mf.ManufacturerName,
  mf.Country,
  u.UnitName,
  m.DrugRegistrationCode,
  m.MinStock,
  N'Nhóm C (Sản phẩm thông thường)' AS abcclass,
  N'Lớp Z (Biến động cao)' AS xyzclass
FROM dbo.Medicine m
INNER JOIN dbo.Unit u ON u.UnitId = m.UnitId
LEFT JOIN dbo.MedicineCategory mc ON mc.CategoryId = m.CategoryId
LEFT JOIN dbo.Manufacturer mf ON mf.ManufacturerId = m.ManufacturerId
"@

Copy-QueryToGold 'gold.Dim_Date' @"
WITH RawDates AS (
  SELECT DATEADD(hour, 7, CAST(si.InvoiceDate AS datetime2)) AS dt FROM dbo.SalesInvoice si
  UNION ALL
  SELECT DATEADD(hour, 7, CAST(pr.ReceiptDate AS datetime2)) FROM dbo.PurchaseReceipt pr
  UNION ALL
  SELECT DATEADD(hour, 7, CAST(sw.WriteOffDate AS datetime2)) FROM dbo.StockWriteOff sw
  UNION ALL
  SELECT DATEADD(hour, 7, CAST(sr.ReturnDate AS datetime2)) FROM dbo.SalesReturn sr
  UNION ALL
  SELECT CAST(mb.ImportDate AS datetime2) FROM dbo.MedicineBatch mb
),
Hours AS (
  SELECT DATEADD(hour, DATEDIFF(hour, 0, dt), 0) AS dt
  FROM RawDates
  WHERE dt IS NOT NULL
)
SELECT DISTINCT
  CAST(FORMAT(dt, 'yyyyMMddHH') AS int) AS DateKey,
  CAST(dt AS datetime) AS FullDate,
  DATEPART(weekday, dt) AS DayOfWeek,
  DAY(dt) AS DayOfMonth,
  MONTH(dt) AS Month,
  DATEPART(quarter, dt) AS Quarter,
  YEAR(dt) AS [Year],
  DATEPART(hour, dt) AS Hour
FROM Hours
"@

Copy-QueryToGold 'gold.Fact_Sales' @"
SELECT
  sil.InvoiceId,
  sil.MedicineId AS ProductKey,
  si.CustomerId AS CustomerKey,
  si.EmployeeId AS EmployeeKey,
  CAST(FORMAT(DATEADD(hour, DATEDIFF(hour, 0, DATEADD(hour, 7, CAST(si.InvoiceDate AS datetime2))), 0), 'yyyyMMddHH') AS int) AS InvoiceDateKey,
  sil.Quantity AS QuantitySold,
  sil.UnitPrice,
  sil.LineTotal AS GrossRevenue,
  sil.CostPriceSnapshot,
  sil.LineTotal - (sil.CostPriceSnapshot * sil.Quantity) AS GrossProfit
FROM dbo.SalesInvoiceLine sil
INNER JOIN dbo.SalesInvoice si ON si.InvoiceId = sil.InvoiceId
WHERE si.Status = N'COMPLETED'
"@

Copy-QueryToGold 'gold.Fact_Purchases' @"
SELECT
  prl.ReceiptId,
  prl.MedicineId AS ProductKey,
  pr.SupplierId AS SupplierKey,
  pr.EmployeeId AS EmployeeKey,
  CAST(FORMAT(DATEADD(hour, DATEDIFF(hour, 0, DATEADD(hour, 7, CAST(pr.ReceiptDate AS datetime2))), 0), 'yyyyMMddHH') AS int) AS ReceiptDateKey,
  prl.Quantity AS QuantityPurchased,
  prl.UnitCost,
  prl.LineTotal AS TotalPurchaseCost
FROM dbo.PurchaseReceiptLine prl
INNER JOIN dbo.PurchaseReceipt pr ON pr.ReceiptId = prl.ReceiptId
WHERE pr.Status = N'COMPLETED'
"@

Copy-QueryToGold 'gold.Fact_Inventory_Snapshot' @"
DECLARE @asOf date = (
  SELECT MAX(CAST(DATEADD(hour, 7, CAST(InvoiceDate AS datetime2)) AS date))
  FROM dbo.SalesInvoice
);
SELECT
  mb.BatchId,
  mb.MedicineId AS ProductKey,
  mb.SupplierId AS SupplierKey,
  CAST(FORMAT(DATEADD(hour, DATEDIFF(hour, 0, CAST(mb.ImportDate AS datetime2)), 0), 'yyyyMMddHH') AS int) AS BatchDateKey,
  mb.InitialQty,
  mb.CurrentQty,
  mb.ImportPrice AS ImportPrice,
  DATEDIFF(day, @asOf, mb.ExpiryDate) AS DaysToExpiry,
  CASE WHEN DATEDIFF(day, @asOf, mb.ExpiryDate) <= 30 THEN 1 ELSE 0 END AS IsNearExpiry,
  CASE WHEN mb.CurrentQty <= m.MinStock THEN 1 ELSE 0 END AS IsLowStock
FROM dbo.MedicineBatch mb
INNER JOIN dbo.Medicine m ON m.MedicineId = mb.MedicineId
"@

Copy-QueryToGold 'gold.Fact_Stock_Loss' @"
SELECT
  wol.WriteOffId,
  wol.MedicineId AS ProductKey,
  wo.EmployeeId AS EmployeeKey,
  CAST(FORMAT(DATEADD(hour, DATEDIFF(hour, 0, DATEADD(hour, 7, CAST(wo.WriteOffDate AS datetime2))), 0), 'yyyyMMddHH') AS int) AS WriteOffDateKey,
  wol.Quantity AS QuantityWrittenOff,
  wol.UnitCost,
  wol.LineCost AS TotalLossAmount
FROM dbo.StockWriteOffLine wol
INNER JOIN dbo.StockWriteOff wo ON wo.WriteOffId = wol.WriteOffId
WHERE wo.Status = N'COMPLETED'
"@

Write-Host "`nSync summary:"
sqlcmd -S $TargetServer -E -Q @"
USE $TargetDatabase;
SELECT 'Dim_Customer' AS [Table], CAST(COUNT(*) AS varchar(20)) AS [Rows] FROM gold.Dim_Customer
UNION ALL SELECT 'Dim_Product', CAST(COUNT(*) AS varchar(20)) FROM gold.Dim_Product
UNION ALL SELECT 'Fact_Sales', CAST(COUNT(*) AS varchar(20)) FROM gold.Fact_Sales
UNION ALL SELECT 'Fact_Purchases', CAST(COUNT(*) AS varchar(20)) FROM gold.Fact_Purchases
UNION ALL SELECT 'Fact_Inventory_Snapshot', CAST(COUNT(*) AS varchar(20)) FROM gold.Fact_Inventory_Snapshot
UNION ALL SELECT 'Fact_Stock_Loss', CAST(COUNT(*) AS varchar(20)) FROM gold.Fact_Stock_Loss;
SELECT CONVERT(varchar(10), MAX(d.FullDate), 23) AS LatestSalesDate FROM gold.Fact_Sales fs JOIN gold.Dim_Date d ON d.DateKey = fs.InvoiceDateKey;
"@ -W

$srcConn.Close()
$dstConn.Close()
Write-Host "`nDone. Datamart $TargetDatabase synced from $SourceDatabase."
