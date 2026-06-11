export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export function parsePagination(query = {}, defaultLimit = DEFAULT_PAGE_SIZE) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit),
  )

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  }
}

export function buildMeta(total, page, limit) {
  const safeTotal = Number(total) || 0
  return {
    total: safeTotal,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(safeTotal / limit) || 1),
  }
}
