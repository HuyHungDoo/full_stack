import { z } from 'zod'
import * as salesInvoiceService from '../services/salesInvoice.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'
import { buildMeta, parsePagination } from '../utils/pagination.js'

function mapStatusFilter(status) {
  if (!status || status === 'Tất cả') return undefined
  if (status === 'Đã hủy') return 'CANCELLED'
  if (status === 'Đã trả hàng') return 'RETURNED'
  if (status === 'Hoàn thành') return 'COMPLETED'
  return status
}

const itemSchema = z.object({
  medicineId: z.string().min(1),
  quantity: z.number().int().min(1),
  // batchId optional: neu co thi BE ban dung lo do (khong FIFO)
  batchId: z.string().min(1).optional().nullable(),
})

const createSchema = z.object({
  customerName: z.string().min(1).max(100).optional().nullable(),
  phone: z.string().regex(/^0\d{9}$/, 'Số điện thoại không hợp lệ').optional().nullable(),
  gender: z.enum(['Nam', 'Nữ', 'Khác']).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  items: z.array(itemSchema).min(1, 'Hóa đơn phải có ít nhất 1 sản phẩm'),
})

function validate(schema, body) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

export const getAll = catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query)
  const filters = {
    from: req.query.from,
    to: req.query.to,
    status: mapStatusFilter(req.query.status),
    customerId: req.query.customerId,
    employeeId: req.query.employeeId,
    search: req.query.search,
    offset,
    limit,
  }
  const result = await salesInvoiceService.getAll(filters, req.user)
  res.json({
    success: true,
    data: result.items,
    meta: buildMeta(result.total, page, limit),
  })
})

export const getById = catchAsync(async (req, res) => {
  const data = await salesInvoiceService.getById(req.params.id, req.user)
  res.json({ success: true, data })
})

export const create = catchAsync(async (req, res) => {
  const data = validate(createSchema, req.body)
  const invoice = await salesInvoiceService.create(data, req.user.employeeId)
  res.status(201).json({ success: true, data: invoice })
})

export const cancel = catchAsync(async (req, res) => {
  const data = await salesInvoiceService.cancel(req.params.id)
  res.json({ success: true, data })
})
