import { useEffect, useRef } from 'react'
import '../styles/confirm-dialog.css'

export default function ConfirmDialog({ open, title, message, confirmText = 'בטוח!', cancelText = 'ביטול', onConfirm, onCancel, danger = true }) {
  const cancelRef = useRef(null)
  const titleId = 'confirm-dialog-title'
  const messageId = message ? 'confirm-dialog-message' : undefined

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    window.setTimeout(() => cancelRef.current?.focus(), 0)
    const handleEsc = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('keydown', handleEsc)
      previousFocus?.focus?.()
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-icon" aria-hidden="true">{danger ? '⚠️' : 'ℹ️'}</div>
        <h3 className="confirm-title" id={titleId}>{title || 'האם אתה בטוח?'}</h3>
        {message && <p className="confirm-message" id={messageId}>{message}</p>}
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-primary" onClick={onConfirm}>
            {confirmText}
          </button>
          <button ref={cancelRef} className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
