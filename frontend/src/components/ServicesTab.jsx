import { useEffect, useCallback, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useServiceStore, useWebSocketStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import './ServicesTab.css'

const BUSY_SERVICE_PHASES = new Set(['starting', 'checking_health', 'stopping', 'restarting'])

// 状态配置
const STATE_CONFIG = {
  starting: { 
    icon: '⏳', 
    color: '#faad14', 
    bgColor: '#fffbe6',
    borderColor: '#ffe58f',
    text: '启动中',
    spin: true 
  },
  checking_health: { 
    icon: '🔍', 
    color: '#1890ff', 
    bgColor: '#e6f7ff',
    borderColor: '#91d5ff',
    text: '健康检查中',
    spin: true 
  },
  running: { 
    icon: '✓', 
    color: '#52c41a', 
    bgColor: '#f6ffed',
    borderColor: '#b7eb8f',
    text: '运行中',
    spin: false 
  },
  stopping: { 
    icon: '🛑', 
    color: '#fa8c16', 
    bgColor: '#fff7e6',
    borderColor: '#ffd591',
    text: '停止中',
    spin: true 
  },
  stopped: { 
    icon: '○', 
    color: '#8c8c8c', 
    bgColor: '#f5f5f5',
    borderColor: '#d9d9d9',
    text: '已停止',
    spin: false 
  },
  failed: { 
    icon: '✗', 
    color: '#f5222d', 
    bgColor: '#fff1f0',
    borderColor: '#ffa39e',
    text: '启动失败',
    spin: false 
  },
  restarting: { 
    icon: '🔄', 
    color: '#722ed1', 
    bgColor: '#f9f0ff',
    borderColor: '#d3adf7',
    text: '重启中',
    spin: true 
  }
}

function ServicesTab() {
  const {
    catalog,
    services,
    loading,
    fetchCatalog,
    fetchServices,
    setLoading,
    updateServiceStatus
  } = useServiceStore()
  const { connected } = useWebSocketStore()
  const [expandedErrors, setExpandedErrors] = useState(new Set())

  useEffect(() => {
    fetchCatalog()
    fetchServices()
  }, [fetchCatalog, fetchServices])

  useEffect(() => {
    if (connected) {
      return undefined
    }

    const interval = setInterval(fetchServices, 5000)
    return () => clearInterval(interval)
  }, [connected, fetchServices])

  const toggleErrorExpand = useCallback((serviceId) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(serviceId)) {
        next.delete(serviceId)
      } else {
        next.add(serviceId)
      }
      return next
    })
  }, [])

  const toggleService = useCallback(async (serviceId) => {
    const serviceStatus = services[serviceId] || { running: false, phase: 'stopped' }
    const isRunning = serviceStatus.running
    const action = isRunning ? '停止' : '启动'

    setLoading(serviceId, true)

    try {
      const endpoint = `/api/services/${serviceId}/${isRunning ? 'stop' : 'start'}`
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        toast.success(`${action}命令已发送`)
        updateServiceStatus(serviceId, {
          ...serviceStatus,
          phase: isRunning ? 'stopping' : 'starting',
          running: false,
          error: null
        })
        if (!connected) {
          setTimeout(fetchServices, 2000)
        }
      } else {
        toast.error(data.error || `${action}失败`)
      }
    } catch (error) {
      toast.error(`网络错误: ${error.message}`)
    } finally {
      setTimeout(() => setLoading(serviceId, false), 2000)
    }
  }, [connected, services, setLoading, updateServiceStatus, fetchServices])

  const handleRestart = useCallback(async (serviceId, e) => {
    e.stopPropagation()
    const serviceStatus = services[serviceId] || { running: false, phase: 'stopped' }
    
    setLoading(serviceId, true)

    try {
      const endpoint = `/api/services/${serviceId}/restart`
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        toast.success('重启命令已发送')
        updateServiceStatus(serviceId, {
          ...serviceStatus,
          phase: 'restarting',
          running: false,
          error: null
        })
      } else {
        toast.error(data.error || '重启失败')
      }
    } catch (error) {
      toast.error(`网络错误: ${error.message}`)
    } finally {
      setTimeout(() => setLoading(serviceId, false), 2000)
    }
  }, [services, setLoading, updateServiceStatus])

  const handleBatchAction = useCallback(async (action) => {
    const actionLabels = {
      start: '启动',
      stop: '停止',
      restart: '重启'
    }
    const endpoint = `/api/services/${action}-all`

    const phaseMap = {
      start: 'starting',
      stop: 'stopping',
      restart: 'restarting'
    }

    catalog.forEach((service) => {
      const serviceStatus = services[service.id] || { running: false, phase: 'stopped' }
      updateServiceStatus(service.id, {
        ...serviceStatus,
        phase: phaseMap[action],
        running: false,
        error: null
      })
    })

    toast.promise(
      fetch(endpoint, { method: 'POST' }).then((response) => response.json()),
      {
        loading: `正在${actionLabels[action]}所有服务...`,
        success: `${actionLabels[action]}命令已发送`,
        error: `${actionLabels[action]}失败`
      }
    )

    if (!connected) {
      setTimeout(fetchServices, action === 'restart' ? 7000 : 5000)
    }
  }, [connected, fetchServices, catalog, services, updateServiceStatus])

  const runningCount = catalog.filter((service) => services[service.id]?.running).length

  return (
    <div className="tab-content">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            服务管理
            <span className="service-count">({runningCount}/{catalog.length} 运行中)</span>
          </h2>
          <div className="batch-actions">
            <button className="btn-batch btn-start" onClick={() => handleBatchAction('start')}>
              启动全部
            </button>
            <button className="btn-batch btn-restart" onClick={() => handleBatchAction('restart')}>
              重启全部
            </button>
            <button className="btn-batch btn-stop" onClick={() => handleBatchAction('stop')}>
              停止全部
            </button>
          </div>
        </div>
        <div className="btn-grid">
          {catalog.map((service) => (
            <ServiceButton
              key={service.id}
              service={service}
              status={services[service.id] || { running: false, phase: 'stopped', error: null }}
              isLoading={loading[service.id]}
              isErrorExpanded={expandedErrors.has(service.id)}
              onToggle={() => toggleService(service.id)}
              onRestart={(e) => handleRestart(service.id, e)}
              onToggleError={() => toggleErrorExpand(service.id)}
            />
          ))}
        </div>
      </div>

      <div className="card log-card">
        <div className="card-header">
          <h2 className="card-title">服务日志</h2>
        </div>
        <LogViewer type="service" />
      </div>
    </div>
  )
}

