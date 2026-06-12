import { getApiErrorMessage } from '../../api/client'

export default function ListLoadError({ error, onRetry }) {
  if (!error) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{getApiErrorMessage(error, 'Không thể tải dữ liệu. Vui lòng thử lại.')}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100"
        >
          Thử lại
        </button>
      ) : null}
    </div>
  )
}
