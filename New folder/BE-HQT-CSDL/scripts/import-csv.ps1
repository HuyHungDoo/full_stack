param(
  [string]$CsvDir = "C:\Users\ADMIN\Downloads\output"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Data

if (-not (Test-Path $CsvDir)) {
  throw "CSV folder not found: $CsvDir"
}

$connStr = "Server=localhost\SQLEXPRESS;Database=PharmacyFinance;Trusted_Connection=True;TrustServerCertificate=True"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

function Invoke-Db([string]$Query) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $Query
  $cmd.CommandTimeout = 600
  [void]$cmd.ExecuteNonQuery()
}

function Read-CsvRows([string]$FileName) {
  $path = Join-Path $CsvDir $FileName
  Import-Csv -Path $path -Encoding UTF8
}

function To-Null([object]$Value) {
  if ($null -eq $Value) { return $null }
  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  return $text
}

function To-Bit([object]$Value, [int]$Default = 1) {
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $Default }
  $text = [string]$Value
  if ($text -eq '0' -or $text -eq 'false') { return 0 }
  return 1
}

function To-Number([object]$Value, [double]$Default = 0) {
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $Default }
  return [double]$Value
}

function To-Date([object]$Value) {
  $text = To-Null $Value
  if (-not $text) { return $null }
  return $text.Substring(0, 10)
}

function To-DateTime([object]$Value) {
  $text = To-Null $Value
  if (-not $text) { return $null }
  return [datetime]::Parse($text)
}

function New-ImportTable {
  param(
    [Parameter(Mandatory = $true)]
    [array]$ColumnDefs
  )
  $table = New-Object System.Data.DataTable
  foreach ($def in $ColumnDefs) {
    [void]$table.Columns.Add($def.Name, $def.Type)
  }
  return ,$table
}

function Add-TableRow {
  param(
    [Parameter(Mandatory = $true)]
    [System.Data.DataTable]$Table,
    [Parameter(Mandatory = $true)]
    [hashtable]$Values
  )
  if ($null -eq $Table) { throw 'DataTable is null' }
  $row = $Table.NewRow()
  foreach ($column in $Table.Columns) {
    $name = $column.ColumnName
    if (-not $Values.ContainsKey($name)) { continue }
    $value = $Values[$name]
    if ($null -eq $value) {
      $row[$name] = [DBNull]::Value
    } else {
      $row[$name] = $value
    }
  }
  [void]$Table.Rows.Add($row)
}

function Write-DataTable([string]$DestinationTable, [System.Data.DataTable]$DataTable) {
  if ($DataTable.Rows.Count -eq 0) {
    Write-Host "  skip $DestinationTable (0 rows)"
    return
  }
  $bulk = New-Object System.Data.SqlClient.SqlBulkCopy($conn)
  $bulk.DestinationTableName = $DestinationTable
  $bulk.BatchSize = 5000
  $bulk.BulkCopyTimeout = 600
  $bulk.WriteToServer($DataTable)
  Write-Host "  $DestinationTable : $($DataTable.Rows.Count)"
}

function Dedupe-Manufacturers([array]$Rows) {
  $kept = @{}
  $remap = @{}
  $result = New-Object System.Collections.Generic.List[object]
  foreach ($row in $Rows) {
    $key = $row.ManufacturerName.ToLower()
    if (-not $kept.ContainsKey($key)) {
      $kept[$key] = $row.ManufacturerId
      [void]$result.Add($row)
    } else {
      $remap[$row.ManufacturerId] = $kept[$key]
    }
  }
  return @{ Rows = $result; Remap = $remap }
}

function Remap-ManufacturerId($Id, $Remap) {
  $value = To-Null $Id
  if (-not $value) { return $null }
  if ($Remap.ContainsKey($value)) { return $Remap[$value] }
  return $value
}

