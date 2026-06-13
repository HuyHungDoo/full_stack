function getVisiblePages(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set([1, totalPages, currentPage])

  if (currentPage - 1 > 1) pages.add(currentPage - 1)
  if (currentPage + 1 < totalPages) pages.add(currentPage + 1)
  if (currentPage - 2 > 1) pages.add(currentPage - 2)
  if (currentPage + 2 < totalPages) pages.add(currentPage + 2)

  const sorted = [...pages].sort((a, b) => a - b)
  const result = []

  sorted.forEach((pageNumber, index) => {
    if (index > 0 && pageNumber - sorted[index - 1] > 1) {
      result.push('ellipsis')
    }
    result.push(pageNumber)
  })

  return result
}

function PageButton({ pageNumber, isActive, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(pageNumber)}
      className={`min-w-[2.25rem] rounded-xl px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isActive
          ? 'bg-emerald-600 font-semibold text-white shadow-sm'
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {pageNumber}
    </button>
  )
}

export default function Pagination({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  loading = false,
  itemLabel = 'bản ghi',
}) {
  if (totalItems <= 0) return null

  const visiblePages = getVisiblePages(page, totalPages)

  return (
    <div className="mt-4 flex flex-col gap-3 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
      <p>
        Hiển thị{' '}
        <span className="font-semibold">
          {startIndex}-{endIndex}
        </span>{' '}
        / Tổng số <span className="font-semibold">{totalItems}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trước
        </button>

        <div className="flex items-center gap-1">
          {visiblePages.map((item, index) =>
            item === 'ellipsis' ? (
              <span
                key={`ellipsis-${index}`}
                className="min-w-[2rem] px-1 text-center text-slate-400"
              >
                ...
              </span>
            ) : (
              <PageButton
                key={item}
                pageNumber={item}
                isActive={item === page}
                disabled={loading}
                onClick={onPageChange}
              />
            ),
          )}
        </div>

        <button
          type="button"
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sau
        </button>

        <span className="hidden text-slate-400 sm:inline">
          Trang {page}/{totalPages}
        </span>
      </div>
    </div>
  )
}
