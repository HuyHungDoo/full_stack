import { z } from 'zod'
import * as salesReturnService from '../services/salesReturn.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

const lineSchema = z.object({
  invoiceLineId: z.string().min(1),
  quantity: z.number().int().min(1),
  refundAmount: z.number().min(0),
  reason: z.string().max(300).optional().nullable(),
})

const createSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1, 'Phiếu trả phải có ít nhất 1 dòng'),
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
    invoiceId: req.query.invoiceId,
    from: req.query.from,
    to: req.query.to,
  }
  const data = await salesReturnService.getAll(filters)
  res.json({ success: true, data })
})

export const getById = catchAsync(async (req, res) => {
  const data = await salesReturnService.getById(req.params.id)
  res.json({ success: true, data })
})

export const create = catchAsync(async (req, res) => {
  const data = validate(createSchema, req.body)
  const ret = await salesReturnService.create(data, req.user.employeeId)
  res.status(201).json({ success: true, data: ret })
})
