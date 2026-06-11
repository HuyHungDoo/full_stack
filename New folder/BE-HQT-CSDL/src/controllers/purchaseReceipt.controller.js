import { z } from 'zod'
import * as purchaseReceiptService from '../services/purchaseReceipt.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

const lineSchema = z.object({
  medicineId: z.string().min(1, 'Mã thuốc không được trống'),
  importPrice: z.number().min(0, 'Giá nhập phải >= 0'),
  expiryDate: z.string().regex(dateRegex, 'Hạn sử dụng phải dạng YYYY-MM-DD'),
  quantity: z.number().int().min(1, 'Số lượng phải >= 1'),
  manufacturerId: z.string().max(20).nullable().optional(),
})

const createSchema = z.object({
  supplierId: z.string().min(1, 'Mã nhà cung cấp không được trống'),
  receiptDate: z.string().regex(dateRegex, 'Ngày nhập phải dạng YYYY-MM-DD').optional(),
  note: z.string().max(500).nullable().optional(),
  lines: z.array(lineSchema).min(1, 'Phiếu nhập phải có ít nhất 1 dòng'),
})

function validate(schema, body) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

export const getAll = catchAsync(async (req, res) => {
  const filters = {
    supplierId: req.query.supplierId,
    from: req.query.from,
    to: req.query.to,
    status: req.query.status,
  }
  const data = await purchaseReceiptService.getAll(filters)
  res.json({ success: true, data })
})

export const getById = catchAsync(async (req, res) => {
  const data = await purchaseReceiptService.getById(req.params.id)
  res.json({ success: true, data })
})

export const create = catchAsync(async (req, res) => {
  const data = validate(createSchema, req.body)
  const receipt = await purchaseReceiptService.create(data, req.user.employeeId)
  res.status(201).json({ success: true, data: receipt })
})

export const cancel = catchAsync(async (req, res) => {
  await purchaseReceiptService.cancel(req.params.id)
  res.json({ success: true, message: 'Đã hủy phiếu nhập' })
})
