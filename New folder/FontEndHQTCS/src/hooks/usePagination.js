import { useEffect, useMemo, useState } from 'react'

export const PAGE_SIZE = 25

export function usePagination(items, resetDeps = []) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [items.length, ...resetDeps])

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage)
    }
  }, [page, safePage])

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return items.slice(start, start + PAGE_SIZE)
  }, [items, safePage])

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const endIndex = Math.min(safePage * PAGE_SIZE, totalItems)

  return {
    page: safePage,
    setPage,
    totalPages,
    totalItems,
    paginatedItems,
    pageSize: PAGE_SIZE,
    startIndex,
    endIndex,
  }
}
