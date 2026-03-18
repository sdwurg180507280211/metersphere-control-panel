import { useState, useEffect, useCallback } from 'react'
import './TunnelDialog.css'

const DEFAULT_PORT_MAPPINGS = [
  { remotePort: 12580, localPort: 8000, description: '主服务' },
  { remotePort: 4005, localPort: 4005, description: '辅助服务' },
  { remotePort: 4002, localPort: 4002, description: '辅助服务' },
  { remotePort: 4001, localPort: 4001, description: '辅助服务' }
]

function TunnelDialog({ isOpen, onClose }) {
  const [portMappings, setPortMappings] = useState(() =>
    DEFAULT_PORT_MAPPINGS.map((m) => ({ ...m }))
  )
  const [status, setStatus] = useState('STOPPED')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 打开时轮询状态
  useEffect(() => {
    if (!isOpen) return

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/services/tunnel/status')
        const data = await res.json()
        if (data.success) {
          setStatus(data.data.status)
        }
      } catch {
        // ignore
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [isOpen])

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setError('')
      setLoading(false)
      setPortMappings(DEFAULT_PORT_MAPPINGS.map((m) => ({ ...m })))
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
      localPort: Number(m.localPort)
    }))

    try {
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
    if (status === 'RUNNING') {
      handleStop()
    } else {
      handleStart()
    }
  }

  if (!isOpen) return null

  const isRunning = status === 'RUNNING'

  return (
    <div className="tunnel-dialog-overlay" onClick={loading ? undefined : onClose}>
      <div className="tunnel-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="tunnel-dialog-header">
          <span className="tunnel-dialog-icon">🔗</span>
          <h3>SSH 反向隧道</h3>
          <span className={`tunnel-status-indicator ${isRunning ? 'running' : 'stopped'}`}>
            <span className="tunnel-status-dot" />
            {isRunning ? '运行中' : '已停止'}
          </span>
        </div>

        <form className="tunnel-dialog-body" onSubmit={handleSubmit}>
          <div className="tunnel-dialog-target">
            <span className="tunnel-dialog-target-label">目标:</span>
            root@8.152.216.176
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
