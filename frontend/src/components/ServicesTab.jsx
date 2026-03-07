import { useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useServiceStore, useWebSocketStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import './ServicesTab.css'

const BUSY_SERVICE_PHASES = new Set(['starting', 'checking_health', 'stopping', 'restarting'])

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

  const handleBatchAction = useCallback(async (action) => {
    const actionLabels = {
      start: '启动',
      stop: '停止',
      restart: '重启'
    }
    const endpoint = `/api/services/${action}-all`

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
  }, [connected, fetchServices])

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
          {catalog.map((service) => {
            const serviceStatus = services[service.id] || { running: false, phase: 'stopped', error: null }
            const isRunning = serviceStatus.running
            const isLoading = loading[service.id]
            const isBusy = BUSY_SERVICE_PHASES.has(serviceStatus.phase)
            const actionLabel = isRunning ? '停止' : '启动'

            return (
              <button
                key={service.id}
                className={`btn-service ${getServiceStateClass(serviceStatus.phase, isRunning)}`}
                onClick={() => toggleService(service.id)}
                disabled={isLoading || isBusy}
              >
                {isLoading ? (
                  <span className="loading"></span>
                ) : (
                  <div className="service-button-content">
                    <div className="service-name-row">
                      <span className="status-dot"></span>
                      <span className="service-name">{service.name}</span>
                    </div>
                    <div className="service-meta-row">
                      <span className={`service-status-badge ${getServiceStateClass(serviceStatus.phase, isRunning)}`}>
                        {getServicePhaseText(serviceStatus.phase, isRunning)}
                      </span>
                      {!isBusy && <span className="service-action-hint">点击{actionLabel}</span>}
                    </div>
                    {serviceStatus.error && (
                      <span className="service-error-text" title={serviceStatus.error}>
                        {serviceStatus.error}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
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

function getServicePhaseText(phase, running) {
  switch (phase) {
    case 'starting':
      return '启动中'
    case 'checking_health':
      return '健康检查中'
    case 'stopping':
      return '停止中'
    case 'restarting':
      return '重启中'
    case 'failed':
      return '启动失败'
    case 'running':
      return '运行中'
    case 'stopped':
    default:
      return running ? '运行中' : '已停止'
  }
}

function getServiceStateClass(phase, running) {
  if (phase === 'failed') return 'failed'
  if (phase === 'starting' || phase === 'checking_health' || phase === 'stopping' || phase === 'restarting') return 'pending'
  return running ? 'running' : 'stopped'
}

export default ServicesTab