// 错误类型识别
function getErrorTypeLabel(error) {
  if (!error) return '错误信息'
  if (error.includes('服务内部错误') || error.includes('HTTP 50')) {
    return '服务异常'
  }
  if (error.includes('连接失败')) {
    return '连接失败'
  }
  if (error.includes('超时')) {
    return '检查超时'
  }
  if (error.includes('404')) {
    return '端点错误'
  }
  if (error.includes('权限')) {
    return '权限不足'
  }
  return '启动失败'
}

// 错误提示建议
function getErrorHint(error) {
  if (!error) return null
  if (error.includes('服务内部错误') || error.includes('HTTP 50')) {
    return '服务进程已启动但内部报错，请查看右侧服务日志排查问题'
  }
  if (error.includes('连接失败')) {
    return '服务可能尚未启动或端口未监听'
  }
  if (error.includes('超时')) {
    return '服务启动较慢或健康检查未及时响应，可尝试重试'
  }
  if (error.includes('404')) {
    return '请检查 config.json 中健康检查端点配置是否正确'
  }
  return null
}

function ServiceButton({ 
  service, 
  status, 
  isLoading, 
  isErrorExpanded,
  onToggle, 
  onRestart,
  onToggleError 
}) {
  const { phase, running, error, pid } = status
  const isBusy = BUSY_SERVICE_PHASES.has(phase)
  const actionLabel = running ? '停止' : '启动'
  const config = STATE_CONFIG[phase] || STATE_CONFIG[running ? 'running' : 'stopped']

  return (
    <div
      className={`service-card phase-${phase}`}
      style={{
        backgroundColor: config.bgColor,
        borderColor: config.borderColor
      }}
    >
      <button
        className="service-btn-main"
        onClick={onToggle}
        disabled={isLoading || isBusy}
      >
        {isLoading ? (
          <span className="loading-spinner" />
        ) : (
          <div className="service-btn-content">
            <div className="service-main-row">
              <div className="service-info">
                <span className={`status-icon ${config.spin ? 'spinning' : ''}`} style={{ color: config.color }}>
                  {config.icon}
                </span>
                <span className="service-name">{service.name}</span>
              </div>
              <span 
                className="status-badge" 
                style={{ 
                  backgroundColor: config.color + '20', 
                  color: config.color,
                  border: `1px solid ${config.borderColor}`
                }}
              >
                {config.text}
              </span>
            </div>
            
            <div className="service-meta-row">
              {pid && (
                <span className="service-pid">PID: {pid}</span>
              )}
              {!isBusy && (
                <span className="service-action-hint">
                  点击{actionLabel}
                </span>
              )}
            </div>
          </div>
        )}
      </button>

      {/* 操作按钮区域 */}
      {phase === 'running' && (
        <div className="service-actions">
          <button 
            className="btn-icon btn-restart-small" 
            onClick={onRestart}
            title="重启服务"
          >
            🔄
          </button>
        </div>
      )}

      {/* 错误摘要展示 */}
      {error && phase === 'failed' && (
        <div className="error-section">
          <div className="error-header" onClick={onToggleError}>
            <span className="error-label">
              <span className="error-icon">⚠️</span>
              {getErrorTypeLabel(error)}
            </span>
            <span className="error-toggle">
              {isErrorExpanded ? '收起 ▲' : '展开 ▼'}
            </span>
          </div>
          <div className={`error-content ${isErrorExpanded ? 'expanded' : ''}`}>
            <p className="error-text">{error}</p>
            {getErrorHint(error) && (
              <p className="error-hint">💡 {getErrorHint(error)}</p>
            )}
            <button 
              className="btn-retry" 
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
            >
              重试启动
            </button>
          </div>
          {!isErrorExpanded && (
            <p className="error-text collapsed" title={error}>
              {error.length > 40 ? error.slice(0, 40) + '...' : error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ServicesTab
