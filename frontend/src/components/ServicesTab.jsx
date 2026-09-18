import { useEffect, useCallback, useState, useRef, memo } from 'react'
import { toast } from 'react-hot-toast'
import { useServiceStore, useWebSocketStore, useInfraStore, useConfigStore, SERVICE_BUSY_PHASES } from '../store/useAppStore'
import LogViewer from './LogViewer'
import ServiceDiagnostics from './ServiceDiagnostics'
import EmptyState from './EmptyState'
import ConfirmDialog from './ConfirmDialog'
import TunnelDialog from './TunnelDialog'
import Tooltip from './Tooltip'
import { ServiceCardSkeleton } from './Skeleton'
import './ServicesTab.css'

const BUSY_SERVICE_PHASES = SERVICE_BUSY_PHASES

// 从 API 响应中提取错误消息（处理 error 是对象 {code, message, details} 的情况）
function extractError(data, defaultMessage) {
  const { error } = data
  if (typeof error === 'object' && error !== null) {
    return typeof error.message === 'string' ? error.message : defaultMessage
  }
  return error || defaultMessage
}

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
    text: '服务异常',
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

function InfraStatusBadge({ component }) {
  const { name, reachable, host, port, error } = component
  const isUnknown = reachable === null

  const color = isUnknown ? '#94a3b8' : reachable ? '#4ade80' : '#f87171'
  const bgColor = isUnknown ? '#182237' : reachable ? '#102617' : '#311818'
  const borderColor = isUnknown ? '#334155' : reachable ? '#24653b' : '#8f3434'
  const icon = isUnknown ? '?' : reachable ? '\u25CF' : '\u2715'
  const label = isUnknown ? name : reachable ? name : `${name} \u4E0D\u53EF\u8FBE`

  return (
    <Tooltip
      content={reachable === null
        ? `${name}: \u672A\u68C0\u6D4B (${host}:${port})`
        : reachable
          ? `${name}: \u53EF\u8FBE (${host}:${port})`
          : `${name}: \u4E0D\u53EF\u8FBE (${host}:${port}) - ${error || '\u8FDE\u63A5\u5931\u8D25'}`
      }
      position="bottom"
    >
      <span
        className="infra-badge"
        style={{
          backgroundColor: bgColor,
          borderColor,
          color,
          border: `1px solid ${borderColor}`
        }}
      >
        <span className="infra-icon">{icon}</span>
        {label}
      </span>
    </Tooltip>
  )
}

function InfraStatusStrip({ status, onRefresh, sdkDiagnostics }) {
  const [building, setBuilding] = useState(false)

  const handleBuildSdk = async () => {
    if (building) return
    setBuilding(true)
    try {
      const res = await fetch('/api/services/build/sdk', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success('SDK \u6784\u5EFA\u4EFB\u52A1\u5DF2\u521B\u5EFA')
      } else {
        toast.error(data.error?.message || 'SDK \u6784\u5EFA\u5931\u8D25')
      }
    } catch (error) {
      toast.error(`SDK \u6784\u5EFA\u5931\u8D25: ${error.message}`)
    } finally {
      setTimeout(() => setBuilding(false), 3000)
    }
  }

  return (
    <div className="infra-status-strip">
      <InfraStatusBadge component={status.mysql} />
      <InfraStatusBadge component={status.redis} />
      <InfraStatusBadge component={status.kafka} />
      <button
        className="infra-badge infra-badge-warning"
        onClick={handleBuildSdk}
        disabled={building}
      >
        {building ? '构建中...' : '构建 SDK'}
      </button>
    </div>
  )
}

