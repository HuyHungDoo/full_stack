/** Định dạng ngày theo giờ local (VN) — tránh lệch ngày do UTC của toISOString(). */
export function formatLocalDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addLocalDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Khoảng N ngày kết thúc tại latestSalesDate (mốc datamart), không vượt quá ngày hiện tại. */
export function buildDatamartDateRange(latestSalesDate, days = 30) {
  const today = formatLocalDate()
  const end = latestSalesDate && latestSalesDate <= today ? latestSalesDate : today
  const endDate = new Date(`${end}T12:00:00`)
  const start = formatLocalDate(addLocalDays(endDate, -(days - 1)))
  return { start, end }
}
