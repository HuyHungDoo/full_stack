import bcrypt from 'bcryptjs'
import { query, queryOne } from '../config/db.js'
import AppError from '../utils/AppError.js'

// chuyen row trong DB (PascalCase) -> object cua API (camelCase), bo PasswordHash
function mapEmployee(row) {
  if (!row) return null
  return {
    employeeId: row.EmployeeId,
    fullName: row.FullName,
    phone: row.Phone,
    email: row.Email,
    username: row.Username,
    roleId: row.RoleId,
    roleName: row.RoleName,
    isActive: !!row.IsActive,
    isRoot: !!row.IsRoot,
    hireDate: row.HireDate,
    createdAt: row.CreatedAt,
  }
}

// sinh EmployeeId moi: NV001, NV002, NV003,...
function genNextEmployeeId(maxId) {
  if (!maxId) return 'NV001'
  const num = parseInt(maxId.slice(2), 10) + 1
  return 'NV' + String(num).padStart(3, '0')
}

const SELECT_EMPLOYEE = `
  SELECT e.EmployeeId, e.FullName, e.Phone, e.Email, e.Username,
         e.RoleId, r.RoleName, e.IsActive, e.IsRoot, e.HireDate, e.CreatedAt
  FROM dbo.Employee e
  JOIN dbo.Role r ON r.RoleId = e.RoleId
`

export async function getAll() {
  const rows = await query(SELECT_EMPLOYEE + ' ORDER BY e.CreatedAt DESC')
  return rows.map(mapEmployee)
}

export async function getById(employeeId) {
  const row = await queryOne(SELECT_EMPLOYEE + ' WHERE e.EmployeeId = @id', { id: employeeId })
  if (!row) {
    throw new AppError('Không tìm thấy nhân viên', 404, 'EMPLOYEE_NOT_FOUND')
  }
  return mapEmployee(row)
}

export async function create(data) {
  // check trung username
  const existsUsername = await queryOne(
    'SELECT 1 AS x FROM dbo.Employee WHERE Username = @u',
    { u: data.username }
  )
  if (existsUsername) {
    throw new AppError('Tên đăng nhập đã tồn tại', 409, 'USERNAME_EXISTS')
  }

  // check trung email
  const existsEmail = await queryOne(
    'SELECT 1 AS x FROM dbo.Employee WHERE Email = @e',
    { e: data.email }
  )
  if (existsEmail) {
    throw new AppError('Email đã được sử dụng', 409, 'EMAIL_EXISTS')
  }

  // sinh ID moi
  const maxRow = await queryOne('SELECT MAX(EmployeeId) AS MaxId FROM dbo.Employee')
  const newId = genNextEmployeeId(maxRow?.MaxId)

  const passwordHash = await bcrypt.hash(data.password, 10)

  await query(
    `INSERT INTO dbo.Employee
       (EmployeeId, FullName, Phone, Email, Username, PasswordHash, RoleId, IsActive, IsRoot, HireDate)
     VALUES
       (@id, @fullName, @phone, @email, @username, @passwordHash, @roleId, 1, 0, @hireDate)`,
    {
      id: newId,
      fullName: data.fullName,
      phone: data.phone || null,
      email: data.email,
      username: data.username,
      passwordHash,
      roleId: data.roleId,
      hireDate: data.hireDate || null,
    }
  )

  return await getById(newId)
}

/** Đăng ký tự do — luôn tạo vai trò STAFF, không phải ADMIN */
export async function registerSelf(data) {
  return create({
    fullName: data.fullName,
    phone: data.phone || null,
    email: data.email,
    username: data.username,
    password: data.password,
    roleId: 'STAFF',
  })
}

export async function update(employeeId, data) {
  const current = await queryOne('SELECT IsRoot FROM dbo.Employee WHERE EmployeeId = @id', { id: employeeId })
  if (!current) {
    throw new AppError('Không tìm thấy nhân viên', 404, 'EMPLOYEE_NOT_FOUND')
  }

  // root user khong cho doi role
  if (current.IsRoot && data.roleId && data.roleId !== 'ADMIN') {
    throw new AppError('Không thể đổi vai trò của tài khoản root', 400, 'CANNOT_CHANGE_ROOT_ROLE')
  }

  // check email trung neu doi email
  if (data.email) {
    const dup = await queryOne(
      'SELECT 1 AS x FROM dbo.Employee WHERE Email = @e AND EmployeeId <> @id',
      { e: data.email, id: employeeId }
    )
    if (dup) {
      throw new AppError('Email đã được sử dụng', 409, 'EMAIL_EXISTS')
    }
  }

  // build SET clause dong (chi update field nao co)
  const sets = []
  const params = { id: employeeId }
  if (data.fullName !== undefined) { sets.push('FullName = @fullName'); params.fullName = data.fullName }
  if (data.phone !== undefined)    { sets.push('Phone = @phone');       params.phone = data.phone }
  if (data.email !== undefined)    { sets.push('Email = @email');       params.email = data.email }
  if (data.roleId !== undefined)   { sets.push('RoleId = @roleId');     params.roleId = data.roleId }
  if (data.hireDate !== undefined) { sets.push('HireDate = @hireDate'); params.hireDate = data.hireDate }
  if (data.isActive !== undefined) { sets.push('IsActive = @isActive'); params.isActive = data.isActive ? 1 : 0 }

  if (sets.length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }

  await query(
    `UPDATE dbo.Employee SET ${sets.join(', ')} WHERE EmployeeId = @id`,
    params
  )

  return await getById(employeeId)
}

