import jwt from 'jsonwebtoken'
import AppError from '../utils/AppError.js'

// kiem tra JWT, gan req.user
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Chưa đăng nhập', 401, 'UNAUTHORIZED'))
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại', 401, 'TOKEN_EXPIRED'))
    }
    return next(new AppError('Token không hợp lệ', 401, 'INVALID_TOKEN'))
  }
}
