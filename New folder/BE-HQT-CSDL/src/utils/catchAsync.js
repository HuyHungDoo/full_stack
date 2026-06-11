// bao async controller, tu chuyen loi cho errorHandler -> khong can try/catch
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

export default catchAsync
