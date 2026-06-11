import { FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from 'react-icons/fa'

export default function AppDialog({ dialog, onClose, onPrimaryAction }) {
  if (!dialog.isOpen) return null

  const iconWrap =
    dialog.type === 'success'
      ? 'bg-emerald-100 text-emerald-600'
      : dialog.type === 'confirm' || dialog.type === 'error'
        ? 'bg-red-100 text-red-600'
        : 'bg-amber-100 text-amber-600'

  const Icon =
    dialog.type === 'success'
      ? FaCheckCircle
      : dialog.type === 'error'
        ? FaTimesCircle
        : FaExclamationTriangle

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm overflow-hidden rounded-[24px] bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
      >
        <div className="p-6 text-center">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${iconWrap}`}>
            <Icon size={dialog.type === 'success' ? 32 : 28} />
          </div>
          <h3 id="app-dialog-title" className="text-xl font-bold text-slate-900">
            {dialog.title}
          </h3>
          <p className="mt-3 whitespace-pre-line rounded-xl border border-slate-100 bg-slate-50 p-3 text-left text-sm leading-relaxed text-slate-500">
            {dialog.message}
          </p>
        </div>

        <div className="flex gap-3 bg-slate-50 p-4">
          {dialog.type === 'confirm' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {dialog.cancelLabel}
              </button>
              <button
                type="button"
                onClick={onPrimaryAction}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-red-700"
              >
                {dialog.confirmLabel}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onPrimaryAction}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {dialog.confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
