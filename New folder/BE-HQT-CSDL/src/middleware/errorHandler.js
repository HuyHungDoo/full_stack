import AppError from '../utils/AppError.js'

// ============================================================
// 404 - khong tim thay route
// ============================================================
export const notFoundHandler = (req, res, next) => {
  next(new AppError(
    'Khong tim thay ' + req.method + ' ' + req.originalUrl,
    404,
    'NOT_FOUND'
  ))
}

// ============================================================
// transform cac loi tu thu vien ngoai (mssql, jwt, zod)
// ve dang AppError de tra response thong nhat
// ============================================================

// loi tu mssql driver - co the la sql.RequestError, sql.ConnectionError...
function handleSQLError(err) {
  // unique constraint violation
  if (err.number === 2627 || err.number === 2601) {
    return new AppError('Dữ liệu đã tồn tại trong hệ thống', 409, 'DUPLICATE_ENTRY')
  }
  // foreign key constraint
  if (err.number === 547) {
    return new AppError('Không thể thao tác do dữ liệu đang được tham chiếu', 409, 'FK_CONSTRAINT')
  }
  // string truncation
  if (err.number === 8152 || err.number === 2628) {
    return new AppError('Dữ liệu vượt quá độ dài cho phép', 400, 'DATA_TOO_LONG')
  }
  // check constraint
  if (err.number === 547 || err.number === 2628) {
    return new AppError('Dữ liệu không thỏa ràng buộc', 400, 'CHECK_CONSTRAINT')
  }
  // loi sql khac - generic
  return new AppError('Lỗi cơ sở dữ liệu', 500, 'DB_ERROR')
}

function handleJWTError() {
  return new AppError('Token không hợp lệ, vui lòng đăng nhập lại', 401, 'INVALID_TOKEN')
}

function handleJWTExpired() {
  return new AppError('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại', 401, 'TOKEN_EXPIRED')
}

function handleZodError(err) {
  // Zod v3 dung err.errors, Zod v4 dung err.issues
  const issues = err.issues || err.errors || []
  const first = issues[0]
  const msg = first?.message || 'Dữ liệu không hợp lệ'
  return new AppError(msg, 400, 'VALIDATION_ERROR')
}

// kiem tra co phai loi tu mssql khong
function isSQLError(err) {
  // co the la sql.RequestError, sql.ConnectionError, sql.TransactionError
  if (err.code === 'EREQUEST' || err.code === 'ECONNCLOSED' || err.code === 'ENOTOPEN') return true
  if (typeof err.number === 'number' && err.originalError) return true
  if (err.name === 'RequestError' || err.name === 'ConnectionError' || err.name === 'TransactionError') return true
  return false
}

// ============================================================
// global error handler
// ============================================================
export const errorHandler = (err, req, res, next) => {
  let error = err

  // chuyen doi loi tu thu vien ngoai
  if (!error.isOperational) {
    if (isSQLError(error)) {
      error = handleSQLError(error)
    } else if (error.name === 'JsonWebTokenError') {
      error = handleJWTError()
    } else if (error.name === 'TokenExpiredError') {
      error = handleJWTExpired()
    } else if (error.name === 'ZodError') {
      error = handleZodError(error)
    }
  }

  const statusCode = error.statusCode || 500
  const code = error.code || 'INTERNAL_ERROR'
  const isOperational = error.isOperational === true

  // log day du khi la loi khong luong truoc
  if (!isOperational) {
    console.error('---- UNEXPECTED ERROR ----')
    console.error('Path:', req.method, req.originalUrl)
    console.error(err)
    console.error('--------------------------')
  }

  // build response
  const response = {
    success: false,
    message: isOperational
      ? error.message
      : (process.env.NODE_ENV === 'development'
          ? error.message
          : 'Đã xảy ra lỗi không mong muốn, vui lòng thử lại sau'),
    code,
  }

  // chi tra stack khi development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack
  }

  res.status(statusCode).json(response)
}
