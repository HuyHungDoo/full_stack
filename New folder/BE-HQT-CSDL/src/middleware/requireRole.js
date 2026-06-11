import AppError from '../utils/AppError.js'

// kiem tra quyen: requireRole('ADMIN') hoac requireRole('ADMIN', 'STAFF')
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Chưa đăng nhập', 401, 'UNAUTHORIZED'))
    }
    if (!roles.includes(req.user.roleId)) {
      return next(new AppError('Không có quyền thực hiện thao tác này', 403, 'FORBIDDEN'))
    }
    next()
  }
}
