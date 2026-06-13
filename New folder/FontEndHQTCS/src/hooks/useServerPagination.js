import { useCallback, useEffect, useRef, useState } from 'react'
import { PAGE_SIZE } from './usePagination'

export function useServerPagination(fetchPage, resetDeps = []) {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
    totalPages: 1,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fetchRef = useRef(fetchPage)
  const pageRef = useRef(page)
  const resetKey = JSON.stringify(resetDeps)

  fetchRef.current = fetchPage
  pageRef.current = page

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  const reload = useCallback(async (targetPage = pageRef.current) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchRef.current(targetPage)
      setItems(result.items || [])
      setMeta({
        total: result.meta?.total ?? 0,
        page: result.meta?.page ?? targetPage,
        limit: result.meta?.limit ?? PAGE_SIZE,
        totalPages: result.meta?.totalPages ?? 1,
        summary: result.meta?.summary,
      })
    } catch (err) {
      setItems([])
      setMeta((prev) => ({ ...prev, total: 0, totalPages: 1 }))
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload(page)
  }, [page, resetKey, reload])

  const totalItems = meta.total
  const totalPages = meta.totalPages || 1
  const startIndex = totalItems === 0 ? 0 : (page - 1) * meta.limit + 1
  const endIndex = Math.min(page * meta.limit, totalItems)

  return {
    items,
    page,
    setPage,
    meta,
    loading,
    error,
    reload,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    pageSize: meta.limit,
  }
}
