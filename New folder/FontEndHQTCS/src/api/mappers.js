const UNIT_NAME_TO_ID = {
  Viên: 'VIEN',
  Vỉ: 'VI',
  Hộp: 'HOP',
  Chai: 'CHAI',
  Gói: 'GOI',
  Lọ: 'LO',
  Tuýp: 'TUYP',
  Cái: 'CAI',
}

export function resolveUnitId(unitName, units = []) {
  const byName = units.find((u) => u.unitName === unitName)
  if (byName) return byName.unitId
  return UNIT_NAME_TO_ID[unitName] || 'VIEN'
}

export function resolveCategoryId(categoryName, categories = []) {
  if (!categoryName || categoryName === 'Chưa phân nhóm') return null
  const found = categories.find((c) => c.categoryName === categoryName)
  return found?.categoryId || null
}

export function mapMedicineToFe(med, batches = []) {
  const stock = Number(med.currentStock ?? 0)
  return {
    id: med.medicineId,
    name: med.medicineName,
    unit: med.unit?.unitName || 'Viên',
    type: med.productType || 'Thuốc không kê đơn',
    category: med.category?.categoryName || 'Chưa phân nhóm',
    listPrice: Number(med.listPrice || 0),
    salePrice: Number(med.listPrice || 0),
    price: Number(med.listPrice || 0),
    stock,
    minStock: Number(med.minStock || 0),
    status: !med.isActive ? 'INACTIVE' : stock <= 0 ? 'OUT_OF_STOCK' : 'ACTIVE',
    directSale: true,
    ingredient: med.ingredient || '',
    usage: med.usage || '',
    dosage: med.dosage || '',
    route: med.route || '',
    drugCode: med.drugRegistrationCode || '',
    supplierName: batches[0]?.supplier?.supplierName || med.manufacturer?.manufacturerName || '',
    manufacturerName: med.manufacturer?.manufacturerName || '',
    lastImportPrice: batches[0]?.importPrice || 0,
    avgSold7d: 0,
    avgSold30d: 0,
    alertStatus: Number(stock) <= Number(med.minStock || 0) ? 'LOW' : 'NONE',
    alertNote: '',
    alertBy: '',
    alertAt: '',
    batches: batches.map((b) => ({
      id: b.batchId,
      lotCode: b.batchId,
      qty: Number(b.currentQty || 0),
      expiryDate: b.expiryDate?.slice?.(0, 10) || b.expiryDate,
      importDate: b.importDate?.slice?.(0, 10) || b.importDate,
      importPrice: Number(b.importPrice || 0),
      supplierName: b.supplier?.supplierName || '',
      manufacturerName: b.manufacturer?.manufacturerName || '',
    })),
  }
}

export function mapMedicinePayloadToBe(payload, { units = [], categories = [] } = {}) {
  return {
    medicineId: payload.id,
    medicineName: payload.name,
    categoryId: resolveCategoryId(payload.category, categories),
    unitId: resolveUnitId(payload.unit || 'Viên', units),
    productType: payload.type || 'Thuốc không kê đơn',
    drugRegistrationCode: payload.drugCode || null,
    listPrice: Number(payload.listPrice || payload.salePrice || payload.price || 0),
    minStock: Number(payload.minStock || 0),
    ingredient: payload.ingredient || null,
    usage: payload.usage || null,
    dosage: payload.dosage || null,
    route: payload.route || null,
  }
}

export function mapInvoiceStatusToFe(status) {
  if (status === 'CANCELLED') return 'Đã hủy'
  if (status === 'RETURNED') return 'Đã trả hàng'
  return 'Hoàn thành'
}

export function mapInvoiceToOrder(invoice, lines = []) {
  const createdAt = invoice.invoiceDate || new Date().toISOString()
  return {
    id: invoice.invoiceId,
    customerName: invoice.customerNameSnapshot || 'Khách lẻ',
    phone: invoice.phoneSnapshot || '',
    date: new Date(createdAt).toLocaleString('vi-VN', { hour12: false }),
    createdAt,
    total: Number(invoice.totalAmount || 0),
    totalRefunded: Number(invoice.totalRefunded || 0),
    originalTotal: Number(
      invoice.originalTotal ?? Number(invoice.totalAmount || 0) + Number(invoice.totalRefunded || 0),
    ),
    status: mapInvoiceStatusToFe(invoice.status),
    createdBy: invoice.employeeName || 'Nhân viên',
    employeeId: invoice.employeeId || '',
    items: lines.map((line) => ({
      id: line.medicineId,
      lineId: line.lineId,
      name: line.medicineNameSnapshot,
      unit: line.unitNameSnapshot,
      qty: Number(line.quantity || 0),
      returnedQty: Number(line.returnedQty || 0),
      maxReturnable: Number(
        line.maxReturnable ?? Math.max(0, Number(line.quantity || 0) - Number(line.returnedQty || 0)),
      ),
      price: Number(line.unitPrice || 0),
      total: Number(line.lineTotal || 0),
    })),
  }
}

export function mapEmployeeToFe(emp) {
  return {
    id: emp.employeeId,
    fullName: emp.fullName,
    phone: emp.phone || '',
    username: emp.username,
    email: emp.email || '',
    role: emp.roleId === 'ADMIN' ? 'Admin' : 'Nhân viên bán hàng',
    isActive: !!emp.isActive,
    isRoot: !!emp.isRoot,
  }
}

export function mapCustomerToFe(customer) {
  return {
    id: customer.customerId,
    name: customer.customerName,
    phone: customer.phone || '',
    gender: customer.gender || '-',
    totalSpent: Number(customer.totalSpent || 0),
  }
}

export function mapMedicinePatchToBe(patch, { units = [], categories = [] } = {}) {
  const body = {}
  if (patch.name) body.medicineName = patch.name
  if (patch.type) body.productType = patch.type
  if (patch.listPrice != null || patch.salePrice != null || patch.price != null) {
    body.listPrice = Number(patch.listPrice ?? patch.salePrice ?? patch.price ?? 0)
  }
  if (patch.minStock != null) body.minStock = Number(patch.minStock)
  if (patch.unit) body.unitId = resolveUnitId(patch.unit, units)
  if (patch.category) body.categoryId = resolveCategoryId(patch.category, categories)
  if (patch.ingredient != null) body.ingredient = patch.ingredient
  if (patch.usage != null) body.usage = patch.usage
  if (patch.dosage != null) body.dosage = patch.dosage
  if (patch.route != null) body.route = patch.route
  if (patch.drugCode != null) body.drugRegistrationCode = patch.drugCode
  if (patch.status === 'INACTIVE') body.isActive = false
  if (patch.status === 'ACTIVE') body.isActive = true
  return body
}

export function mapRoleToBe(roleLabel) {
  return roleLabel === 'Admin' ? 'ADMIN' : 'STAFF'
}
