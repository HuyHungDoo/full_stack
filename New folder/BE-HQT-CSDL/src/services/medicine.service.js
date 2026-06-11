import { query, queryOne } from '../config/db.js'
import AppError from '../utils/AppError.js'

// ============================================================
// helper map
// ============================================================
function mapMedicine(row) {
  if (!row) return null
  return {
    medicineId: row.MedicineId,
    medicineName: row.MedicineName,
    productType: row.ProductType,
    drugRegistrationCode: row.DrugRegistrationCode,
    listPrice: Number(row.ListPrice),
    minStock: row.MinStock,
    isActive: !!row.IsActive,
    ingredient: row.Ingredient,
    usage: row.Usage,
    dosage: row.Dosage,
    route: row.Route,
    currentStock: Number(row.CurrentStock || 0),
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
    unit: row.UnitId ? { unitId: row.UnitId, unitName: row.UnitName } : null,
    category: row.CategoryId ? { categoryId: row.CategoryId, categoryName: row.CategoryName } : null,
    manufacturer: row.ManufacturerId ? {
      manufacturerId: row.ManufacturerId,
      manufacturerName: row.ManufacturerName,
      country: row.Country,
    } : null,
  }
}

function mapBatch(row) {
  if (!row) return null
  return {
    batchId: row.BatchId,
    importPrice: Number(row.ImportPrice),
    importDate: row.ImportDate,
    expiryDate: row.ExpiryDate,
    initialQty: row.InitialQty,
    currentQty: row.CurrentQty,
    note: row.Note,
    supplier: row.SupplierId ? { supplierId: row.SupplierId, supplierName: row.SupplierName } : null,
    manufacturer: row.BatchManufacturerId ? {
      manufacturerId: row.BatchManufacturerId,
      manufacturerName: row.BatchManufacturerName,
    } : null,
    isExpired: !!row.IsExpired,
    isNearExpiry: !!row.IsNearExpiry,
    // so ngay tu hom nay den HSD - am = da het han
    daysUntilExpiry: row.DaysUntilExpiry,
  }
}

// ============================================================
// kiem tra FK (UnitId, CategoryId, ManufacturerId) co ton tai khong
// ============================================================
async function checkUnitExists(unitId) {
  const row = await queryOne('SELECT 1 AS x FROM dbo.Unit WHERE UnitId = @id', { id: unitId })
  if (!row) throw new AppError(`Đơn vị tính "${unitId}" không tồn tại`, 400, 'UNIT_NOT_FOUND')
}

async function checkCategoryExists(categoryId) {
  if (!categoryId) return
  const row = await queryOne('SELECT 1 AS x FROM dbo.MedicineCategory WHERE CategoryId = @id', { id: categoryId })
  if (!row) throw new AppError(`Nhóm thuốc "${categoryId}" không tồn tại`, 400, 'CATEGORY_NOT_FOUND')
}

async function checkManufacturerExists(manufacturerId) {
  if (!manufacturerId) return
  const row = await queryOne('SELECT 1 AS x FROM dbo.Manufacturer WHERE ManufacturerId = @id', { id: manufacturerId })
  if (!row) throw new AppError(`Hãng sản xuất "${manufacturerId}" không tồn tại`, 400, 'MANUFACTURER_NOT_FOUND')
}

// ============================================================
// SELECT base + JOIN don vi/nhom/hang san xuat + tinh ton kho
// ============================================================
const SELECT_MEDICINE = `
  SELECT m.MedicineId, m.MedicineName, m.ProductType, m.DrugRegistrationCode,
         m.ListPrice, m.MinStock, m.IsActive,
         m.Ingredient, m.[Usage], m.Dosage, m.Route,
         m.CreatedAt, m.UpdatedAt,
         u.UnitId, u.UnitName,
         c.CategoryId, c.CategoryName,
         mf.ManufacturerId, mf.ManufacturerName, mf.Country,
         ISNULL((
           SELECT SUM(b.CurrentQty)
           FROM dbo.MedicineBatch b
           WHERE b.MedicineId = m.MedicineId
             AND b.ExpiryDate >= CAST(GETDATE() AS DATE)
             AND b.CurrentQty > 0
         ), 0) AS CurrentStock
  FROM dbo.Medicine m
  JOIN dbo.Unit u ON u.UnitId = m.UnitId
  LEFT JOIN dbo.MedicineCategory c ON c.CategoryId = m.CategoryId
  LEFT JOIN dbo.Manufacturer mf ON mf.ManufacturerId = m.ManufacturerId
`

