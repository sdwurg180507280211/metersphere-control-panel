import { useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useServiceStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import './ServicesTab.css'

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

  useEffect(() => {
    fetchCatalog()
    fetchServices()
    const interval = setInterval(fetchServices, 5000)
    return () => clearInterval(interval)
  }, [fetchCatalog, fetchServices])

  const toggleService = useCallback(async (serviceId) => {
    const isRunning = services[serviceId]
    const action = isRunning ? '停止' : '启动'

    setLoading(serviceId, true)

    try {
      const endpoint = `/api/services/${serviceId}/${isRunning ? 'stop' : 'start'}`
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        toast.success(`${action}命令已发送`)
        updateServiceStatus(serviceId, !isRunning)
        setTimeout(fetchServices, 2000)
      } else {
        toast.error(data.error || `${action}失败`)
      }
    } catch (error) {
      toast.error(`网络错误: ${error.message}`)
    } finally {
      setTimeout(() => setLoading(serviceId, false), 2000)
    }
  }, [services, setLoading, updateServiceStatus, fetchServices])

  const handleBatchAction = useCallback(async (action) => {
    const endpoint = action === 'start' ? '/api/services/start-all' : '/api/services/stop-all'

    toast.promise(
      fetch(endpoint, { method: 'POST' }).then((response) => response.json()),
      {
        loading: `正在${action === 'start' ? '启动' : '停止'}所有服务...`,
        success: '命令已发送',
        error: '操作失败'
      }
    )

    setTimeout(fetchServices, 5000)
  }, [fetchServices])

  const runningCount = catalog.filter((service) => services[service.id]).length

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
            <button className="btn-batch btn-stop" onClick={() => handleBatchAction('stop')}>
              停止全部
            </button>
          </div>
        </div>
        <div className="btn-grid">
          {catalog.map((service) => {
            const isRunning = services[service.id]
            const isLoading = loading[service.id]

            return (
              <button
                key={service.id}
                className={`btn-service ${isRunning ? 'running' : 'stopped'}`}
                onClick={() => toggleService(service.id)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="loading"></span>
                ) : (
                  <>
                    <span className="status-dot"></span>
                    {service.name}
                  </>
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

export default ServicesTab
