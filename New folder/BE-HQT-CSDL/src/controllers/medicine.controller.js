import { z } from 'zod'
import * as medicineService from '../services/medicine.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

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

export const getAll = catchAsync(async (req, res) => {
  const filters = {
    search: req.query.search,
    productType: req.query.productType,
    categoryId: req.query.categoryId,
    isActive: parseBoolean(req.query.isActive),
  }
  const data = await medicineService.getAll(filters)
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