function ServicesTab({ searchInputRef }) {
  const {
    catalog,
    services,
    loading,
    fetchCatalog,
    fetchServices,
    requestServiceAction,
    statusRefreshing,
    statusStale,
    statusError,
    updateServiceStatus
  } = useServiceStore()
  const { connected } = useWebSocketStore()
  const { status: infraStatus, fetchInfraStatus } = useInfraStore()
  const { diagnostics, resolved } = useConfigStore()
  const [expandedErrors, setExpandedErrors] = useState(new Set())
  const [initialLoading, setInitialLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    action: '',
    title: '',
    message: ''
  })
  const [tunnelDialogOpen, setTunnelDialogOpen] = useState(false)
  const [tunnelRunning, setTunnelRunning] = useState(false)
  const [serviceLogRequest, setServiceLogRequest] = useState(null)
  const logPanelRef = useRef(null)
  const batchSubmittingRef = useRef(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const stale = statusStale || !connected

  const openServiceLogs = useCallback((serviceId) => {
    setServiceLogRequest((previous) => ({ serviceId, sequence: (previous?.sequence || 0) + 1 }))
    logPanelRef.current?.scrollIntoView({ block: 'nearest' })
    logPanelRef.current?.focus({ preventScroll: true })
  }, [])

  // 轮询 SSH 隧道状态 + WebSocket 事件
  useEffect(() => {
    let mounted = true
    const check = () => {
      fetch('/api/services/tunnel/status')
        .then(r => r.json())
        .then(d => { if (mounted && d.success) setTunnelRunning(d.data.status === 'RUNNING') })
        .catch(() => {})
    }
    check()
    const interval = setInterval(check, 5000)

    const handleTunnelChange = (e) => {
      if (!mounted) return
      setTunnelRunning(e.detail === 'RUNNING')
    }
    window.addEventListener('tunnelStatusChange', handleTunnelChange)

    return () => {
      mounted = false
      clearInterval(interval)
      window.removeEventListener('tunnelStatusChange', handleTunnelChange)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    Promise.all([fetchCatalog(), fetchServices()]).finally(() => {
      if (mounted) setInitialLoading(false)
    })
    return () => { mounted = false }
  }, [fetchCatalog, fetchServices])

  useEffect(() => {
    fetchInfraStatus()
    const interval = setInterval(fetchInfraStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchInfraStatus])

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

  const runServiceAction = useCallback(async (serviceId, action, event) => {
    event?.stopPropagation()
    if (batchSubmittingRef.current) return
    const labels = { start: '启动', stop: '停止', restart: '重启' }
    try {
      const result = await requestServiceAction(serviceId, action)
      if (result) toast.success(`${labels[action]}请求已受理`)
    } catch (error) {
      toast.error(error.message || `${labels[action]}请求失败`)
    }
  }, [requestServiceAction])

  const toggleService = useCallback((serviceId) => {
    const current = useServiceStore.getState().services[serviceId]
    return runServiceAction(serviceId, current?.running ? 'stop' : 'start')
  }, [runServiceAction])

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
    if (batchSubmittingRef.current) return
    batchSubmittingRef.current = true
    setBatchSubmitting(true)
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
      // 停止操作只更新正在运行或忙碌中的服务，跳过已停止的
      if (action === 'stop' && !serviceStatus.running && !BUSY_SERVICE_PHASES.has(serviceStatus.phase)) {
        return
      }
      updateServiceStatus(service.id, {
        phase: phaseMap[action],
        running: false,
        error: null
      })
    })

    try {
      await toast.promise(
      fetch(endpoint, { method: 'POST' })
        .then((response) => response.json())
        .then((data) => {
          if (!data.success) {
            throw new Error(data.error?.message || data.error || `${actionLabels[action]}失败`)
          }
          return data
        }),
      {
        loading: `正在${actionLabels[action]}所有服务...`,
        success: `${actionLabels[action]}命令已发送`,
        error: (err) => err.message || `${actionLabels[action]}失败`
      }
    )

    } catch { /* toast.promise already reports the request error. */ }
    finally {
      try { await fetchServices() } finally {
        batchSubmittingRef.current = false
        setBatchSubmitting(false)
      }
    }
  }, [confirmDialog, catalog, services, updateServiceStatus, fetchServices])


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
          <div className="services-status-notice" role="status">
            <span>{statusError || '尚无服务目录，可重新读取或检查项目配置。'}</span>
            <button type="button" disabled={statusRefreshing} onClick={() => { fetchCatalog(); fetchServices() }}>重新读取</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content services-tab">
      {(stale || statusError) && <div className="services-status-notice" role="status">
        <span>{statusError ? `状态刷新失败：${statusError}` : !connected ? '实时连接已断开，以下为最近一次观测。' : '状态正在同步，部分观测可能已过期。'}</span>
        <button type="button" onClick={() => fetchServices()} disabled={statusRefreshing}>{statusRefreshing ? '刷新中…' : '刷新状态'}</button>
      </div>}
      <div className="services-workspace">
        <section className="card services-control-panel">
          <div className="card-header">
            <div className="batch-actions">
              <Tooltip content={resolved?.sshTunnel?.remoteHost ? `建立 SSH 反向隧道到 ${resolved.sshTunnel.remoteHost}` : 'SSH 隧道未配置目标主机'} position="bottom">
                <button className={`btn-batch btn-tunnel${tunnelRunning ? ' tunnel-active' : ''}`} onClick={() => setTunnelDialogOpen(true)}>
                  <span className="btn-icon-text">SSH</span>
                  {tunnelRunning ? '隧道已连接' : '隧道'}
                </button>
              </Tooltip>
              <Tooltip content="启动所有服务" position="bottom">
                <button className="btn-batch btn-start" onClick={() => handleBatchAction('start')} disabled={batchSubmitting}>
                  <span className="btn-icon-text">ON</span>
                  启动全部
                </button>
              </Tooltip>
              <Tooltip content="重启所有服务" position="bottom">
                <button className="btn-batch btn-restart" onClick={() => handleBatchAction('restart')} disabled={batchSubmitting}>
                  <span className="btn-icon-text">RS</span>
                  重启全部
                </button>
              </Tooltip>
              <Tooltip content="停止所有服务" position="bottom">
                <button className="btn-batch btn-stop" onClick={() => handleBatchAction('stop')} disabled={batchSubmitting}>
                  <span className="btn-icon-text">OFF</span>
                  停止全部
                </button>
              </Tooltip>
            </div>
            <InfraStatusStrip
              status={infraStatus}
              onRefresh={fetchInfraStatus}
              sdkDiagnostics={diagnostics?.sdkBuild}
            />
          </div>
          <div className="btn-grid">
            {catalog.map((service, index) => (
              <ServiceButton
                key={service.id}
                service={service}
                status={services[service.id] || { running: false, phase: 'stopped', error: null }}
                isLoading={loading[service.id] || batchSubmitting}
                isErrorExpanded={expandedErrors.has(service.id)}
                onToggle={() => toggleService(service.id)}
                onRestart={(e) => runServiceAction(service.id, 'restart', e)}
                onForceStop={(e) => runServiceAction(service.id, 'stop', e)}
                onViewLogs={() => openServiceLogs(service.id)}
                onRefresh={() => fetchServices()}
                refreshing={statusRefreshing}
                stale={stale}
                onToggleError={() => toggleErrorExpand(service.id)}
                animationDelay={index * 50}
              />
            ))}
          </div>
        </section>

        <aside ref={logPanelRef} tabIndex={-1} aria-label="服务日志区域" className="card log-card services-log-panel">
          <div className="card-header">
            <h2 className="card-title">服务日志</h2>
          </div>
          <LogViewer type="service" searchInputRef={searchInputRef} services={catalog} serviceLogRequest={serviceLogRequest} />
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

      <TunnelDialog
        isOpen={tunnelDialogOpen}
        onClose={() => setTunnelDialogOpen(false)}
      />
    </div>
  )
}

