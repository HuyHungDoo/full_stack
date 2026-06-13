import { query, queryOne } from '../config/db.js'
import AppError from '../utils/AppError.js'

// ============================================================
// helper map: tu PascalCase trong DB -> camelCase tra ve API
// ============================================================
function mapUnit(row) {
  if (!row) return null
  return { unitId: row.UnitId, unitName: row.UnitName }
}

function mapCategory(row) {
  if (!row) return null
  return {
    categoryId: row.CategoryId,
    categoryName: row.CategoryName,
    description: row.Description,
  }
}

function mapSupplier(row) {
  if (!row) return null
  return {
    supplierId: row.SupplierId,
    supplierName: row.SupplierName,
    email: row.Email,
    address: row.Address,
    isActive: !!row.IsActive,
  }
}

function mapManufacturer(row) {
  if (!row) return null
  return {
    manufacturerId: row.ManufacturerId,
    manufacturerName: row.ManufacturerName,
    country: row.Country,
  }
}

// ============================================================
// Unit (don vi tinh)
// ============================================================
export async function getAllUnits() {
  const rows = await query('SELECT UnitId, UnitName FROM dbo.Unit ORDER BY UnitName')
  return rows.map(mapUnit)
}

export async function createUnit(data) {
  const dup = await queryOne(
    'SELECT 1 AS x FROM dbo.Unit WHERE UnitId = @id OR UnitName = @name',
    { id: data.unitId, name: data.unitName }
  )
  if (dup) {
    throw new AppError('Mã hoặc tên đơn vị đã tồn tại', 409, 'UNIT_EXISTS')
  }

  await query(
    'INSERT INTO dbo.Unit (UnitId, UnitName) VALUES (@id, @name)',
    { id: data.unitId, name: data.unitName }
  )
  return { unitId: data.unitId, unitName: data.unitName }
}

// ============================================================
// MedicineCategory (nhom thuoc)
// ============================================================
export async function getAllCategories() {
  const rows = await query(
    'SELECT CategoryId, CategoryName, Description FROM dbo.MedicineCategory ORDER BY CategoryName'
  )
  return rows.map(mapCategory)
}

export async function createCategory(data) {
  const dup = await queryOne(
    'SELECT 1 AS x FROM dbo.MedicineCategory WHERE CategoryId = @id OR CategoryName = @name',
    { id: data.categoryId, name: data.categoryName }
  )
  if (dup) {
    throw new AppError('Mã hoặc tên nhóm thuốc đã tồn tại', 409, 'CATEGORY_EXISTS')
  }

  await query(
    `INSERT INTO dbo.MedicineCategory (CategoryId, CategoryName, Description)
     VALUES (@id, @name, @desc)`,
    { id: data.categoryId, name: data.categoryName, desc: data.description || null }
  )
  const row = await queryOne(
    'SELECT CategoryId, CategoryName, Description FROM dbo.MedicineCategory WHERE CategoryId = @id',
    { id: data.categoryId }
  )
  return mapCategory(row)
}

export async function updateCategory(id, data) {
  const cat = await queryOne(
    'SELECT 1 AS x FROM dbo.MedicineCategory WHERE CategoryId = @id',
    { id }
  )
  if (!cat) {
    throw new AppError('Không tìm thấy nhóm thuốc', 404, 'CATEGORY_NOT_FOUND')
  }

  if (data.categoryName) {
    const dup = await queryOne(
      'SELECT 1 AS x FROM dbo.MedicineCategory WHERE CategoryName = @name AND CategoryId <> @id',
      { name: data.categoryName, id }
    )
    if (dup) {
      throw new AppError('Tên nhóm thuốc đã tồn tại', 409, 'CATEGORY_NAME_EXISTS')
    }
  }

  const sets = []
  const params = { id }
  if (data.categoryName !== undefined) { sets.push('CategoryName = @name'); params.name = data.categoryName }
  if (data.description !== undefined)  { sets.push('Description = @desc');  params.desc = data.description }

  if (sets.length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }

  await query(
    `UPDATE dbo.MedicineCategory SET ${sets.join(', ')} WHERE CategoryId = @id`,
    params
  )
  const row = await queryOne(
    'SELECT CategoryId, CategoryName, Description FROM dbo.MedicineCategory WHERE CategoryId = @id',
    { id }
  )
  return mapCategory(row)
}

export async function deleteCategory(id) {
  const cat = await queryOne(
    'SELECT 1 AS x FROM dbo.MedicineCategory WHERE CategoryId = @id',
    { id }
  )
  if (!cat) {
    throw new AppError('Không tìm thấy nhóm thuốc', 404, 'CATEGORY_NOT_FOUND')
  }

  // kiem tra co thuoc nao dang dung khong (kiem ca thuoc IsActive = 0 vi van con FK)
  const usedBy = await queryOne(
    'SELECT COUNT(*) AS cnt FROM dbo.Medicine WHERE CategoryId = @id',
    { id }
  )
  if (usedBy.cnt > 0) {
    throw new AppError(
      `Không thể xóa, nhóm này đang được sử dụng bởi ${usedBy.cnt} thuốc`,
      409,
      'CATEGORY_IN_USE'
    )
  }

  await query('DELETE FROM dbo.MedicineCategory WHERE CategoryId = @id', { id })
}

// ============================================================
// Supplier (nha cung cap)
// ============================================================
export async function getAllSuppliers() {
  const rows = await query(
    'SELECT SupplierId, SupplierName, Email, Address, IsActive FROM dbo.Supplier ORDER BY SupplierName'
  )
  return rows.map(mapSupplier)
}

