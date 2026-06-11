import { z } from 'zod'
import * as employeeService from '../services/employee.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const phoneRegex = /^0\d{9}$/

const createSchema = z.object({
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100),
  phone: z.string().regex(phoneRegex, 'Số điện thoại không hợp lệ').optional(),
  email: z.string().email('Email không hợp lệ'),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ chứa chữ, số, gạch dưới'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  roleId: z.enum(['ADMIN', 'STAFF'], { message: 'Vai trò không hợp lệ' }),
  hireDate: z.string().regex(dateRegex, 'Ngày vào làm phải dạng YYYY-MM-DD').optional(),
})

const updateSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().regex(phoneRegex, 'Số điện thoại không hợp lệ').nullable().optional(),
  email: z.string().email('Email không hợp lệ').optional(),
  roleId: z.enum(['ADMIN', 'STAFF']).optional(),
  hireDate: z.string().regex(dateRegex).nullable().optional(),
  isActive: z.boolean().optional(),
})

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự'),
})

function validate(schema, body) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }
  return parsed.data
}

export const getAll = catchAsync(async (req, res) => {
  const data = await employeeService.getAll()
  res.json({ success: true, data })
})

export const getById = catchAsync(async (req, res) => {
  const data = await employeeService.getById(req.params.id)
  res.json({ success: true, data })
})

export const create = catchAsync(async (req, res) => {
  const data = validate(createSchema, req.body)
  const employee = await employeeService.create(data)
  res.status(201).json({ success: true, data: employee })
})

export const update = catchAsync(async (req, res) => {
  const data = validate(updateSchema, req.body)
  const employee = await employeeService.update(req.params.id, data)
  res.json({ success: true, data: employee })
})

export const changePassword = catchAsync(async (req, res) => {
  const data = validate(passwordSchema, req.body)
  await employeeService.changePassword(req.params.id, data, req.user)
  res.json({ success: true, message: 'Đổi mật khẩu thành công' })
})

export const deactivate = catchAsync(async (req, res) => {
  await employeeService.deactivate(req.params.id, req.user)
  res.json({ success: true, message: 'Đã vô hiệu hóa nhân viên' })
})
