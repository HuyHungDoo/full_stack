import axios from 'axios'

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('accessToken')
      localStorage.removeItem('user')
      const path = window.location.pathname
      if (path !== '/login' && path !== '/register') {
        window.location.replace('/login')
      }
    }
    return Promise.reject(error)
  },
)

export function getApiErrorMessage(error, fallback = 'Có lỗi xảy ra. Vui lòng thử lại.') {
  return (
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message ||
    fallback
  )
}

export default api
