import { z } from 'zod'
import * as masterDataService from '../services/masterData.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

// regex cho ma viet hoa khong dau (VD: VIEN, NHOM_GIAM_DAU)
const codeRegex = /^[A-Z][A-Z_]*$/

// ====== Zod schemas ======
const unitSchema = z.object({
  unitId: z.string().min(1).max(20).regex(codeRegex, 'Mã đơn vị viết hoa, không dấu, dùng gạch dưới'),
  unitName: z.string().min(1).max(50),
})

const categoryCreateSchema = z.object({
  categoryId: z.string().min(1).max(30).regex(codeRegex, 'Mã nhóm viết hoa, không dấu, dùng gạch dưới'),
  categoryName: z.string().min(2).max(150),
  description: z.string().max(500).nullable().optional(),
})

const categoryUpdateSchema = z.object({
  categoryName: z.string().min(2).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
})

const supplierCreateSchema = z.object({
  supplierId: z.string().min(1).max(20),
  supplierName: z.string().min(2).max(150),
  email: z.string().email('Email không hợp lệ').nullable().optional(),
  address: z.string().max(255).nullable().optional(),
})

const supplierUpdateSchema = z.object({
  supplierName: z.string().min(2).max(150).optional(),
  email: z.string().email('Email không hợp lệ').nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  isActive: z.boolean().optional(),
})

const manufacturerCreateSchema = z.object({
  manufacturerId: z.string().min(1).max(20),
  manufacturerName: z.string().min(2).max(150),
  country: z.string().max(100).nullable().optional(),
})

const manufacturerUpdateSchema = z.object({
  manufacturerName: z.string().min(2).max(150).optional(),
  country: z.string().max(100).nullable().optional(),
})

function validate(schema, body) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

// ====== Unit ======
export const getUnits = catchAsync(async (req, res) => {
  const data = await masterDataService.getAllUnits()
  res.json({ success: true, data })
})

export const createUnit = catchAsync(async (req, res) => {
  const data = validate(unitSchema, req.body)
  const unit = await masterDataService.createUnit(data)
  res.status(201).json({ success: true, data: unit })
})

// ====== Category ======
export const getCategories = catchAsync(async (req, res) => {
  const data = await masterDataService.getAllCategories()
  res.json({ success: true, data })
})

export const createCategory = catchAsync(async (req, res) => {
  const data = validate(categoryCreateSchema, req.body)
  const cat = await masterDataService.createCategory(data)
  res.status(201).json({ success: true, data: cat })
})

export const updateCategory = catchAsync(async (req, res) => {
  const data = validate(categoryUpdateSchema, req.body)
  const cat = await masterDataService.updateCategory(req.params.id, data)
  res.json({ success: true, data: cat })
})

export const deleteCategory = catchAsync(async (req, res) => {
  await masterDataService.deleteCategory(req.params.id)
  res.json({ success: true, message: 'Đã xóa nhóm thuốc' })
})

// ====== Supplier ======
export const getSuppliers = catchAsync(async (req, res) => {
  const data = await masterDataService.getAllSuppliers()
  res.json({ success: true, data })
})

export const createSupplier = catchAsync(async (req, res) => {
  const data = validate(supplierCreateSchema, req.body)
  const sup = await masterDataService.createSupplier(data)
  res.status(201).json({ success: true, data: sup })
})

export const updateSupplier = catchAsync(async (req, res) => {
  const data = validate(supplierUpdateSchema, req.body)
  const sup = await masterDataService.updateSupplier(req.params.id, data)
  res.json({ success: true, data: sup })
})

export const deactivateSupplier = catchAsync(async (req, res) => {
  await masterDataService.deactivateSupplier(req.params.id)
  res.json({ success: true, message: 'Đã vô hiệu hóa nhà cung cấp' })
})

// ====== Manufacturer ======
export const getManufacturers = catchAsync(async (req, res) => {
  const data = await masterDataService.getAllManufacturers()
  res.json({ success: true, data })
})

export const createManufacturer = catchAsync(async (req, res) => {
  const data = validate(manufacturerCreateSchema, req.body)
  const m = await masterDataService.createManufacturer(data)
  res.status(201).json({ success: true, data: m })
})

export const updateManufacturer = catchAsync(async (req, res) => {
  const data = validate(manufacturerUpdateSchema, req.body)
  const m = await masterDataService.updateManufacturer(req.params.id, data)
  res.json({ success: true, data: m })
})
