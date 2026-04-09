import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useLogStore, usePackageStore, useConfigStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import './PackageTab.css'

const FALLBACK_DEFAULTS = {
  services: ['api-test'],
  parallelBuild: true,
  maxJobs: 4
}

function PackageTab({ searchInputRef }) {
  const initializedRef = useRef(false)
  const [selectedServices, setSelectedServices] = useState(FALLBACK_DEFAULTS.services)
  const [parallelBuild, setParallelBuild] = useState(FALLBACK_DEFAULTS.parallelBuild)
  const [maxJobs, setMaxJobs] = useState(FALLBACK_DEFAULTS.maxJobs)
  const [serviceImageVersions, setServiceImageVersions] = useState({})

  const { clearPackageLogs } = useLogStore()
  const { resolved } = useConfigStore()
  const {
    options,
    optionsLoading,
    currentTask,
    activeLoading,
    fetchOptions,
    fetchActiveTask,
    startPackage
  } = usePackageStore()

  useEffect(() => {
    fetchOptions()
    fetchActiveTask()
  }, [fetchOptions, fetchActiveTask])

  useEffect(() => {
    const source = currentTask?.metadata || options?.defaults
    if (!source) {
      return
    }

    if (!initializedRef.current || currentTask?.jobId) {
      initializedRef.current = true
      setSelectedServices(source.services?.length ? source.services : FALLBACK_DEFAULTS.services)
      setParallelBuild(source.parallelBuild ?? FALLBACK_DEFAULTS.parallelBuild)
      setMaxJobs(source.maxJobs ?? FALLBACK_DEFAULTS.maxJobs)
    }
  }, [options?.defaults, currentTask?.jobId, currentTask?.metadata])

  // 从后端 options.services 解析每服务版本（允许覆盖旧值）
  useEffect(() => {
    const resolvedServices = resolved?.services || {}
    const optionServices = options?.services || []
    const versions = {}
    for (const service of optionServices) {
      if (service.imageVersion) {
        versions[service.id] = service.imageVersion
      } else if (resolvedServices[service.id]?.imageVersion) {
        versions[service.id] = resolvedServices[service.id].imageVersion
      }
    }
    if (Object.keys(versions).length > 0) {
      setServiceImageVersions((prev) => ({
        ...prev,
        ...versions
      }))
    }
  }, [options?.services, resolved?.services])

  // 打包完成后，用 nextImageVersions 更新前端版本号
  useEffect(() => {
    const nextVersions = currentTask?.result?.nextImageVersions
    if (currentTask?.status === 'success' && nextVersions && Object.keys(nextVersions).length > 0) {
      setServiceImageVersions((prev) => ({
        ...prev,
        ...nextVersions
      }))
    }
  }, [currentTask?.status, currentTask?.result?.nextImageVersions])

  const services = options?.services || []
  const isRunning = ['pending', 'running'].includes(currentTask?.status)
  const scriptInfo = options?.script || null
  const canStart = !isRunning && !optionsLoading && !activeLoading && scriptInfo?.valid !== false
  const currentStatus = normalizeStatus(currentTask?.status)
  const allSelected = selectedServices.length === services.length && services.length > 0

  const handleToggleService = (serviceId) => {
    if (isRunning) {
      return
    }
    setSelectedServices((current) => (
      current.includes(serviceId)
        ? current.filter((item) => item !== serviceId)
        : [...current, serviceId]
    ))
  }

  const handleSelectAll = () => {
    if (isRunning) return
    setSelectedServices(services.map((s) => s.id))
  }

  const handleDeselectAll = () => {
    if (isRunning) return
    setSelectedServices([])
  }

  const handleServiceVersionChange = (serviceId, value) => {
    setServiceImageVersions((prev) => ({ ...prev, [serviceId]: value }))
  }

  // 获取服务的实际版本（优先用户编辑 > 服务配置 > 种子版本）
  const getServiceVersion = (serviceId) => {
    return serviceImageVersions[serviceId]
      || services.find((s) => s.id === serviceId)?.imageVersion
      || 'v2.10.26.01-lts'
  }

  const handleSubmit = async () => {
    if (selectedServices.length === 0) {
      toast.error('请至少选择一个服务')
      return
    }

    const payload = {
      services: selectedServices,
      serviceImageVersions: selectedServices.reduce((map, serviceId) => {
        const v = getServiceVersion(serviceId)
        if (v) map[serviceId] = v
        return map
      }, {}),
      parallelBuild,
      maxJobs
    }

    try {
      clearPackageLogs()
      const task = await startPackage(payload)
      toast.success(`打包任务已启动：${task.metadata?.services?.join(', ') || selectedServices.join(', ')}`)
    } catch (error) {
      toast.error(error.message || '启动打包任务失败')
    }
  }

  return (
    <div className="package-tab">
      <div className="package-workspace">
        {/* 上方：控制面板 */}
        <section className="card package-control-panel">
          <div className="card-header">
            <div className="batch-actions">
              {isRunning ? (
                <button className="package-toolbar-btn btn-package-running" disabled>
                  <span className="btn-icon-text">⏳</span>
                  打包中...
                </button>
              ) : (
                <button className="package-toolbar-btn btn-package-start" onClick={handleSubmit} disabled={!canStart}>
                  <span className="btn-icon-text">ON</span>
                  开始打包
                </button>
              )}
              {allSelected ? (
                <button className="package-toolbar-btn btn-package-deselect" onClick={handleDeselectAll} disabled={isRunning}>
                  <span className="btn-icon-text">OFF</span>
                  取消全选
                </button>
              ) : (
                <button className="package-toolbar-btn btn-package-select-all" onClick={handleSelectAll} disabled={isRunning}>
                  <span className="btn-icon-text">ALL</span>
                  全选
                </button>
              )}
              <span className={`package-status-chip status-${currentStatus}`}>
                <span className="chip-icon">{statusIcon(currentStatus)}</span>
                {renderStatusText(currentStatus)}
              </span>
              <div className="package-toolbar-params">
                <div className="package-param-item">
                  <span className="package-param-label">线程</span>
                  <input
                    className="package-param-input"
                    type="number"
                    min="1"
                    max="64"
                    value={maxJobs}
                    disabled={isRunning}
                    onChange={(e) => setMaxJobs(e.target.value)}
                  />
                </div>
                <label className={`package-switch ${parallelBuild ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={parallelBuild}
                    disabled={isRunning}
                    onChange={(e) => setParallelBuild(e.target.checked)}
                  />
                  <span className="package-switch-text">并行</span>
                </label>
              </div>
              <span className="package-param-label" style={{ marginLeft: 'auto' }}>
                {selectedServices.length}/{services.length}
              </span>
            </div>
          </div>

          {/* 状态条（仅运行/完成/失败时显示） */}
          {currentTask && <PackageStatusStrip task={currentTask} status={currentStatus} />}

          {/* 脚本不可用警告 */}
          {!scriptInfo?.valid && (
            <div className="package-warning">
              <strong>脚本不可用：</strong>
              <span>{scriptInfo?.error || '未找到打包脚本'}</span>
            </div>
          )}

          {/* 服务选择网格 */}
          <div className="package-service-grid">
            {services.map((service, index) => {
              const checked = selectedServices.includes(service.id)
              const serviceVersion = getServiceVersion(service.id)
              return (
                <div
                  key={service.id}
                  className={`package-service-card ${checked ? 'selected' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <button
                    className="package-service-btn"
                    onClick={() => handleToggleService(service.id)}
                    disabled={isRunning}
                  >
                    <div className="package-service-content">
                      <div className="package-service-info">
                        <span className={`package-service-icon ${checked ? 'checked' : ''}`}>
                          {checked ? '●' : '○'}
                        </span>
                        <span className="package-service-name">{service.name}</span>
                      </div>
                      {checked && (
                        <span className="package-service-version-badge">{serviceVersion}</span>
                      )}
                    </div>
                  </button>
                  {checked && (
                    <div className="package-service-version" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="package-service-version-input"
                        type="text"
                        value={serviceImageVersions[service.id] || ''}
                        placeholder={serviceVersion}
                        disabled={isRunning}
                        onChange={(e) => handleServiceVersionChange(service.id, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* 下方：日志面板 */}
        <aside className="card log-card package-log-panel">
          <div className="card-header">
            <h2 className="card-title">打包日志</h2>
          </div>
          <LogViewer type="package" searchInputRef={searchInputRef} />
        </aside>
      </div>
    </div>
  )
}

/* ── 状态条组件 ── */
function PackageStatusStrip({ task, status }) {
  if (!task) {
    return (
      <div className="package-status-strip">
        <span className="package-status-chip status-idle">
          <span className="chip-icon">○</span>
          待命
        </span>
        <span className="package-status-message">选择服务后点击"开始打包"</span>
      </div>
    )
  }

  const hasError = task.error?.message

  return (
    <div className="package-status-strip">
      <span className={`package-status-chip status-${status}`}>
        <span className="chip-icon">{statusIcon(status)}</span>
        {renderStatusText(status)}
      </span>
      {task.metadata?.services && (
        <span className="package-version-chip">
          {task.metadata.services.length} 个服务
        </span>
      )}
      {task.metadata?.serviceImageVersions && (
        Object.entries(task.metadata.serviceImageVersions).map(([id, ver]) => (
          <span key={id} className="package-version-chip">{id}: {ver}</span>
        ))
      )}
      {task.result?.nextImageVersions && (
        Object.entries(task.result.nextImageVersions).map(([id, ver]) => (
          <span key={id} className="package-version-chip version-next">{id}: {ver}</span>
        ))
      )}
      {task.result?.exitCode !== undefined && (
        <span className="package-version-chip">退出码: {task.result.exitCode}</span>
      )}
      <span className={`package-status-message ${hasError ? 'has-error' : ''}`}>
        {hasError ? `错误：${task.error.message}` : (task.message || '')}
      </span>
    </div>
  )
}

/* ── 工具函数 ── */
function statusIcon(status) {
  switch (status) {
    case 'running': return '●'
    case 'success': return '✓'
    case 'failed': return '✕'
    default: return '○'
  }
}

function renderStatusText(status) {
  switch (status) {
    case 'running': return '运行中'
    case 'success': return '成功'
    case 'failed': return '失败'
    default: return '待命'
  }
}

function normalizeStatus(status) {
  if (status === 'completed') {
    return 'success'
  }
  return status || 'idle'
}

export default PackageTab