// ============================================================
// API
// ============================================================
export async function getAll(filters = {}) {
  // build WHERE dong tu cac filter co gia tri
  const conditions = []
  const params = {}

  if (filters.search) {
    conditions.push(`(m.MedicineName LIKE N'%' + @search + N'%' OR m.MedicineId = @search)`)
    params.search = filters.search
  }
  if (filters.productType) {
    conditions.push('m.ProductType = @productType')
    params.productType = filters.productType
  }
  if (filters.categoryId) {
    conditions.push('m.CategoryId = @categoryId')
    params.categoryId = filters.categoryId
  }
  if (filters.isActive !== undefined) {
    conditions.push('m.IsActive = @isActive')
    params.isActive = filters.isActive ? 1 : 0
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const rows = await query(`${SELECT_MEDICINE} ${where} ORDER BY m.MedicineName`, params)
  return rows.map(mapMedicine)
}

export async function getById(medicineId) {
  const row = await queryOne(`${SELECT_MEDICINE} WHERE m.MedicineId = @id`, { id: medicineId })
  if (!row) {
    throw new AppError('Không tìm thấy thuốc', 404, 'MEDICINE_NOT_FOUND')
  }

  const medicine = mapMedicine(row)
  const batches = await getBatchesByMedicineId(medicineId)
  const stockSummary = await getStockByMedicineId(medicineId)

  return { ...medicine, batches, stockSummary }
}

export async function getBatchesByMedicineId(medicineId) {
  const sql = `
    SELECT b.BatchId, b.ImportPrice, b.ImportDate, b.ExpiryDate,
           b.InitialQty, b.CurrentQty, b.Note,
           s.SupplierId, s.SupplierName,
           mf.ManufacturerId AS BatchManufacturerId,
           mf.ManufacturerName AS BatchManufacturerName,
           CASE WHEN b.ExpiryDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS IsExpired,
           CASE WHEN b.ExpiryDate <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))
                 AND b.ExpiryDate >= CAST(GETDATE() AS DATE)
                THEN 1 ELSE 0 END AS IsNearExpiry,
           DATEDIFF(DAY, CAST(GETDATE() AS DATE), b.ExpiryDate) AS DaysUntilExpiry
    FROM dbo.MedicineBatch b
    LEFT JOIN dbo.Supplier s ON s.SupplierId = b.SupplierId
    LEFT JOIN dbo.Manufacturer mf ON mf.ManufacturerId = b.ManufacturerId
    WHERE b.MedicineId = @id
    ORDER BY b.ExpiryDate ASC
  `
  const rows = await query(sql, { id: medicineId })
  return rows.map(mapBatch)
}

export async function getStockByMedicineId(medicineId) {
  // lay MinStock cua thuoc de tinh isBelowMinStock
  const medRow = await queryOne(
    'SELECT MinStock FROM dbo.Medicine WHERE MedicineId = @id',
    { id: medicineId }
  )
  if (!medRow) {
    throw new AppError('Không tìm thấy thuốc', 404, 'MEDICINE_NOT_FOUND')
  }

  const sql = `
    SELECT
      COUNT(*) AS TotalBatches,
      ISNULL(SUM(CASE WHEN ExpiryDate >= CAST(GETDATE() AS DATE) THEN CurrentQty ELSE 0 END), 0) AS CurrentStock,
      ISNULL(SUM(CASE WHEN ExpiryDate < CAST(GETDATE() AS DATE) THEN CurrentQty ELSE 0 END), 0) AS ExpiredQty,
      MIN(ExpiryDate) AS EarliestExpiry,
      MAX(ExpiryDate) AS LatestExpiry
    FROM dbo.MedicineBatch
    WHERE MedicineId = @id
  `
  const row = await queryOne(sql, { id: medicineId })
  const currentStock = Number(row?.CurrentStock || 0)

  return {
    medicineId,
    totalBatches: row?.TotalBatches || 0,
    currentStock,
    expiredQty: Number(row?.ExpiredQty || 0),
    earliestExpiry: row?.EarliestExpiry,
    latestExpiry: row?.LatestExpiry,
    minStock: medRow.MinStock,
    isBelowMinStock: currentStock <= medRow.MinStock,
  }
}

export async function create(data) {
  // check trung MedicineId
  const dup = await queryOne(
    'SELECT 1 AS x FROM dbo.Medicine WHERE MedicineId = @id',
    { id: data.medicineId }
  )
  if (dup) {
    throw new AppError(`Mã thuốc "${data.medicineId}" đã tồn tại`, 409, 'MEDICINE_EXISTS')
  }

  // check FK
  await checkUnitExists(data.unitId)
  await checkCategoryExists(data.categoryId)
  await checkManufacturerExists(data.manufacturerId)

  await query(
    `INSERT INTO dbo.Medicine
       (MedicineId, MedicineName, CategoryId, UnitId, ManufacturerId,
        ProductType, DrugRegistrationCode, ListPrice, MinStock, IsActive,
        Ingredient, [Usage], Dosage, Route)
     VALUES
       (@medicineId, @medicineName, @categoryId, @unitId, @manufacturerId,
        @productType, @drugRegistrationCode, @listPrice, @minStock, 1,
        @ingredient, @usage, @dosage, @route)`,
    {
      medicineId: data.medicineId,
      medicineName: data.medicineName,
      categoryId: data.categoryId || null,
      unitId: data.unitId,
      manufacturerId: data.manufacturerId || null,
      productType: data.productType,
      drugRegistrationCode: data.drugRegistrationCode || null,
      listPrice: data.listPrice,
      minStock: data.minStock,
      ingredient: data.ingredient || null,
      usage: data.usage || null,
      dosage: data.dosage || null,
      route: data.route || null,
    }
  )

  return await getById(data.medicineId)
}

export async function update(medicineId, data) {
  const current = await queryOne(
    'SELECT MedicineId, UnitId FROM dbo.Medicine WHERE MedicineId = @id',
    { id: medicineId }
  )
  if (!current) {
    throw new AppError('Không tìm thấy thuốc', 404, 'MEDICINE_NOT_FOUND')
  }

  // neu doi UnitId thi phai chua co lo nao
  if (data.unitId && data.unitId !== current.UnitId) {
    const hasBatch = await queryOne(
      'SELECT TOP 1 1 AS x FROM dbo.MedicineBatch WHERE MedicineId = @id',
      { id: medicineId }
    )
    if (hasBatch) {
      throw new AppError(
        'Không thể đổi đơn vị tính khi thuốc đã có lô trong kho',
        400,
        'CANNOT_CHANGE_UNIT'
      )
    }
    await checkUnitExists(data.unitId)
  }

  if (data.categoryId !== undefined && data.categoryId !== null) {
    await checkCategoryExists(data.categoryId)
  }
  if (data.manufacturerId !== undefined && data.manufacturerId !== null) {
    await checkManufacturerExists(data.manufacturerId)
  }

  // build SET clause dong
  const sets = []
  const params = { id: medicineId }
  if (data.medicineName !== undefined)         { sets.push('MedicineName = @medicineName');                 params.medicineName = data.medicineName }
  if (data.categoryId !== undefined)           { sets.push('CategoryId = @categoryId');                     params.categoryId = data.categoryId }
  if (data.unitId !== undefined)               { sets.push('UnitId = @unitId');                             params.unitId = data.unitId }
  if (data.manufacturerId !== undefined)       { sets.push('ManufacturerId = @manufacturerId');             params.manufacturerId = data.manufacturerId }
  if (data.productType !== undefined)          { sets.push('ProductType = @productType');                   params.productType = data.productType }
  if (data.drugRegistrationCode !== undefined) { sets.push('DrugRegistrationCode = @drugRegistrationCode'); params.drugRegistrationCode = data.drugRegistrationCode }
  if (data.listPrice !== undefined)            { sets.push('ListPrice = @listPrice');                       params.listPrice = data.listPrice }
  if (data.minStock !== undefined)             { sets.push('MinStock = @minStock');                         params.minStock = data.minStock }
  if (data.ingredient !== undefined)           { sets.push('Ingredient = @ingredient');                     params.ingredient = data.ingredient }
  if (data.usage !== undefined)                { sets.push('[Usage] = @usage');                             params.usage = data.usage }
  if (data.dosage !== undefined)               { sets.push('Dosage = @dosage');                             params.dosage = data.dosage }
  if (data.route !== undefined)                { sets.push('Route = @route');                               params.route = data.route }
  if (data.isActive !== undefined)             { sets.push('IsActive = @isActive');                         params.isActive = data.isActive ? 1 : 0 }

  if (sets.length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }

  // tu cap nhat UpdatedAt
  sets.push('UpdatedAt = SYSUTCDATETIME()')

  await query(
    `UPDATE dbo.Medicine SET ${sets.join(', ')} WHERE MedicineId = @id`,
    params
  )

  return await getById(medicineId)
}

export async function deactivate(medicineId) {
  const med = await queryOne(
    'SELECT IsActive FROM dbo.Medicine WHERE MedicineId = @id',
    { id: medicineId }
  )
  if (!med) {
    throw new AppError('Không tìm thấy thuốc', 404, 'MEDICINE_NOT_FOUND')
  }
  if (!med.IsActive) {
    throw new AppError('Thuốc này đã ngừng kinh doanh', 400, 'ALREADY_INACTIVE')
  }

  // khong cho ngung khi con ton kho
  const stockRow = await queryOne(
    `SELECT ISNULL(SUM(CurrentQty), 0) AS TotalQty
     FROM dbo.MedicineBatch
     WHERE MedicineId = @id AND ExpiryDate >= CAST(GETDATE() AS DATE)`,
    { id: medicineId }
  )
  if (stockRow.TotalQty > 0) {
    throw new AppError(
      `Không thể ngừng kinh doanh khi còn ${stockRow.TotalQty} đơn vị tồn kho`,
      400,
      'STOCK_REMAINING'
    )
  }

  await query(
    'UPDATE dbo.Medicine SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE MedicineId = @id',
    { id: medicineId }
  )
}
