import { z } from 'zod'
import * as medicineService from '../services/medicine.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'
import { buildMeta, parsePagination } from '../utils/pagination.js'

const PRODUCT_TYPES = ['Thuốc kê đơn', 'Thuốc không kê đơn', 'Vật tư y tế']

const createSchema = z.object({
  medicineId: z.string().min(1).max(30),
  medicineName: z.string().min(2).max(200),
  categoryId: z.string().max(30).nullable().optional(),
  unitId: z.string().min(1).max(20),
  manufacturerId: z.string().max(20).nullable().optional(),
  productType: z.enum(PRODUCT_TYPES, { message: 'Loại sản phẩm không hợp lệ' }),
  drugRegistrationCode: z.string().max(80).nullable().optional(),
  listPrice: z.number().min(0, 'Giá bán phải >= 0'),
  minStock: z.number().int().min(0, 'Tồn tối thiểu phải >= 0'),
  ingredient: z.string().nullable().optional(),
  usage: z.string().nullable().optional(),
  dosage: z.string().nullable().optional(),
  route: z.string().max(100).nullable().optional(),
})

const updateSchema = z.object({
  medicineName: z.string().min(2).max(200).optional(),
  categoryId: z.string().max(30).nullable().optional(),
  unitId: z.string().min(1).max(20).optional(),
  manufacturerId: z.string().max(20).nullable().optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  drugRegistrationCode: z.string().max(80).nullable().optional(),
  listPrice: z.number().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  ingredient: z.string().nullable().optional(),
  usage: z.string().nullable().optional(),
  dosage: z.string().nullable().optional(),
  route: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
})

const updateBatchSchema = z.object({
  currentQty: z.number().int().min(0).optional(),
  importPrice: z.number().min(0).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Hạn sử dụng phải có dạng YYYY-MM-DD').optional(),
})

function validate(schema, body) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

// chuyen query string ?isActive=true -> boolean, ?isActive=false -> boolean false
function parseBoolean(value) {
  if (value === undefined) return undefined
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

function parseStockStatus(value) {
  if (!value || value === 'Tất cả') return undefined
  if (value === 'normal' || value === 'Bình thường') return 'normal'
  if (value === 'low' || value === 'Sắp hết/Hết hàng') return 'low'
  return undefined
}

export const getAll = catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query)
  const filters = {
    search: req.query.search,
    productType: req.query.productType,
    categoryId: req.query.categoryId,
    categoryName: req.query.categoryName,
    isActive: parseBoolean(req.query.isActive),
    stockStatus: parseStockStatus(req.query.stockStatus),
    sortBy: req.query.sortBy,
    sortOrder: req.query.sortOrder === 'desc' ? 'desc' : 'asc',
    offset,
    limit,
  }
  const result = await medicineService.getAll(filters)
  res.json({
    success: true,
    data: result.items,
    meta: buildMeta(result.total, page, limit),
  })
})

export const getStats = catchAsync(async (req, res) => {
  const data = await medicineService.getInventoryStats()
  res.json({ success: true, data })
})

export const getById = catchAsync(async (req, res) => {
  const data = await medicineService.getById(req.params.id)
  res.json({ success: true, data })
})

export const getBatches = catchAsync(async (req, res) => {
  const data = await medicineService.getBatchesByMedicineId(req.params.id)
  res.json({ success: true, data })
})

export const getStock = catchAsync(async (req, res) => {
  const data = await medicineService.getStockByMedicineId(req.params.id)
  res.json({ success: true, data })
})

export const create = catchAsync(async (req, res) => {
  const data = validate(createSchema, req.body)
  const medicine = await medicineService.create(data)
  res.status(201).json({ success: true, data: medicine })
})

export const update = catchAsync(async (req, res) => {
  const data = validate(updateSchema, req.body)
  const medicine = await medicineService.update(req.params.id, data)
  res.json({ success: true, data: medicine })
})

export const deactivate = catchAsync(async (req, res) => {
  await medicineService.deactivate(req.params.id)
  res.json({ success: true, message: 'Đã ngừng kinh doanh thuốc' })
})

export const updateBatch = catchAsync(async (req, res) => {
  const data = validate(updateBatchSchema, req.body)
  if (Object.keys(data).length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }
  const batch = await medicineService.updateBatch(req.params.id, req.params.batchId, data)
  res.json({ success: true, data: batch })
})
