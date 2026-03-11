import { useEffect, useCallback, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useServiceStore, useWebSocketStore, useLogStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import EmptyState from './EmptyState'
import ConfirmDialog from './ConfirmDialog'
import PasswordDialog from './PasswordDialog'
import TunnelDialog from './TunnelDialog'
import Tooltip from './Tooltip'
import { ServiceCardSkeleton } from './Skeleton'
import './ServicesTab.css'

const BUSY_SERVICE_PHASES = new Set(['starting', 'checking_health', 'stopping', 'restarting'])

// 状态配置
const STATE_CONFIG = {
  starting: {
    icon: '◌',
    color: '#fbbf24',
    bgColor: '#2b2110',
    borderColor: '#7c5b13',
    text: '启动中',
    spin: true
  },
  checking_health: {
    icon: '◎',
    color: '#60a5fa',
    bgColor: '#0f2342',
    borderColor: '#28589a',
    text: '健康检查中',
    spin: true
  },
  running: {
    icon: '●',
    color: '#4ade80',
    bgColor: '#102617',
    borderColor: '#24653b',
    text: '运行中',
    spin: false
  },
  stopping: {
    icon: '◍',
    color: '#fb923c',
    bgColor: '#2d1d10',
    borderColor: '#8a4b1f',
    text: '停止中',
    spin: true
  },
  stopped: {
    icon: '○',
    color: '#94a3b8',
    bgColor: '#182237',
    borderColor: '#334155',
    text: '已停止',
    spin: false
  },
  failed: {
    icon: '✕',
    color: '#f87171',
    bgColor: '#311818',
    borderColor: '#8f3434',
    text: '启动失败',
    spin: false
  },
  restarting: {
    icon: '↻',
    color: '#c084fc',
    bgColor: '#23163a',
    borderColor: '#6f42b6',
    text: '重启中',
    spin: true
  }
}

function ServicesTab({ searchInputRef }) {
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
  const [initialLoading, setInitialLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState({ 
    isOpen: false, 
    action: '', 
    title: '', 
    message: '' 
  })
  const [reloadDialog, setReloadDialog] = useState({
    isOpen: false,
    password: '',
    error: '',
    loading: false
  })
  const [tunnelDialogOpen, setTunnelDialogOpen] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchCatalog(), fetchServices()])
      setTimeout(() => setInitialLoading(false), 300)
    }
    loadData()
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
        toast.success(`${action}命令已发送`, { icon: isRunning ? '🛑' : '🚀' })
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
        toast.success('重启命令已发送', { icon: '🔄' })
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

  const openSystemReloadDialog = useCallback(() => {
    setReloadDialog({
      isOpen: true,
      password: '',
      error: '',
      loading: false
    })
  }, [])

  const closeSystemReloadDialog = useCallback(() => {
    setReloadDialog((prev) => (prev.loading ? prev : {
      isOpen: false,
      password: '',
      error: '',
      loading: false
    }))
  }, [])

  const confirmSystemReload = useCallback(async () => {
    if (!reloadDialog.password) {
      setReloadDialog((prev) => ({ ...prev, error: '请输入管理员密码' }))
      return
    }

    setReloadDialog((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const response = await fetch('/api/services/system/reload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: reloadDialog.password })
      })
      const data = await response.json()

      if (data.success) {
        toast.success(data.message || 'msctl reload 执行成功', { icon: '⚙️' })
        setReloadDialog({
          isOpen: false,
          password: '',
          error: '',
          loading: false
        })

        if (!connected) {
          setTimeout(fetchServices, 2000)
        }
        return
      }

      const message = data?.error?.message || 'msctl reload 执行失败'
      setReloadDialog((prev) => ({ ...prev, loading: false, error: message }))
      toast.error(message)
    } catch (error) {
      const message = `网络错误: ${error.message}`
      setReloadDialog((prev) => ({ ...prev, loading: false, error: message }))
      toast.error(message)
    }
  }, [connected, fetchServices, reloadDialog.password])

  const handleBatchAction = useCallback((action) => {
    const actionLabels = {
      start: { label: '启动', icon: '🚀' },
      stop: { label: '停止', icon: '🛑' },
      restart: { label: '重启', icon: '🔄' }
    }
    
    setConfirmDialog({
      isOpen: true,
      action,
      title: `确认${actionLabels[action].label}全部服务`,
      message: `确定要${actionLabels[action].label}所有服务吗？`,
      icon: actionLabels[action].icon
    })
  }, [])

  const confirmBatchAction = useCallback(async () => {
    const { action } = confirmDialog
    setConfirmDialog({ isOpen: false, action: '', title: '', message: '' })
    
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
  }, [confirmDialog, catalog, services, updateServiceStatus, connected, fetchServices])

  const runningCount = catalog.filter((service) => services[service.id]?.running).length
  const busyCount = catalog.filter((service) => BUSY_SERVICE_PHASES.has(services[service.id]?.phase)).length
  const failedCount = catalog.filter((service) => services[service.id]?.phase === 'failed').length

  // 渲染骨架屏
  if (initialLoading) {
    return (
      <div className="tab-content services-tab">
        <div className="card">
          <div className="card-header skeleton-header">
            <div className="skeleton-title" />
            <div className="skeleton-actions" />
          </div>
          <div className="btn-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <ServiceCardSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="card log-card skeleton-log">
          <div className="card-header">
            <div className="skeleton-log-title" />
          </div>
        </div>
      </div>
    )
  }

  if (catalog.length === 0) {
    return (
      <div className="tab-content services-tab">
        <div className="card">
          <EmptyState type="services" />
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content services-tab">
      <div className="services-workspace">
        <section className="card services-control-panel">
          <div className="card-header">
            <h2 className="card-title">
              服务管理
              <span className="service-count">({runningCount}/{catalog.length} 运行中)</span>
            </h2>
            <div className="batch-actions">
              <Tooltip content="建立 SSH 反向隧道到 8.152.216.176" position="bottom">
                <button className="btn-batch btn-tunnel" onClick={() => setTunnelDialogOpen(true)}>
                  <span className="btn-icon-text">SSH</span>
                  隧道
                </button>
              </Tooltip>
              <Tooltip content="执行 sudo msctl reload" position="bottom">
                <button className="btn-batch btn-system-reload" onClick={openSystemReloadDialog}>
                  <span className="btn-icon-text">SYS</span>
                  系统 Reload
                </button>
              </Tooltip>
              <Tooltip content="启动所有服务" position="bottom">
                <button className="btn-batch btn-start" onClick={() => handleBatchAction('start')}>
                  <span className="btn-icon-text">ON</span>
                  启动全部
                </button>
              </Tooltip>
              <Tooltip content="重启所有服务" position="bottom">
                <button className="btn-batch btn-restart" onClick={() => handleBatchAction('restart')}>
                  <span className="btn-icon-text">RS</span>
                  重启全部
                </button>
              </Tooltip>
              <Tooltip content="停止所有服务" position="bottom">
                <button className="btn-batch btn-stop" onClick={() => handleBatchAction('stop')}>
                  <span className="btn-icon-text">OFF</span>
                  停止全部
                </button>
              </Tooltip>
            </div>
          </div>
          <div className="btn-grid">
            {catalog.map((service, index) => (
              <ServiceButton
                key={service.id}
                service={service}
                status={services[service.id] || { running: false, phase: 'stopped', error: null }}
                isLoading={loading[service.id]}
                isErrorExpanded={expandedErrors.has(service.id)}
                onToggle={() => toggleService(service.id)}
                onRestart={(e) => handleRestart(service.id, e)}
                onToggleError={() => toggleErrorExpand(service.id)}
                animationDelay={index * 50}
              />
            ))}
          </div>
        </section>

        <aside className="card log-card services-log-panel">
          <div className="card-header">
            <h2 className="card-title">服务日志</h2>
          </div>
          <LogViewer type="service" searchInputRef={searchInputRef} />
        </aside>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="确认"
        cancelText="取消"
        type={confirmDialog.action === 'stop' ? 'danger' : 'warning'}
        onConfirm={confirmBatchAction}
        onCancel={() => setConfirmDialog({ isOpen: false, action: '', title: '', message: '' })}
      />

      <PasswordDialog
        isOpen={reloadDialog.isOpen}
        title="执行系统 Reload"
        description="请输入管理员密码后执行 sudo msctl reload。"
        value={reloadDialog.password}
        error={reloadDialog.error}
        loading={reloadDialog.loading}
        onChange={(password) => setReloadDialog((prev) => ({ ...prev, password, error: '' }))}
        onConfirm={confirmSystemReload}
        onCancel={closeSystemReloadDialog}
      />

      <TunnelDialog
        isOpen={tunnelDialogOpen}
        onClose={() => setTunnelDialogOpen(false)}
      />
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
  onToggleError,
  animationDelay
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
        borderColor: config.borderColor,
        animationDelay: `${animationDelay}ms`
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
                <Tooltip content={config.text} position="top">
                  <span className={`status-icon ${config.spin ? 'spinning' : ''}`} style={{ color: config.color }}>
                    {config.icon}
                  </span>
                </Tooltip>
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
                <Tooltip content={`进程 ID: ${pid}`} position="bottom">
                  <span className="service-pid">PID: {pid}</span>
                </Tooltip>
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
          <Tooltip content="重启服务" position="bottom">
            <button 
              className="btn-icon btn-restart-small" 
              onClick={onRestart}
            >
              🔄
            </button>
          </Tooltip>
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
