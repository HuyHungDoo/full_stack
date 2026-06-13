import { z } from 'zod'
import * as customerService from '../services/customer.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'
import { buildMeta, parsePagination } from '../utils/pagination.js'

const lookupSchema = z.object({
  phone: z.string().regex(/^0\d{9}$/, 'Số điện thoại không hợp lệ'),
})

const updateSchema = z.object({
  customerName: z.string().min(1).max(100).optional(),
  gender: z.enum(['Nam', 'Nữ', 'Khác']).nullable().optional(),
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
  const result = await customerService.getAll({
    search: req.query.search,
    offset,
    limit,
  })
  res.json({
    success: true,
    data: result.items,
    meta: buildMeta(result.total, page, limit),
  })
})

export const getById = catchAsync(async (req, res) => {
  const data = await customerService.getById(req.params.id)
  res.json({ success: true, data })
})

export const getInvoices = catchAsync(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query)
  const result = await customerService.getInvoices(req.params.id, { offset, limit })
  res.json({
    success: true,
    data: result.items,
    meta: buildMeta(result.total, page, limit),
  })
})

export const lookup = catchAsync(async (req, res) => {
  const { phone } = validate(lookupSchema, req.body)
  const data = await customerService.lookup(phone)
  res.json({ success: true, data })
})

export const update = catchAsync(async (req, res) => {
  const data = validate(updateSchema, req.body)
  const customer = await customerService.update(req.params.id, data)
  res.json({ success: true, data: customer })
})