const ServiceButton = memo(function ServiceButton({
  service,
  status,
  isLoading,
  isErrorExpanded,
  onToggle,
  onRestart,
  onForceStop,
  onToggleError,
  onViewLogs,
  onRefresh,
  refreshing,
  stale,
  animationDelay
}) {
  const { phase, running, pid } = status
  const isBusy = BUSY_SERVICE_PHASES.has(phase)
  const actionLabel = running ? '停止' : '启动'
  const config = STATE_CONFIG[phase] || (isBusy ? { ...STATE_CONFIG.starting, text: '处理中' } : STATE_CONFIG[running ? 'running' : 'stopped'])

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
        type="button"
        aria-label={`${actionLabel} ${service.name || service.id}`}
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
              type="button"
              aria-label={`重启 ${service.name || service.id}`}
              disabled={isLoading || isBusy}
              onClick={onRestart}
            >
              🔄
            </button>
          </Tooltip>
        </div>
      )}

      {phase === 'failed' && (
        <div className="service-actions">
          <Tooltip content="停止服务" position="bottom">
            <button
              className="btn-icon btn-stop-small"
              type="button"
              aria-label={`停止 ${service.name || service.id}`}
              disabled={isLoading || isBusy}
              onClick={onForceStop}
            >
              🛑
            </button>
          </Tooltip>
          <Tooltip content="重新启动" position="bottom">
            <button
              className="btn-icon btn-restart-small"
              type="button"
              aria-label={`重启 ${service.name || service.id}`}
              disabled={isLoading || isBusy}
              onClick={onRestart}
            >
              🔄
            </button>
          </Tooltip>
        </div>
      )}
      <ServiceDiagnostics service={service} status={status} stale={stale}
        expanded={isErrorExpanded} onToggle={onToggleError} onViewLogs={onViewLogs}
        onRefresh={onRefresh} refreshing={refreshing} />
    </div>
  )
})

export default ServicesTab
