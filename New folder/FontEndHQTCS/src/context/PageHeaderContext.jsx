import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const PageHeaderContext = createContext(null)

export function PageHeaderProvider({ children }) {
  const [pageHeader, setPageHeaderState] = useState({ title: '', subtitle: '' })

  const setPageHeader = useCallback((next) => {
    setPageHeaderState(next)
  }, [])

  const value = useMemo(
    () => ({ pageHeader, setPageHeader }),
    [pageHeader, setPageHeader],
  )

  return (
    <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>
  )
}

export function usePageHeader() {
  const ctx = useContext(PageHeaderContext)
  if (!ctx) {
    throw new Error('usePageHeader must be used within PageHeaderProvider')
  }
  return ctx
}

/** Set page title and subtitle in the top header; cleared on unmount. */
export function useSetPageHeader(title, subtitle) {
  const { setPageHeader } = usePageHeader()

  useEffect(() => {
    setPageHeader({ title, subtitle })
    return () => setPageHeader({ title: '', subtitle: '' })
  }, [title, subtitle, setPageHeader])
}
