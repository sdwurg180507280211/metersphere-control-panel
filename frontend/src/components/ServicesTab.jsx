import { useEffect, useCallback, useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { useServiceStore, useWebSocketStore, useInfraStore, useConfigStore, SERVICE_BUSY_PHASES } from '../store/useAppStore'
import LogViewer from './LogViewer'
import ServiceDiagnostics from './ServiceDiagnostics'
import ServiceCard from './ServiceCard'
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
  const [diagnosticServiceId, setDiagnosticServiceId] = useState(null)
  const [servicesCollapsed, setServicesCollapsed] = useState(false)
  const [selectedLogServiceId, setSelectedLogServiceId] = useState(null)
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
  const diagnosticService = catalog.find((service) => service.id === diagnosticServiceId)
  const closeDiagnostics = useCallback(() => setDiagnosticServiceId(null), [])

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
      <div className={`services-workspace${servicesCollapsed ? ' services-collapsed' : ''}`}>
        <section className="card services-control-panel">
          <div className="services-panel-heading">
            <span>服务 <span className="service-count">{catalog.length}</span></span>
            <div className="services-panel-tools">
              <button type="button" disabled={statusRefreshing} onClick={() => fetchServices()}>{statusRefreshing ? '检查中…' : '刷新状态'}</button>
              <button type="button" aria-expanded={!servicesCollapsed} aria-controls="services-controls" onClick={() => setServicesCollapsed((value) => !value)}>
                {servicesCollapsed ? '展开服务区' : '收起服务区'}
              </button>
            </div>
          </div>
          <div className="services-controls" id="services-controls" hidden={servicesCollapsed}>
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
            <div className="btn-grid" aria-label="服务列表" tabIndex={0}>
              {catalog.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  status={services[service.id] || { running: false, phase: 'stopped', error: null }}
                  isLoading={loading[service.id] || batchSubmitting}
                  selected={selectedLogServiceId === service.id}
                  onToggle={() => toggleService(service.id)}
                  onRestart={(e) => runServiceAction(service.id, 'restart', e)}
                  onForceStop={(e) => runServiceAction(service.id, 'stop', e)}
                  onViewLogs={() => openServiceLogs(service.id)}
                  stale={stale}
                  onDetails={() => setDiagnosticServiceId(service.id)}
                />
              ))}
            </div>
          </div>
        </section>

        <aside ref={logPanelRef} tabIndex={-1} aria-label="服务日志区域" className="card log-card services-log-panel">
          <div className="card-header">
            <h2 className="card-title">服务日志</h2>
          </div>
          <LogViewer type="service" searchInputRef={searchInputRef} services={catalog} serviceLogRequest={serviceLogRequest} onServiceSelectionChange={setSelectedLogServiceId} />
        </aside>
      </div>

      {diagnosticService && <ServiceDiagnostics
        key={diagnosticService.id}
        service={diagnosticService}
        status={services[diagnosticService.id] || {}}
        stale={stale}
        onClose={closeDiagnostics}
        onViewLogs={() => openServiceLogs(diagnosticService.id)}
        onRefresh={() => fetchServices()}
        refreshing={statusRefreshing}
      />}

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


export default ServicesTab
