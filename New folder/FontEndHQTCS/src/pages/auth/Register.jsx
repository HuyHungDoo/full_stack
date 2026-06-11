import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { Link, useNavigate } from 'react-router-dom'
import { FaCheckCircle } from 'react-icons/fa'
import { register as registerAccount, getApiErrorMessage } from '../../api'

const schema = yup.object({
  fullName: yup
    .string()
    .required('Họ và tên không được để trống')
    .min(3, 'Họ và tên phải có ít nhất 3 ký tự'),
  username: yup
    .string()
    .required('Tên đăng nhập không được để trống')
    .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
    .matches(/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ gồm chữ, số và dấu gạch dưới'),
  email: yup
    .string()
    .required('Email không được để trống')
    .email('Email không đúng định dạng'),
  phone: yup
    .string()
    .required('Số điện thoại không được để trống')
    .matches(/^(0|\+84)[0-9]{9,10}$/, 'Số điện thoại không hợp lệ'),
  password: yup
    .string()
    .required('Mật khẩu không được để trống')
    .min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  confirmPassword: yup
    .string()
    .required('Vui lòng nhập lại mật khẩu')
    .oneOf([yup.ref('password')], 'Mật khẩu nhập lại không khớp'),
})

export default function Register() {
  const navigate = useNavigate()
  const [successOpen, setSuccessOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
  })

  const onSubmit = async (data) => {
    setSubmitError('')
    try {
      const phone = data.phone.trim().replace(/^\+84/, '0')
      await registerAccount({
        fullName: data.fullName.trim(),
        username: data.username.trim(),
        email: data.email.trim(),
        phone,
        password: data.password,
        confirmPassword: data.confirmPassword,
      })
      setSuccessOpen(true)
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, 'Không thể đăng ký tài khoản'))
    }
  }

  const handleSuccessClose = () => {
    setSuccessOpen(false)
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-800">Đăng ký tài khoản</h1>
          <p className="mt-2 text-sm text-slate-500">
            Tạo tài khoản nhân viên bán hàng để sử dụng hệ thống
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Họ và tên
            </label>
            <input
              type="text"
              placeholder="Nhập họ và tên"
              {...register('fullName')}
              className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
                errors.fullName
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-500'
              }`}
            />
            {errors.fullName && (
              <p className="mt-1 text-sm text-red-500">{errors.fullName.message}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Tên đăng nhập
            </label>
            <input
              type="text"
              placeholder="Nhập tên đăng nhập"
              autoComplete="username"
              {...register('username')}
              className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
                errors.username
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-500'
              }`}
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-500">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              placeholder="Nhập email"
              {...register('email')}
              className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
                errors.email
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-500'
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Số điện thoại
            </label>
            <input
              type="text"
              placeholder="Nhập số điện thoại"
              {...register('phone')}
              className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
                errors.phone
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-500'
              }`}
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-500">{errors.phone.message}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Mật khẩu
            </label>
            <input
              type="password"
              placeholder="Nhập mật khẩu"
              {...register('password')}
              className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
                errors.password
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-500'
              }`}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Nhập lại mật khẩu
            </label>
            <input
              type="password"
              placeholder="Nhập lại mật khẩu"
              {...register('confirmPassword')}
              className={`w-full rounded-xl border px-4 py-3 outline-none transition ${
                errors.confirmPassword
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-slate-300 focus:border-blue-500'
              }`}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-500">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-70"
          >
            {isSubmitting ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>

      {successOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={handleSuccessClose}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-[24px] bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-success-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <FaCheckCircle size={32} />
              </div>
              <h2 id="register-success-title" className="text-xl font-bold text-slate-900">
                Đăng ký thành công
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Tài khoản của bạn đã được tạo với vai trò Nhân viên bán hàng.
                Vui lòng đăng nhập để sử dụng hệ thống.
              </p>
            </div>

            <div className="bg-slate-50 p-4">
              <button
                type="button"
                onClick={handleSuccessClose}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Đi tới trang đăng nhập
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
