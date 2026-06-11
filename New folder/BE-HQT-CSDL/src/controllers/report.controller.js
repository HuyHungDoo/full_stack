import { z } from 'zod'
import * as reportService from '../services/report.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

// regex YYYY-MM-DD
const dateRegex = /^\d{4}-\d{2}-\d{2}$/

const rangeSchema = z.object({
  from: z.string().regex(dateRegex, 'Ngày bắt đầu phải có dạng YYYY-MM-DD'),
  to: z.string().regex(dateRegex, 'Ngày kết thúc phải có dạng YYYY-MM-DD'),
})

const revenueSchema = rangeSchema.extend({
  groupBy: z.enum(['day', 'month']).optional().default('day'),
})

const topMedicinesSchema = rangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})

function validate(schema, payload) {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

function checkRange(from, to) {
  if (new Date(from) > new Date(to)) {
    throw new AppError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc', 400, 'INVALID_DATE_RANGE')
  }
}

// =====================================================================
export const getProfitLoss = catchAsync(async (req, res) => {
  const { from, to } = validate(rangeSchema, req.query)
  checkRange(from, to)
  const data = await reportService.getProfitLoss(from, to)
  res.json({ success: true, data })
})

export const getRevenue = catchAsync(async (req, res) => {
  const { from, to, groupBy } = validate(revenueSchema, req.query)
  checkRange(from, to)
  const data = await reportService.getRevenue(groupBy, from, to)
  res.json({ success: true, data })
})

export const getTopMedicines = catchAsync(async (req, res) => {
  const { from, to, limit } = validate(topMedicinesSchema, req.query)
  checkRange(from, to)
  const data = await reportService.getTopMedicines(from, to, limit)
  res.json({ success: true, data })
})

export const getInventoryValue = catchAsync(async (req, res) => {
  const data = await reportService.getInventoryValue()
  res.json({ success: true, data })
})

export const getDisposalCost = catchAsync(async (req, res) => {
  const { from, to } = validate(rangeSchema, req.query)
  checkRange(from, to)
  const data = await reportService.getDisposalCost(from, to)
  res.json({ success: true, data })
})