export async function createSupplier(data) {
  const dup = await queryOne(
    'SELECT 1 AS x FROM dbo.Supplier WHERE SupplierId = @id OR SupplierName = @name',
    { id: data.supplierId, name: data.supplierName }
  )
  if (dup) {
    throw new AppError('Mã hoặc tên nhà cung cấp đã tồn tại', 409, 'SUPPLIER_EXISTS')
  }

  await query(
    `INSERT INTO dbo.Supplier (SupplierId, SupplierName, Email, Address, IsActive)
     VALUES (@id, @name, @email, @addr, 1)`,
    {
      id: data.supplierId,
      name: data.supplierName,
      email: data.email || null,
      addr: data.address || null,
    }
  )
  const row = await queryOne(
    'SELECT SupplierId, SupplierName, Email, Address, IsActive FROM dbo.Supplier WHERE SupplierId = @id',
    { id: data.supplierId }
  )
  return mapSupplier(row)
}

export async function updateSupplier(id, data) {
  const sup = await queryOne('SELECT 1 AS x FROM dbo.Supplier WHERE SupplierId = @id', { id })
  if (!sup) {
    throw new AppError('Không tìm thấy nhà cung cấp', 404, 'SUPPLIER_NOT_FOUND')
  }

  if (data.supplierName) {
    const dup = await queryOne(
      'SELECT 1 AS x FROM dbo.Supplier WHERE SupplierName = @name AND SupplierId <> @id',
      { name: data.supplierName, id }
    )
    if (dup) {
      throw new AppError('Tên nhà cung cấp đã tồn tại', 409, 'SUPPLIER_NAME_EXISTS')
    }
  }

  const sets = []
  const params = { id }
  if (data.supplierName !== undefined) { sets.push('SupplierName = @name'); params.name = data.supplierName }
  if (data.email !== undefined)        { sets.push('Email = @email');       params.email = data.email }
  if (data.address !== undefined)      { sets.push('Address = @addr');      params.addr = data.address }
  if (data.isActive !== undefined)     { sets.push('IsActive = @active');   params.active = data.isActive ? 1 : 0 }

  if (sets.length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }

  await query(
    `UPDATE dbo.Supplier SET ${sets.join(', ')} WHERE SupplierId = @id`,
    params
  )
  const row = await queryOne(
    'SELECT SupplierId, SupplierName, Email, Address, IsActive FROM dbo.Supplier WHERE SupplierId = @id',
    { id }
  )
  return mapSupplier(row)
}

export async function deactivateSupplier(id) {
  const sup = await queryOne(
    'SELECT IsActive FROM dbo.Supplier WHERE SupplierId = @id',
    { id }
  )
  if (!sup) {
    throw new AppError('Không tìm thấy nhà cung cấp', 404, 'SUPPLIER_NOT_FOUND')
  }
  if (!sup.IsActive) {
    throw new AppError('Nhà cung cấp này đã bị vô hiệu hóa', 400, 'ALREADY_INACTIVE')
  }

  await query('UPDATE dbo.Supplier SET IsActive = 0 WHERE SupplierId = @id', { id })
}

// ============================================================
// Manufacturer (hang san xuat)
// ============================================================
export async function getAllManufacturers() {
  const rows = await query(
    'SELECT ManufacturerId, ManufacturerName, Country FROM dbo.Manufacturer ORDER BY ManufacturerName'
  )
  return rows.map(mapManufacturer)
}

export async function createManufacturer(data) {
  const dup = await queryOne(
    'SELECT 1 AS x FROM dbo.Manufacturer WHERE ManufacturerId = @id OR ManufacturerName = @name',
    { id: data.manufacturerId, name: data.manufacturerName }
  )
  if (dup) {
    throw new AppError('Mã hoặc tên hãng sản xuất đã tồn tại', 409, 'MANUFACTURER_EXISTS')
  }

  await query(
    `INSERT INTO dbo.Manufacturer (ManufacturerId, ManufacturerName, Country)
     VALUES (@id, @name, @country)`,
    {
      id: data.manufacturerId,
      name: data.manufacturerName,
      country: data.country || null,
    }
  )
  const row = await queryOne(
    'SELECT ManufacturerId, ManufacturerName, Country FROM dbo.Manufacturer WHERE ManufacturerId = @id',
    { id: data.manufacturerId }
  )
  return mapManufacturer(row)
}

export async function updateManufacturer(id, data) {
  const m = await queryOne(
    'SELECT 1 AS x FROM dbo.Manufacturer WHERE ManufacturerId = @id',
    { id }
  )
  if (!m) {
    throw new AppError('Không tìm thấy hãng sản xuất', 404, 'MANUFACTURER_NOT_FOUND')
  }

  if (data.manufacturerName) {
    const dup = await queryOne(
      'SELECT 1 AS x FROM dbo.Manufacturer WHERE ManufacturerName = @name AND ManufacturerId <> @id',
      { name: data.manufacturerName, id }
    )
    if (dup) {
      throw new AppError('Tên hãng sản xuất đã tồn tại', 409, 'MANUFACTURER_NAME_EXISTS')
    }
  }

  const sets = []
  const params = { id }
  if (data.manufacturerName !== undefined) { sets.push('ManufacturerName = @name'); params.name = data.manufacturerName }
  if (data.country !== undefined)          { sets.push('Country = @country');        params.country = data.country }

  if (sets.length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }

  await query(
    `UPDATE dbo.Manufacturer SET ${sets.join(', ')} WHERE ManufacturerId = @id`,
    params
  )
  const row = await queryOne(
    'SELECT ManufacturerId, ManufacturerName, Country FROM dbo.Manufacturer WHERE ManufacturerId = @id',
    { id }
  )
  return mapManufacturer(row)
}
