import api from './client'

function normalizeRole(role) {
  const text = String(role || '').toUpperCase()
  if (text.includes('ADMIN')) return 'admin'
  return 'staff'
}

function normalizeUser(rawUser = {}, loginName = '') {
  const role = normalizeRole(
    rawUser.roleId || rawUser.role || rawUser.roleName || rawUser.authority,
  )

  return {
    ...rawUser,
    email: rawUser.email || '',
    username: rawUser.username || rawUser.userName || loginName,
    role,
    roleId: rawUser.roleId || rawUser.role,
    name:
      rawUser.name ||
      rawUser.fullName ||
      rawUser.username ||
      (role === 'admin' ? 'Quản trị viên' : 'Nhân viên'),
    phone: rawUser.phone || '',
    employeeId: rawUser.employeeId || rawUser.employeeCode || rawUser.id,
    accountId: rawUser.accountId || rawUser.id,
    isRoot: Boolean(rawUser.isRoot || rawUser.root || rawUser.accountId === 1),
  }
}

function extractAuthPayload(response, loginName = '') {
  const body = response.data || {}
  const data = body.data || body
  const token =
    data.accessToken ||
    data.token ||
    data.jwt ||
    body.accessToken ||
    body.token ||
    body.jwt
  const rawUser = data.user || data.account || data.employee || body.user || data

  return {
    token,
    user: normalizeUser(rawUser, loginName),
  }
}

function normalizePhone(input) {
  if (!input) return undefined
  const s = String(input).trim().replace(/\s/g, '')
  if (s.startsWith('+84')) return `0${s.slice(3)}`
  if (s.startsWith('84') && s.length >= 11) return `0${s.slice(2)}`
  return s
}

export async function register(data) {
  const response = await api.post('/auth/register', {
    fullName: data.fullName,
    email: data.email,
    username: data.username,
    password: data.password,
    confirmPassword: data.confirmPassword || data.password,
    phone: normalizePhone(data.phone),
  })
  return response.data
}

export async function login(credentials) {
  const response = await api.post('/auth/login', {
    username: credentials.username,
    password: credentials.password,
  })
  return extractAuthPayload(response, credentials.username)
}

export async function updateMe(data) {
  const response = await api.patch('/auth/me', {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone || '',
  })
  const raw = response.data?.data || response.data
  return normalizeUser(raw)
}

export async function getMe() {
  const response = await api.get('/auth/me')
  const raw = response.data?.data || response.data
  return normalizeUser(raw)
}
