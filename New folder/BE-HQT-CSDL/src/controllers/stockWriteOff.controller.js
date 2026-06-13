import { z } from 'zod'
import * as stockWriteOffService from '../services/stockWriteOff.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

const lineSchema = z.object({
  batchId: z.string().min(1),
  quantity: z.number().int().min(1),
  reason: z.string().max(300).optional().nullable(),
})

const createSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1, 'Phiếu hủy phải có ít nhất 1 lô'),
})

function validate(schema, body) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

export const getExpiring = catchAsync(async (req, res) => {
  let daysAhead = parseInt(req.query.daysAhead, 10)
  if (!Number.isFinite(daysAhead) || daysAhead < 0) daysAhead = 30
  const data = await stockWriteOffService.getExpiring({ daysAhead })
  res.json({ success: true, data })
})

export const getAll = catchAsync(async (req, res) => {
  const filters = { from: req.query.from, to: req.query.to }
  const data = await stockWriteOffService.getAll(filters)
  res.json({ success: true, data })
})

export const getById = catchAsync(async (req, res) => {
  const data = await stockWriteOffService.getById(req.params.id)
  res.json({ success: true, data })
})

export const create = catchAsync(async (req, res) => {
  const data = validate(createSchema, req.body)
  const wo = await stockWriteOffService.create(data, req.user.employeeId)
  res.status(201).json({ success: true, data: wo })
})
