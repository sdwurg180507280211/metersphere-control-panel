import { useState, useEffect, useRef } from 'react'
import { useWebSocketStore } from '../store/useAppStore'
import './ConnectionStatus.css'

function ConnectionStatus() {
  const { connected, reconnectAttempts } = useWebSocketStore()
  const [showBanner, setShowBanner] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (connected) {
      setShowBanner(false)
    } else {
      timerRef.current = setTimeout(() => {
        setShowBanner(true)
      }, 1500)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [connected])

  if (!showBanner) return null

  return (
    <div className="connection-status-banner">
      <div className="connection-status-content">
        <span className="connection-status-icon">🔌</span>
        <span className="connection-status-text">
          连接已断开，正在尝试重新连接
          {reconnectAttempts > 0 && ` (第${reconnectAttempts}次)`}
        </span>
        <span className="connection-status-spinner" />
      </div>
    </div>
  )
}

export default ConnectionStatus
