import { useWebSocketStore } from '../store/useAppStore'
import './ConnectionStatus.css'

function ConnectionStatus() {
  const { connected, reconnectAttempts } = useWebSocketStore()

  if (connected) return null

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