/** Nhân viên tự sửa hồ sơ — chỉ fullName, phone, email */
export async function updateProfile(employeeId, data) {
  const current = await queryOne(
    'SELECT EmployeeId FROM dbo.Employee WHERE EmployeeId = @id AND IsActive = 1',
    { id: employeeId }
  )
  if (!current) {
    throw new AppError('Không tìm thấy nhân viên', 404, 'EMPLOYEE_NOT_FOUND')
  }

  if (data.email) {
    const dup = await queryOne(
      'SELECT 1 AS x FROM dbo.Employee WHERE Email = @e AND EmployeeId <> @id',
      { e: data.email, id: employeeId }
    )
    if (dup) {
      throw new AppError('Email đã được sử dụng', 409, 'EMAIL_EXISTS')
    }
  }

  const sets = []
  const params = { id: employeeId }
  if (data.fullName !== undefined) { sets.push('FullName = @fullName'); params.fullName = data.fullName }
  if (data.phone !== undefined) { sets.push('Phone = @phone'); params.phone = data.phone }
  if (data.email !== undefined) { sets.push('Email = @email'); params.email = data.email }

  if (sets.length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', 400, 'NOTHING_TO_UPDATE')
  }

  await query(
    `UPDATE dbo.Employee SET ${sets.join(', ')} WHERE EmployeeId = @id`,
    params
  )

  return await getById(employeeId)
}

export async function changePassword(employeeId, data, requestUser) {
  const emp = await queryOne(
    'SELECT EmployeeId, PasswordHash FROM dbo.Employee WHERE EmployeeId = @id AND IsActive = 1',
    { id: employeeId }
  )
  if (!emp) {
    throw new AppError('Không tìm thấy nhân viên', 404, 'EMPLOYEE_NOT_FOUND')
  }

  const isSelf = requestUser.employeeId === employeeId
  const isAdmin = requestUser.roleId === 'ADMIN'

  // chi cho phep tu doi mat khau cua minh, hoac ADMIN doi cua nguoi khac
  if (!isSelf && !isAdmin) {
    throw new AppError('Không có quyền đổi mật khẩu nhân viên khác', 403, 'FORBIDDEN')
  }

  // neu tu doi -> phai cung cap mat khau hien tai
  if (isSelf) {
    if (!data.currentPassword) {
      throw new AppError('Vui lòng nhập mật khẩu hiện tại', 400, 'CURRENT_PASSWORD_REQUIRED')
    }
    const match = await bcrypt.compare(data.currentPassword, emp.PasswordHash)
    if (!match) {
      throw new AppError('Mật khẩu hiện tại không đúng', 400, 'WRONG_CURRENT_PASSWORD')
    }
  }

  const newHash = await bcrypt.hash(data.newPassword, 10)
  await query(
    'UPDATE dbo.Employee SET PasswordHash = @hash WHERE EmployeeId = @id',
    { hash: newHash, id: employeeId }
  )
}

export async function deactivate(employeeId, requestUser) {
  // khong cho tu vo hieu hoa chinh minh
  if (requestUser.employeeId === employeeId) {
    throw new AppError('Không thể vô hiệu hóa tài khoản đang đăng nhập', 400, 'CANNOT_DEACTIVATE_SELF')
  }

  const emp = await queryOne('SELECT IsRoot, IsActive FROM dbo.Employee WHERE EmployeeId = @id', { id: employeeId })
  if (!emp) {
    throw new AppError('Không tìm thấy nhân viên', 404, 'EMPLOYEE_NOT_FOUND')
  }
  if (emp.IsRoot) {
    throw new AppError('Không thể vô hiệu hóa tài khoản root', 400, 'CANNOT_DEACTIVATE_ROOT')
  }
  if (!emp.IsActive) {
    throw new AppError('Nhân viên này đã bị vô hiệu hóa', 400, 'ALREADY_INACTIVE')
  }

  await query('UPDATE dbo.Employee SET IsActive = 0 WHERE EmployeeId = @id', { id: employeeId })
}