Write-Host "Clearing existing data..."
Invoke-Db @"
DELETE FROM dbo.Notification;
DELETE FROM dbo.InventoryAlert;
DELETE FROM dbo.StockWriteOffLine;
DELETE FROM dbo.StockWriteOff;
DELETE FROM dbo.SalesReturnLine;
DELETE FROM dbo.SalesReturn;
DELETE FROM dbo.SalesInvoiceLine;
DELETE FROM dbo.SalesInvoice;
DELETE FROM dbo.PurchaseReceiptLine;
DELETE FROM dbo.PurchaseReceipt;
DELETE FROM dbo.MedicineBatch;
DELETE FROM dbo.Medicine;
DELETE FROM dbo.Customer;
DELETE FROM dbo.Employee;
DELETE FROM dbo.Manufacturer;
DELETE FROM dbo.Supplier;
DELETE FROM dbo.MedicineCategory;
"@

Invoke-Db @"
IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleId = 'ADMIN')
  INSERT INTO dbo.Role (RoleId, RoleName, Description)
  VALUES ('ADMIN', N'Quản trị viên', N'Chủ nhà thuốc / Admin toàn hệ thống');
IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleId = 'STAFF')
  INSERT INTO dbo.Role (RoleId, RoleName, Description)
  VALUES ('STAFF', N'Nhân viên bán hàng', N'Bán hàng tại quầy, tạo hóa đơn');
IF NOT EXISTS (SELECT 1 FROM dbo.Unit)
  INSERT INTO dbo.Unit (UnitId, UnitName) VALUES
    ('VIEN', N'Viên'), ('VI', N'Vỉ'), ('HOP', N'Hộp'), ('CHAI', N'Chai'),
    ('GOI', N'Gói'), ('LO', N'Lọ'), ('TUYP', N'Tuýp'), ('CAI', N'Cái');
"@

Write-Host "Reading CSV from: $CsvDir"

$manufacturerDedup = Dedupe-Manufacturers (Read-CsvRows 'Manufacturer.csv')
if ($manufacturerDedup.Remap.Count -gt 0) {
  Write-Host "  deduped manufacturers: $((Read-CsvRows 'Manufacturer.csv').Count) -> $($manufacturerDedup.Rows.Count)"
}

Write-Host "Importing..."

$categoryTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'CategoryId'; Type = [string] },
  @{ Name = 'CategoryName'; Type = [string] },
  @{ Name = 'Description'; Type = [string] }
)
foreach ($row in Read-CsvRows 'MedicineCategory.csv') {
  Add-TableRow -Table $categoryTable -Values @{ CategoryId = $row.CategoryId; CategoryName = $row.CategoryName; Description = $null }
}
Write-DataTable 'dbo.MedicineCategory' $categoryTable

$supplierTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'SupplierId'; Type = [string] },
  @{ Name = 'SupplierName'; Type = [string] },
  @{ Name = 'Email'; Type = [string] },
  @{ Name = 'Address'; Type = [string] },
  @{ Name = 'IsActive'; Type = [bool] }
)
foreach ($row in Read-CsvRows 'Supplier.csv') {
  Add-TableRow -Table $supplierTable -Values @{
    SupplierId = $row.SupplierId; SupplierName = $row.SupplierName
    Email = (To-Null $row.Email); Address = (To-Null $row.Address); IsActive = $true
  }
}
Write-DataTable 'dbo.Supplier' $supplierTable

$manufacturerTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'ManufacturerId'; Type = [string] },
  @{ Name = 'ManufacturerName'; Type = [string] },
  @{ Name = 'Country'; Type = [string] }
)
foreach ($row in $manufacturerDedup.Rows) {
  Add-TableRow -Table $manufacturerTable -Values @{
    ManufacturerId = $row.ManufacturerId; ManufacturerName = $row.ManufacturerName; Country = (To-Null $row.Country)
  }
}
Write-DataTable 'dbo.Manufacturer' $manufacturerTable

$employeeTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'EmployeeId'; Type = [string] },
  @{ Name = 'FullName'; Type = [string] },
  @{ Name = 'Phone'; Type = [string] },
  @{ Name = 'Email'; Type = [string] },
  @{ Name = 'Username'; Type = [string] },
  @{ Name = 'PasswordHash'; Type = [string] },
  @{ Name = 'RoleId'; Type = [string] },
  @{ Name = 'IsActive'; Type = [bool] },
  @{ Name = 'IsRoot'; Type = [bool] },
  @{ Name = 'HireDate'; Type = [datetime] }
)
foreach ($row in Read-CsvRows 'Employee.csv') {
  Add-TableRow -Table $employeeTable -Values @{
    EmployeeId = $row.EmployeeId; FullName = $row.FullName; Phone = (To-Null $row.Phone)
    Email = $row.Email; Username = $row.Username; PasswordHash = $row.PasswordHash; RoleId = $row.RoleId
    IsActive = [bool](To-Bit $row.IsActive 1); IsRoot = ($row.EmployeeId -eq 'NV001')
    HireDate = (To-Date $row.HireDate)
  }
}
Write-DataTable 'dbo.Employee' $employeeTable

$customerTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'CustomerId'; Type = [string] },
  @{ Name = 'CustomerName'; Type = [string] },
  @{ Name = 'Phone'; Type = [string] },
  @{ Name = 'Gender'; Type = [string] },
  @{ Name = 'TotalSpent'; Type = [decimal] },
  @{ Name = 'CreatedAt'; Type = [datetime] }
)
foreach ($row in Read-CsvRows 'Customer.csv') {
  Add-TableRow -Table $customerTable -Values @{
    CustomerId = $row.CustomerId; CustomerName = $row.CustomerName; Phone = (To-Null $row.Phone)
    Gender = (To-Null $row.Gender); TotalSpent = (To-Number $row.TotalSpent 0)
    CreatedAt = (To-DateTime $row.CreatedAt)
  }
}
Write-DataTable 'dbo.Customer' $customerTable

$medicineTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'MedicineId'; Type = [string] },
  @{ Name = 'MedicineName'; Type = [string] },
  @{ Name = 'CategoryId'; Type = [string] },
  @{ Name = 'UnitId'; Type = [string] },
  @{ Name = 'ManufacturerId'; Type = [string] },
  @{ Name = 'ProductType'; Type = [string] },
  @{ Name = 'DrugRegistrationCode'; Type = [string] },
  @{ Name = 'ListPrice'; Type = [decimal] },
  @{ Name = 'MinStock'; Type = [int] },
  @{ Name = 'IsActive'; Type = [bool] },
  @{ Name = 'Ingredient'; Type = [string] },
  @{ Name = 'Usage'; Type = [string] },
  @{ Name = 'Dosage'; Type = [string] },
  @{ Name = 'Route'; Type = [string] }
)
foreach ($row in Read-CsvRows 'Medicine.csv') {
  Add-TableRow -Table $medicineTable -Values @{
    MedicineId = $row.MedicineId; MedicineName = $row.MedicineName; CategoryId = (To-Null $row.CategoryId)
    UnitId = $row.UnitId; ManufacturerId = (Remap-ManufacturerId $row.ManufacturerId $manufacturerDedup.Remap)
    ProductType = $row.ProductType; DrugRegistrationCode = (To-Null $row.DrugRegistrationCode)
    ListPrice = (To-Number $row.ListPrice 0); MinStock = [int](To-Number $row.MinStock 0)
    IsActive = [bool](To-Bit $row.IsActive 1); Ingredient = (To-Null $row.Ingredient)
    Usage = (To-Null $row.Usage); Dosage = (To-Null $row.Dosage); Route = (To-Null $row.Route)
  }
}
Write-DataTable 'dbo.Medicine' $medicineTable

$batchTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'BatchId'; Type = [string] },
  @{ Name = 'MedicineId'; Type = [string] },
  @{ Name = 'ImportPrice'; Type = [decimal] },
  @{ Name = 'ImportDate'; Type = [datetime] },
  @{ Name = 'ExpiryDate'; Type = [datetime] },
  @{ Name = 'InitialQty'; Type = [int] },
  @{ Name = 'CurrentQty'; Type = [int] },
  @{ Name = 'SupplierId'; Type = [string] },
  @{ Name = 'ManufacturerId'; Type = [string] },
  @{ Name = 'Note'; Type = [string] }
)
foreach ($row in Read-CsvRows 'MedicineBatch.csv') {
  Add-TableRow -Table $batchTable -Values @{
    BatchId = $row.BatchId; MedicineId = $row.MedicineId; ImportPrice = (To-Number $row.ImportPrice 0)
    ImportDate = (To-Date $row.ImportDate); ExpiryDate = (To-Date $row.ExpiryDate)
    InitialQty = [int](To-Number $row.InitialQty 0); CurrentQty = [int](To-Number $row.CurrentQty 0)
    SupplierId = (To-Null $row.SupplierId); ManufacturerId = (Remap-ManufacturerId $row.ManufacturerId $manufacturerDedup.Remap)
    Note = $null
  }
}
Write-DataTable 'dbo.MedicineBatch' $batchTable

$receiptTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'ReceiptId'; Type = [string] },
  @{ Name = 'SupplierId'; Type = [string] },
  @{ Name = 'EmployeeId'; Type = [string] },
  @{ Name = 'ReceiptDate'; Type = [datetime] },
  @{ Name = 'TotalAmount'; Type = [decimal] },
  @{ Name = 'Status'; Type = [string] },
  @{ Name = 'Note'; Type = [string] }
)
foreach ($row in Read-CsvRows 'PurchaseReceipt.csv') {
  Add-TableRow -Table $receiptTable -Values @{
    ReceiptId = $row.ReceiptId; SupplierId = $row.SupplierId; EmployeeId = $row.EmployeeId
    ReceiptDate = (To-DateTime $row.ReceiptDate); TotalAmount = (To-Number $row.TotalAmount 0)
    Status = $(if ($row.Status) { $row.Status } else { 'COMPLETED' }); Note = $null
  }
}
Write-DataTable 'dbo.PurchaseReceipt' $receiptTable

$receiptLineTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'LineId'; Type = [string] },
  @{ Name = 'ReceiptId'; Type = [string] },
  @{ Name = 'MedicineId'; Type = [string] },
  @{ Name = 'BatchId'; Type = [string] },
  @{ Name = 'Quantity'; Type = [int] },
  @{ Name = 'UnitCost'; Type = [decimal] },
  @{ Name = 'LineTotal'; Type = [decimal] }
)
foreach ($row in Read-CsvRows 'PurchaseReceiptLine.csv') {
  Add-TableRow -Table $receiptLineTable -Values @{
    LineId = $row.LineId; ReceiptId = $row.ReceiptId; MedicineId = $row.MedicineId; BatchId = $row.BatchId
    Quantity = [int](To-Number $row.Quantity 0); UnitCost = (To-Number $row.UnitCost 0); LineTotal = (To-Number $row.LineTotal 0)
  }
}
Write-DataTable 'dbo.PurchaseReceiptLine' $receiptLineTable

$invoiceTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'InvoiceId'; Type = [string] },
  @{ Name = 'EmployeeId'; Type = [string] },
  @{ Name = 'CustomerId'; Type = [string] },
  @{ Name = 'CustomerNameSnapshot'; Type = [string] },
  @{ Name = 'PhoneSnapshot'; Type = [string] },
  @{ Name = 'InvoiceDate'; Type = [datetime] },
  @{ Name = 'TotalAmount'; Type = [decimal] },
  @{ Name = 'Status'; Type = [string] },
  @{ Name = 'Note'; Type = [string] }
)
foreach ($row in Read-CsvRows 'SalesInvoice.csv') {
  Add-TableRow -Table $invoiceTable -Values @{
    InvoiceId = $row.InvoiceId; EmployeeId = $row.EmployeeId; CustomerId = $row.CustomerId
    CustomerNameSnapshot = $row.CustomerNameSnapshot; PhoneSnapshot = (To-Null $row.PhoneSnapshot)
    InvoiceDate = (To-DateTime $row.InvoiceDate); TotalAmount = (To-Number $row.TotalAmount 0)
    Status = $(if ($row.Status) { $row.Status } else { 'COMPLETED' }); Note = (To-Null $row.Note)
  }
}
Write-DataTable 'dbo.SalesInvoice' $invoiceTable

$invoiceLineTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'LineId'; Type = [string] },
  @{ Name = 'InvoiceId'; Type = [string] },
  @{ Name = 'MedicineId'; Type = [string] },
  @{ Name = 'BatchId'; Type = [string] },
  @{ Name = 'MedicineNameSnapshot'; Type = [string] },
  @{ Name = 'UnitNameSnapshot'; Type = [string] },
  @{ Name = 'Quantity'; Type = [int] },
  @{ Name = 'UnitPrice'; Type = [decimal] },
  @{ Name = 'LineTotal'; Type = [decimal] },
  @{ Name = 'CostPriceSnapshot'; Type = [decimal] }
)
foreach ($row in Read-CsvRows 'SalesInvoiceLine.csv') {
  Add-TableRow -Table $invoiceLineTable -Values @{
    LineId = $row.LineId; InvoiceId = $row.InvoiceId; MedicineId = $row.MedicineId; BatchId = $row.BatchId
    MedicineNameSnapshot = $row.MedicineNameSnapshot; UnitNameSnapshot = $row.UnitNameSnapshot
    Quantity = [int](To-Number $row.Quantity 0); UnitPrice = (To-Number $row.UnitPrice 0)
    LineTotal = (To-Number $row.LineTotal 0); CostPriceSnapshot = (To-Number $row.CostPriceSnapshot 0)
  }
}
Write-DataTable 'dbo.SalesInvoiceLine' $invoiceLineTable

$returnTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'ReturnId'; Type = [string] },
  @{ Name = 'InvoiceId'; Type = [string] },
  @{ Name = 'EmployeeId'; Type = [string] },
  @{ Name = 'ReturnDate'; Type = [datetime] },
  @{ Name = 'TotalRefund'; Type = [decimal] },
  @{ Name = 'Reason'; Type = [string] },
  @{ Name = 'Status'; Type = [string] }
)
foreach ($row in Read-CsvRows 'SalesReturn.csv') {
  Add-TableRow -Table $returnTable -Values @{
    ReturnId = $row.ReturnId; InvoiceId = $row.InvoiceId; EmployeeId = $row.EmployeeId
    ReturnDate = (To-DateTime $row.ReturnDate); TotalRefund = (To-Number $row.TotalRefund 0)
    Reason = (To-Null $row.Reason); Status = $(if ($row.Status) { $row.Status } else { 'COMPLETED' })
  }
}
Write-DataTable 'dbo.SalesReturn' $returnTable

$returnLineTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'LineId'; Type = [string] },
  @{ Name = 'ReturnId'; Type = [string] },
  @{ Name = 'InvoiceLineId'; Type = [string] },
  @{ Name = 'Quantity'; Type = [int] },
  @{ Name = 'RefundAmount'; Type = [decimal] },
  @{ Name = 'Reason'; Type = [string] }
)
foreach ($row in Read-CsvRows 'SalesReturnLine.csv') {
  Add-TableRow -Table $returnLineTable -Values @{
    LineId = $row.LineId; ReturnId = $row.ReturnId; InvoiceLineId = $row.InvoiceLineId
    Quantity = [int](To-Number $row.Quantity 0); RefundAmount = (To-Number $row.RefundAmount 0)
    Reason = (To-Null $row.Reason)
  }
}
Write-DataTable 'dbo.SalesReturnLine' $returnLineTable

$writeOffTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'WriteOffId'; Type = [string] },
  @{ Name = 'EmployeeId'; Type = [string] },
  @{ Name = 'WriteOffDate'; Type = [datetime] },
  @{ Name = 'TotalCost'; Type = [decimal] },
  @{ Name = 'Reason'; Type = [string] },
  @{ Name = 'Status'; Type = [string] }
)
foreach ($row in Read-CsvRows 'StockWriteOff.csv') {
  Add-TableRow -Table $writeOffTable -Values @{
    WriteOffId = $row.WriteOffId; EmployeeId = $row.EmployeeId; WriteOffDate = (To-DateTime $row.WriteOffDate)
    TotalCost = (To-Number $row.TotalCost 0); Reason = (To-Null $row.Reason)
    Status = $(if ($row.Status) { $row.Status } else { 'COMPLETED' })
  }
}
Write-DataTable 'dbo.StockWriteOff' $writeOffTable

$writeOffLineTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'LineId'; Type = [string] },
  @{ Name = 'WriteOffId'; Type = [string] },
  @{ Name = 'BatchId'; Type = [string] },
  @{ Name = 'MedicineId'; Type = [string] },
  @{ Name = 'Quantity'; Type = [int] },
  @{ Name = 'UnitCost'; Type = [decimal] },
  @{ Name = 'LineCost'; Type = [decimal] },
  @{ Name = 'Reason'; Type = [string] }
)
foreach ($row in Read-CsvRows 'StockWriteOffLine.csv') {
  Add-TableRow -Table $writeOffLineTable -Values @{
    LineId = $row.LineId; WriteOffId = $row.WriteOffId; BatchId = $row.BatchId; MedicineId = $row.MedicineId
    Quantity = [int](To-Number $row.Quantity 0); UnitCost = (To-Number $row.UnitCost 0)
    LineCost = (To-Number $row.LineCost 0); Reason = (To-Null $row.Reason)
  }
}
Write-DataTable 'dbo.StockWriteOffLine' $writeOffLineTable

$alertTable = New-ImportTable -ColumnDefs @(
  @{ Name = 'AlertId'; Type = [string] },
  @{ Name = 'MedicineId'; Type = [string] },
  @{ Name = 'AlertType'; Type = [string] },
  @{ Name = 'StockSnapshot'; Type = [int] },
  @{ Name = 'MinStock'; Type = [int] },
  @{ Name = 'Note'; Type = [string] },
  @{ Name = 'Status'; Type = [string] },
  @{ Name = 'CreatedBy'; Type = [string] },
  @{ Name = 'CreatedAt'; Type = [datetime] }
)
$now = Get-Date
foreach ($row in Read-CsvRows 'InventoryAlert.csv') {
  Add-TableRow -Table $alertTable -Values @{
    AlertId = $row.AlertId; MedicineId = $row.MedicineId; AlertType = $row.AlertType
    StockSnapshot = [int](To-Number $row.StockSnapshot 0); MinStock = [int](To-Number $row.MinStock 0)
    Note = (To-Null $row.Note); Status = $(if ($row.Status) { $row.Status } else { 'PENDING' })
    CreatedBy = (To-Null $row.CreatedBy); CreatedAt = $now
  }
}
Write-DataTable 'dbo.InventoryAlert' $alertTable

Write-Host "`nImport summary:"
sqlcmd -S "localhost\SQLEXPRESS" -E -Q "USE PharmacyFinance; SELECT 'Medicine' t, COUNT(*) c FROM Medicine UNION ALL SELECT 'Customer', COUNT(*) FROM Customer UNION ALL SELECT 'SalesInvoice', COUNT(*) FROM SalesInvoice UNION ALL SELECT 'SalesInvoiceLine', COUNT(*) FROM SalesInvoiceLine ORDER BY t" -W

$conn.Close()
Write-Host "`nDone."
