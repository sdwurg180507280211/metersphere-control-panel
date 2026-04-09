import { useEffect, useCallback } from 'react'
import './ConfigPanelModal.css'

function ConfigPanelModal({ isOpen, title, onClose, maxWidth, children }) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

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

  return (
    <div className="panel-modal-overlay" onClick={onClose}>
      <div
        className="panel-modal"
        style={maxWidth ? { maxWidth } : undefined}
        onClick={e => e.stopPropagation()}
      >
        <div className="panel-modal-header">
          <h3>{title}</h3>
          <button className="panel-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="panel-modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}

export default ConfigPanelModal
