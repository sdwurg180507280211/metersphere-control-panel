import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useLogStore, usePackageStore, useConfigStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import EmptyState from './EmptyState'
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
  const [showLogModal, setShowLogModal] = useState(false)
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

  const defaults = options?.defaults || FALLBACK_DEFAULTS
  const services = options?.services || []
  const isRunning = ['pending', 'running'].includes(currentTask?.status)
  const scriptInfo = options?.script || null
  const canStart = !isRunning && !optionsLoading && !activeLoading && scriptInfo?.valid !== false
  const selectedServiceNames = useMemo(() => {
    const serviceMap = new Map(services.map((item) => [item.id, item.name]))
    return selectedServices.map((item) => serviceMap.get(item) || item)
  }, [selectedServices, services])
  const currentStatus = normalizeStatus(currentTask?.status)
  const currentStatusText = renderStatusText(currentTask?.status)
  const summaryCards = [
    { label: '已选服务', value: selectedServices.length },
    { label: '任务状态', value: currentStatusText },
    { label: '并行模式', value: parallelBuild ? '并行' : '串行' }
  ]

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
      toast.error('请至少选择一个服务，第一阶段不支持空选择触发全量打包')
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
      <div className="package-hero">
        <section className="package-main-card">
          {!scriptInfo?.valid && (
            <div className="package-warning">
              <strong>脚本不可用：</strong>
              <span>{scriptInfo?.error || '未找到打包脚本'}</span>
            </div>
          )}

          <div className="package-service-card">
            <div className="package-block-header">
              <div>
                <div className="package-block-title">目标服务</div>
              </div>
              <span className="package-selection-count">已选 {selectedServices.length}</span>
            </div>

            <div className="package-selected-chips">
              {selectedServiceNames.length > 0 ? selectedServiceNames.map((name, index) => (
                <span key={`${name}-${index}`} className="package-chip">{name}</span>
              )) : (
                <span className="package-chip package-chip-muted">请选择至少一个服务</span>
              )}
            </div>

            <div className="package-service-list">
              {services.map((service, index) => {
                const checked = selectedServices.includes(service.id)
                const serviceVersion = getServiceVersion(service.id)
                return (
                  <div
                    key={service.id}
                    className={`package-service-card ${checked ? 'selected' : ''}`}
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <button
                      className="package-service-btn"
                      onClick={() => handleToggleService(service.id)}
                      disabled={isRunning}
                    >
                      <div className="package-service-content">
                        <div className="package-service-main">
                          <span className={`package-service-icon ${checked ? 'checked' : ''}`}>
                            {checked ? '✓' : '○'}
                          </span>
                          <span className="package-service-name">{service.name}</span>
                        </div>
                        <span className="package-service-id">{service.id}</span>
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
          </div>

          <div className="package-params-grid">
            <div className="package-field">
              <label className="package-label" htmlFor="package-max-jobs">线程数</label>
              <input
                id="package-max-jobs"
                className="package-input"
                type="number"
                min="1"
                max="64"
                value={maxJobs}
                disabled={isRunning}
                onChange={(event) => setMaxJobs(event.target.value)}
              />
            </div>

            <div className="package-field">
              <label className="package-label">并行构建</label>
              <label className={`package-switch ${parallelBuild ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={parallelBuild}
                  disabled={isRunning}
                  onChange={(event) => setParallelBuild(event.target.checked)}
                />
                <span className="package-switch-text">{parallelBuild ? '已开启' : '已关闭'}</span>
              </label>
            </div>
          </div>
        </section>

        <aside className="package-side-panel">
          {currentTask && (
            <section className="package-status-section">
              <div className="package-block-header compact">
                <div>
                  <div className="package-block-title">任务状态</div>
                </div>
                <span className={`package-status-badge status-${currentStatus}`}>{currentStatusText}</span>
              </div>

              <div className="package-status-card">
                <div className="package-status-highlight">{currentTask.message || '等待日志输出'}</div>
                <div className="package-status-meta-grid">
                  <div className="package-status-meta-item">
                    <span>服务</span>
                    <strong>{currentTask.metadata?.services?.join(', ') || '-'}</strong>
                  </div>
                  {currentTask.metadata?.serviceImageVersions && (
                    <div className="package-status-meta-item package-status-meta-wide">
                      <span>镜像版本</span>
                      <div className="package-version-list">
                        {Object.entries(currentTask.metadata.serviceImageVersions).map(([id, ver]) => (
                          <span key={id} className="package-version-tag">{id}: {ver}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="package-status-meta-item">
                    <span>线程数</span>
                    <strong>{currentTask.metadata?.maxJobs ?? '-'}</strong>
                  </div>
                  <div className="package-status-meta-item">
                    <span>最近心跳</span>
                    <strong>{formatDateTime(currentTask.metadata?.lastHeartbeatAt)}</strong>
                  </div>
                  {currentTask.result?.exitCode !== undefined && (
                    <div className="package-status-meta-item">
                      <span>退出码</span>
                      <strong>{currentTask.result.exitCode}</strong>
                    </div>
                  )}
                  {currentTask.result?.nextImageVersions && (
                    <div className="package-status-meta-item package-status-meta-wide">
                      <span>递增后版本</span>
                      <div className="package-version-list">
                        {Object.entries(currentTask.result.nextImageVersions).map(([id, ver]) => (
                          <span key={id} className="package-version-tag version-next">{id}: {ver}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {currentTask.error?.message && (
                  <div className="package-status-error">错误：{currentTask.error.message}</div>
                )}
              </div>
            </section>
          )}

          <section className="package-action-card">
            <div className="package-block-header compact">
              <div>
                <div className="package-block-title">执行面板</div>
              </div>
              {isRunning && (
                <span className="package-running-indicator">
                  <span className="pulse-dot" /> 运行中
                </span>
              )}
            </div>

            <button
              className="package-primary-btn"
              onClick={handleSubmit}
              disabled={!canStart}
            >
              {isRunning ? '⏳ 打包中...' : '▶️ 开始打包'}
            </button>

            <button
              className="package-secondary-btn"
              onClick={() => setShowLogModal(true)}
            >
              📋 查看日志
            </button>

            <div className="package-summary-card">
              <div className="package-summary-item">
                <span className="package-summary-label">本次服务</span>
                <strong>{selectedServices.join(', ') || defaults.services.join(', ')}</strong>
              </div>
              {selectedServices.length > 0 && (
                <div className="package-summary-item package-summary-wide">
                  <span className="package-summary-label">镜像版本</span>
                  <div className="package-version-list">
                    {selectedServices.map((id) => {
                      const sv = getServiceVersion(id)
                      const name = services.find((s) => s.id === id)?.name || id
                      return (
                        <span key={id} className="package-version-tag">
                          {name}: {sv}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className="package-summary-item">
                <span className="package-summary-label">线程数</span>
                <strong>{maxJobs}</strong>
              </div>
              <div className="package-summary-item">
                <span className="package-summary-label">构建模式</span>
                <strong>{parallelBuild ? '并行' : '串行'}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {showLogModal && (
        <div className="log-modal-overlay" onClick={() => setShowLogModal(false)}>
          <div className="log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <h3>打包日志</h3>
              <button className="log-modal-close" onClick={() => setShowLogModal(false)}>✕</button>
            </div>
            <div className="log-modal-body">
              <LogViewer type="package" searchInputRef={searchInputRef} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderStatusText(status) {
  switch (normalizeStatus(status)) {
    case 'running':
      return '运行中'
    case 'success':
      return '成功'
    case 'failed':
      return '失败'
    default:
      return '待命'
  }
}

function normalizeStatus(status) {
  if (status === 'completed') {
    return 'success'
  }

  return status || 'idle'
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch (error) {
    return value
  }
}

export default PackageTab
