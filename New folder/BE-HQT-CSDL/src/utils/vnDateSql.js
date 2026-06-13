/** InvoiceDate và các datetime nghiệp vụ lưu UTC (SYSUTCDATETIME). Offset VN = UTC+7. */
export const VN_OFFSET_HOURS = 7

/** CAST sang DATE theo lịch Việt Nam — dùng trong WHERE / GROUP BY. */
export function vnDateSql(column) {
  return `CAST(DATEADD(HOUR, ${VN_OFFSET_HOURS}, ${column}) AS DATE)`
}

/** Nhóm theo tháng (yyyy-MM) theo lịch Việt Nam. */
export function vnMonthSql(column) {
  return `FORMAT(DATEADD(HOUR, ${VN_OFFSET_HOURS}, ${column}), 'yyyy-MM')`
}

/** Chuỗi yyyy-MM-dd theo lịch Việt Nam — dùng SELECT / GROUP BY theo ngày. */
export function vnDayKeySql(column) {
  return `CONVERT(VARCHAR(10), ${vnDateSql(column)}, 23)`
}
