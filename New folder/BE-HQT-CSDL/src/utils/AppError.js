// loi nghiep vu - dung throw new AppError('msg', 400, 'CODE')
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
  }
}

export default AppError
