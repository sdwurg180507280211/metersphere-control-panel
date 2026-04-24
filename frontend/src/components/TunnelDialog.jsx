import { useState, useEffect, useCallback } from 'react'
import { useConfigStore } from '../store/useAppStore'
import './TunnelDialog.css'

const DEFAULT_PORT_MAPPINGS = [
  { remotePort: 12580, localPort: 8000, description: '主服务' },
  { remotePort: 4005, localPort: 4005, description: '辅助服务' },
  { remotePort: 4002, localPort: 4002, description: '辅助服务' },
  { remotePort: 4001, localPort: 4001, description: '辅助服务' }
]

function TunnelDialog({ isOpen, onClose }) {
  const resolved = useConfigStore((s) => s.resolved)
  const tunnelConfig = resolved?.tunnel || {}
  const remoteHost = tunnelConfig.remoteHost || '8.152.216.176'
  const remoteUser = tunnelConfig.remoteUser || 'root'

  const [portMappings, setPortMappings] = useState(() =>
    DEFAULT_PORT_MAPPINGS.map((m) => ({ ...m }))
  )
  const [status, setStatus] = useState('STOPPED')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoConnect, setAutoConnect] = useState(false)

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setError('')
      setLoading(false)
    }
  }, [isOpen])

  // 打开时加载保存的配置并轮询状态 + WebSocket 事件
  useEffect(() => {
    if (!isOpen) return

    const fetchConfigAndStatus = async () => {
      try {
        // 先获取状态
        const resStatus = await fetch('/api/services/tunnel/status')
        const dataStatus = await resStatus.json()
        if (dataStatus.success) {
          setStatus(dataStatus.data.status)
        }

        // 再获取保存的配置
        const resConfig = await fetch('/api/services/tunnel/config')
        const dataConfig = await resConfig.json()
        if (dataConfig.success && dataConfig.data.ports && dataConfig.data.ports.length > 0) {
          // 使用保存的配置
          setPortMappings(dataConfig.data.ports.map(m => ({
            ...m,
            remotePort: Number(m.remotePort),
            localPort: Number(m.localPort)
          })))
          setAutoConnect(!!dataConfig.data.autoConnect)
        } else {
          // 使用默认配置
          setPortMappings(DEFAULT_PORT_MAPPINGS.map((m) => ({ ...m })))
          setAutoConnect(false)
        }
      } catch {
        // 如果获取失败，使用默认配置
        setPortMappings(DEFAULT_PORT_MAPPINGS.map((m) => ({ ...m })))
        setAutoConnect(false)
      }
    }

    fetchConfigAndStatus()
    const interval = setInterval(() => {
      fetch('/api/services/tunnel/status')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setStatus(data.data.status)
          }
        })
        .catch(() => {})
    }, 3000)

    // WebSocket 事件即时更新
    const handleTunnelChange = (e) => {
      setStatus(e.detail)
    }
    window.addEventListener('tunnelStatusChange', handleTunnelChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('tunnelStatusChange', handleTunnelChange)
    }
  }, [isOpen])

  const updatePort = useCallback((index, field, value) => {
    if (loading) return
    setPortMappings((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }, [loading])

  const addPort = useCallback(() => {
    if (loading) return
    setPortMappings((prev) => [...prev, { remotePort: '', localPort: '', description: '' }])
  }, [loading])

  const removePort = useCallback((index) => {
    if (loading) return
    setPortMappings((prev) => prev.filter((_, i) => i !== index))
  }, [loading])

  const handleStart = useCallback(async () => {
    const validPorts = portMappings.filter((m) => m.remotePort && m.localPort)
    if (validPorts.length === 0) {
      setError('请至少配置一个有效的端口映射')
      return
    }

    setLoading(true)
    setError('')

    const ports = validPorts.map((m) => ({
      remotePort: Number(m.remotePort),
      localPort: Number(m.localPort),
      description: m.description || ''
    }))

    try {
      // 先保存配置到文件
      await fetch('/api/services/tunnel/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ports, autoConnect })
      })

      // 再启动隧道
      const res = await fetch('/api/services/tunnel/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ports })
      })
      const data = await res.json()

      if (data.success) {
        setStatus('RUNNING')
        setError('')
      } else {
        setError(data?.error?.message || 'SSH 隧道启动失败')
      }
    } catch (err) {
      setError(`网络错误: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [portMappings])

  const handleStop = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/services/tunnel/stop', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        setStatus('STOPPED')
      } else {
        setError(data?.error?.message || 'SSH 隧道停止失败')
      }
    } catch (err) {
      setError(`网络错误: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (status === 'RUNNING' || status === 'RECONNECTING') {
      handleStop()
    } else {
      handleStart()
    }
  }

  if (!isOpen) return null

  const isRunning = status === 'RUNNING'
  const isReconnecting = status === 'RECONNECTING'

  return (
    <div className="tunnel-dialog-overlay" onClick={loading ? undefined : onClose}>
      <div className="tunnel-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="tunnel-dialog-header">
          <span className="tunnel-dialog-icon">🔗</span>
          <h3>SSH 反向隧道</h3>
          <span className={`tunnel-status-indicator ${isRunning ? 'running' : isReconnecting ? 'reconnecting' : 'stopped'}`}>
            <span className="tunnel-status-dot" />
            {isRunning ? '运行中' : isReconnecting ? '重连中' : '已停止'}
          </span>
        </div>

        <form className="tunnel-dialog-body" onSubmit={handleSubmit}>
          <div className="tunnel-dialog-target">
            <span className="tunnel-dialog-target-label">目标:</span>
            {remoteUser}@{remoteHost}
          </div>

          {/* 自动连接 */}
          <div className="tunnel-autoconnect-row">
            <label className="tunnel-autoconnect-label">
              <input
                type="checkbox"
                checked={autoConnect}
                onChange={(e) => setAutoConnect(e.target.checked)}
                disabled={loading}
              />
              启动时自动连接
            </label>
            <span className="tunnel-autoconnect-hint">项目启动时自动建立 SSH 隧道</span>
          </div>

          {/* 端口映射表格 */}
          <div className="tunnel-ports-section">
            <div className="tunnel-ports-table-header">
              <label className="tunnel-ports-label">端口映射</label>
              <button
                type="button"
                className="tunnel-add-btn"
                onClick={addPort}
                disabled={loading}
              >
                + 新增
              </button>
            </div>
            <div className="tunnel-ports-table">
              <div className="tunnel-ports-head">
                <span>远程端口</span>
                <span>本地端口</span>
                <span>说明</span>
                <span />
              </div>
              {portMappings.length === 0 ? (
                <div className="tunnel-ports-empty">暂无端口映射，请点击"+ 新增"添加</div>
              ) : (
                portMappings.map((mapping, index) => (
                  <div key={index} className="tunnel-ports-row">
                    <div className="tunnel-port-cell">
                      <input
                        type="number"
                        value={mapping.remotePort}
                        onChange={(e) => updatePort(index, 'remotePort', e.target.value)}
                        placeholder="远程端口"
                        disabled={loading}
                      />
                    </div>
                    <div className="tunnel-port-cell">
                      <input
                        type="number"
                        value={mapping.localPort}
                        onChange={(e) => updatePort(index, 'localPort', e.target.value)}
                        placeholder="本地端口"
                        disabled={loading}
                      />
                    </div>
                    <div className="tunnel-port-cell">
                      <input
                        type="text"
                        value={mapping.description}
                        onChange={(e) => updatePort(index, 'description', e.target.value)}
                        placeholder="说明"
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="button"
                      className="tunnel-remove-btn"
                      onClick={() => removePort(index)}
                      disabled={loading}
                      title="删除此映射"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {error ? <p className="tunnel-dialog-error">{error}</p> : null}

          <div className="tunnel-dialog-footer">
            <button className="btn-cancel" type="button" onClick={onClose} disabled={loading}>
              取消
            </button>
            {isRunning ? (
              <button className="btn-tunnel-stop" type="submit" disabled={loading}>
                {loading ? '停止中...' : '断开隧道'}
              </button>
            ) : isReconnecting ? (
              <button className="btn-tunnel-stop" type="submit" disabled={loading}>
                {loading ? '停止中...' : '取消重连'}
              </button>
            ) : (
              <button className="btn-tunnel-start" type="submit" disabled={loading}>
                {loading ? '连接中...' : '建立隧道'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default TunnelDialog
