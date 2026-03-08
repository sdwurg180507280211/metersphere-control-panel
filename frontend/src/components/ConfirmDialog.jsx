import { useEffect, useCallback } from 'react'
import './ConfirmDialog.css'

function ConfirmDialog({ 
  isOpen, 
  title, 
  message, 
  confirmText = '确认', 
  cancelText = '取消',
  type = 'warning',
  onConfirm, 
  onCancel 
}) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onCancel()
    } else if (e.key === 'Enter') {
      onConfirm()
    }
  }, [onConfirm, onCancel])

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const typeConfig = {
    warning: { icon: '⚠️', color: '#faad14' },
    danger: { icon: '🗑️', color: '#ff4d4f' },
    info: { icon: 'ℹ️', color: '#1890ff' }
  }

  const config = typeConfig[type] || typeConfig.warning

  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-dialog-header" style={{ color: config.color }}>
          <span className="confirm-dialog-icon">{config.icon}</span>
          <h3>{title}</h3>
        </div>
        
        {message && (
          <div className="confirm-dialog-body">
            <p>{message}</p>
          </div>
        )}
        
        <div className="confirm-dialog-footer">
          <button className="btn-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            className={`btn-confirm btn-${type}`} 
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
