import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import AppDialog from '../components/common/AppDialog'

const AppDialogContext = createContext(null)

const closedDialog = {
  isOpen: false,
  type: 'alert',
  title: '',
  message: '',
  confirmLabel: 'Đã hiểu',
  cancelLabel: 'Hủy',
  onConfirm: null,
}

export function AppDialogProvider({ children }) {
  const [dialog, setDialog] = useState(closedDialog)

  const closeDialog = useCallback(() => {
    setDialog((prev) => ({ ...prev, isOpen: false }))
  }, [])

  const showAlert = useCallback((title, message, options = {}) => {
    setDialog({
      isOpen: true,
      type: options.type || 'alert',
      title,
      message,
      confirmLabel: options.confirmLabel || 'Đã hiểu',
      cancelLabel: options.cancelLabel || 'Hủy',
      onConfirm: null,
    })
  }, [])

  const showError = useCallback(
    (message, title = 'Lỗi') => {
      showAlert(title, message, { type: 'error' })
    },
    [showAlert],
  )

  const showSuccess = useCallback((title, message, onConfirm = null) => {
    setDialog({
      isOpen: true,
      type: 'success',
      title,
      message,
      confirmLabel: 'Hoàn tất',
      cancelLabel: 'Hủy',
      onConfirm,
    })
  }, [])

  const showConfirm = useCallback((title, message, onConfirm, options = {}) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      confirmLabel: options.confirmLabel || 'Xác nhận',
      cancelLabel: options.cancelLabel || 'Hủy',
      onConfirm,
    })
  }, [])

  const value = useMemo(
    () => ({ showAlert, showError, showSuccess, showConfirm, closeDialog }),
    [closeDialog, showAlert, showConfirm, showError, showSuccess],
  )

  const handlePrimaryAction = () => {
    if (dialog.type === 'confirm') {
      dialog.onConfirm?.()
      closeDialog()
      return
    }
    if (dialog.type === 'success' && dialog.onConfirm) {
      dialog.onConfirm()
      closeDialog()
      return
    }
    closeDialog()
  }

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <AppDialog dialog={dialog} onClose={closeDialog} onPrimaryAction={handlePrimaryAction} />
    </AppDialogContext.Provider>
  )
}

export function useAppDialog() {
  const ctx = useContext(AppDialogContext)
  if (!ctx) {
    throw new Error('useAppDialog must be used within AppDialogProvider')
  }
  return ctx
}
