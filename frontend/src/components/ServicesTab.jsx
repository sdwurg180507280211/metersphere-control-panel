import { useEffect, useCallback, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useServiceStore, useWebSocketStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import ConfirmDialog from './ConfirmDialog'
import './ServicesTab.css'

const STATE_CONFIG = {
  running: { icon: '●', color: '#52c41a', text: '运行中', class: 'running' },
  stopped: { icon: '○', color: '#8c8c8c', text: '已停止', class: 'stopped' },
  starting: { icon: '◐', color: '#faad14', text: '启动中', class: 'starting' },
  stopping: { icon: '◑', color: '#fa8c16', text: '停止中', class: 'stopping' },
  failed: { icon: '✕', color: '#ff4d4f', text: '失败', class: 'failed' },
  restarting: { icon: '↻', color: '#722ed1', text: '重启中', class: 'restarting' }
}

function ServicesTab() {
  const { catalog, services, loading, fetchCatalog, fetchServices, setLoading, updateServiceStatus } = useServiceStore()
  const { connected } = useWebSocketStore()
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, action: '', title: '', message: '' })

  useEffect(() => {
    fetchCatalog()
    fetchServices()
  }, [fetchCatalog, fetchServices])

  useEffect(() => {
    if (connected) return undefined
    const interval = setInterval(fetchServices, 5000)
    return () => clearInterval(interval)
  }, [connected, fetchServices])

  const toggleService = useCallback(async (serviceId) => {
    const serviceStatus = services[serviceId] || { running: false, phase: 'stopped' }
    const isRunning = serviceStatus.running

    setLoading(serviceId, true)

    try {
      const endpoint = `/api/services/${serviceId}/${isRunning ? 'stop' : 'start'}`
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        toast.success(`${isRunning ? '停止' : '启动'}命令已发送`)
        updateServiceStatus(serviceId, {
          ...serviceStatus,
          phase: isRunning ? 'stopping' : 'starting',
          running: false,
          error: null
        })
        if (!connected) setTimeout(fetchServices, 2000)
      } else {
        toast.error(data.error || '操作失败')
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
      const res = await fetch(`/api/services/${serviceId}/restart`, { method: 'POST' })
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

  const handleBatchAction = useCallback((action) => {
    const labels = { start: '启动', stop: '停止', restart: '重启' }
    setConfirmDialog({
      isOpen: true,
      action,
      title: `确认${labels[action]}全部服务`,
      message: `确定要${labels[action]}所有服务吗？`
    })
  }, [])

  const confirmBatchAction = useCallback(async () => {
    const { action } = confirmDialog
    setConfirmDialog({ isOpen: false, action: '', title: '', message: '' })
    
    const labels = { start: '启动', stop: '停止', restart: '重启' }
    const phaseMap = { start: 'starting', stop: 'stopping', restart: 'restarting' }

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
      fetch(`/api/services/${action}-all`, { method: 'POST' }).then(r => r.json()),
      {
        loading: `正在${labels[action]}所有服务...`,
        success: `${labels[action]}命令已发送`,
        error: `${labels[action]}失败`
      }
    )

    if (!connected) setTimeout(fetchServices, action === 'restart' ? 7000 : 5000)
  }, [confirmDialog, catalog, services, updateServiceStatus, connected, fetchServices])

  const runningCount = catalog.filter((s) => services[s.id]?.running).length

  return (
    <div className="page-container">
      {/* 顶部：服务列表 */}
      <div className="top-section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-title-icon">⚙️</span>
            服务管理
            <span className="section-count">{runningCount}/{catalog.length}</span>
          </div>
          <div className="section-actions">
            <button className="btn btn-primary btn-sm" onClick={() => handleBatchAction('start')}>🚀 启动全部</button>
            <button className="btn btn-default btn-sm" onClick={() => handleBatchAction('restart')}>🔄 重启</button>
            <button className="btn btn-danger btn-sm" onClick={() => handleBatchAction('stop')}>🛑 停止</button>
          </div>
        </div>
        <div className="section-body">
          <div className="services-grid">
            {catalog.map((service) => {
              const status = services[service.id] || { running: false, phase: 'stopped' }
              const config = STATE_CONFIG[status.phase] || STATE_CONFIG[status.running ? 'running' : 'stopped']
              const isLoading = loading[service.id]

              return (
                <div
                  key={service.id}
                  className={`service-item ${config.class}`}
                  onClick={() => !isLoading && toggleService(service.id)}
                >
                  <div className="service-item-left">
                    <span 
                      className={`service-status-icon ${['starting', 'stopping', 'restarting'].includes(status.phase) ? 'spinning' : ''}`}
                      style={{ color: config.color }}
                    >
                      {isLoading ? '⏳' : config.icon}
                    </span>
                    <span className="service-name">{service.name}</span>
                  </div>
                  {status.running && !isLoading && (
                    <div className="service-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="icon-btn" onClick={(e) => handleRestart(service.id, e)} title="重启">🔄</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 底部：服务日志 */}
      <div className="bottom-section">
        <LogViewer type="service" />
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.action === 'stop' ? 'danger' : 'warning'}
        onConfirm={confirmBatchAction}
        onCancel={() => setConfirmDialog({ isOpen: false, action: '', title: '', message: '' })}
      />
    </div>
  )
}

export default ServicesTab
