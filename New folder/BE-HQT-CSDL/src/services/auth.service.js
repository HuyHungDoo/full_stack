import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { queryOne } from '../config/db.js'
import AppError from '../utils/AppError.js'
import * as employeeService from './employee.service.js'

export async function login(username, password) {
  const emp = await queryOne(
    `SELECT EmployeeId, FullName, PasswordHash, RoleId, IsRoot
     FROM dbo.Employee
     WHERE Username = @username AND IsActive = 1`,
    { username }
  )

  if (!emp) {
    throw new AppError('Tên đăng nhập hoặc mật khẩu không đúng', 401, 'INVALID_CREDENTIALS')
  }

  const match = await bcrypt.compare(password, emp.PasswordHash)
  if (!match) {
    throw new AppError('Tên đăng nhập hoặc mật khẩu không đúng', 401, 'INVALID_CREDENTIALS')
  }

  const payload = {
    employeeId: emp.EmployeeId,
    fullName: emp.FullName,
    roleId: emp.RoleId,
    isRoot: !!emp.IsRoot,
  }

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  })

  return {
    token,
    employee: {
      employeeId: emp.EmployeeId,
      fullName: emp.FullName,
      role: emp.RoleId,
      isRoot: !!emp.IsRoot,
    },
  }
}

export async function register(data) {
  const employee = await employeeService.registerSelf(data)
  return {
    employeeId: employee.employeeId,
    fullName: employee.fullName,
    username: employee.username,
    role: employee.roleId,
  }
}

export async function getEmployeeInfo(employeeId) {
  return await queryOne(
    `SELECT e.EmployeeId, e.FullName, e.Phone, e.Email, e.Username,
            e.RoleId, r.RoleName, e.IsActive, e.IsRoot, e.HireDate, e.CreatedAt
     FROM dbo.Employee e
     JOIN dbo.Role r ON r.RoleId = e.RoleId
     WHERE e.EmployeeId = @id`,
    { id: employeeId }
  )
}
