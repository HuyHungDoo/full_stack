import { z } from 'zod'
import * as authService from '../services/auth.service.js'
import * as employeeService from '../services/employee.service.js'
import AppError from '../utils/AppError.js'
import catchAsync from '../utils/catchAsync.js'

const phoneRegex = /^0\d{9}$/

const loginSchema = z.object({
  username: z.string().min(1, 'Vui lòng nhập tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
})

const updateMeSchema = z.object({
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100).optional(),
  phone: z.string().regex(phoneRegex, 'Số điện thoại không hợp lệ').nullable().optional(),
  email: z.string().email('Email không hợp lệ').optional(),
})

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100),
    username: z
      .string()
      .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
      .max(50)
      .regex(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ chứa chữ, số, gạch dưới'),
    email: z.string().email('Email không hợp lệ'),
    phone: z.string().regex(phoneRegex, 'Số điện thoại phải 10 số, bắt đầu bằng 0').optional(),
    password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
    confirmPassword: z.string().min(6, 'Vui lòng nhập lại mật khẩu'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Mật khẩu nhập lại không khớp',
    path: ['confirmPassword'],
  })

function normalizePhone(input) {
  if (!input) return undefined
  const s = String(input).trim().replace(/\s/g, '')
  if (s.startsWith('+84')) return '0' + s.slice(3)
  if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2)
  return s
}

export const register = catchAsync(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }

  const { fullName, username, email, password, phone } = parsed.data
  const result = await authService.register({
    fullName,
    username,
    email,
    password,
    phone: normalizePhone(phone),
  })

  res.status(201).json({
    success: true,
    message: 'Đăng ký tài khoản thành công. Vui lòng đăng nhập.',
    data: result,
  })
})

export const login = catchAsync(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }

  const { username, password } = parsed.data
  const result = await authService.login(username, password)

  res.json({ success: true, data: result })
})

export const logout = (req, res) => {
  res.json({ success: true, message: 'Đăng xuất thành công' })
}

function mapMeResponse(emp) {
  return {
    employeeId: emp.employeeId ?? emp.EmployeeId,
    fullName: emp.fullName ?? emp.FullName,
    phone: emp.phone ?? emp.Phone,
    email: emp.email ?? emp.Email,
    username: emp.username ?? emp.Username,
    roleId: emp.roleId ?? emp.RoleId,
    roleName: emp.roleName ?? emp.RoleName,
    isActive: emp.isActive ?? !!emp.IsActive,
    isRoot: emp.isRoot ?? !!emp.IsRoot,
    hireDate: emp.hireDate ?? emp.HireDate,
    createdAt: emp.createdAt ?? emp.CreatedAt,
  }
}

export const getMe = catchAsync(async (req, res) => {
  const emp = await authService.getEmployeeInfo(req.user.employeeId)
  if (!emp) {
    throw new AppError('Không tìm thấy nhân viên', 404, 'EMPLOYEE_NOT_FOUND')
  }

  res.json({ success: true, data: mapMeResponse(emp) })
})

export const updateMe = catchAsync(async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
  }

  const employee = await employeeService.updateProfile(req.user.employeeId, parsed.data)
  res.json({ success: true, data: mapMeResponse(employee) })
})
