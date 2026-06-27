import { useEffect } from 'react'
import '../styles/confirm-dialog.css'

export default function ConfirmDialog({ open, title, message, confirmText = 'בטוח!', cancelText = 'ביטול', onConfirm, onCancel, danger = true }) {
  useEffect(() => {
    if (!open) return
    const handleEsc = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">{danger ? '⚠️' : 'ℹ️'}</div>
        <h3 className="confirm-title">{title || 'האם אתה בטוח?'}</h3>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-primary" onClick={onConfirm}>
            {confirmText}
          </button>
          <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
