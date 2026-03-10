import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useLogStore, usePackageStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import EmptyState from './EmptyState'
import './PackageTab.css'

const RECENT_IMAGE_STORAGE_KEY = 'ms-control-panel:package-recent-image-versions'
const MAX_RECENT_IMAGE_VERSIONS = 5
const FALLBACK_DEFAULTS = {
  services: ['api-test'],
  imageVersion: 'v2.10.26.09-lts',
  parallelBuild: true,
  maxJobs: 4
}

function PackageTab({ searchInputRef }) {
  const initializedRef = useRef(false)
  const [selectedServices, setSelectedServices] = useState(FALLBACK_DEFAULTS.services)
  const [imageVersion, setImageVersion] = useState(FALLBACK_DEFAULTS.imageVersion)
  const [parallelBuild, setParallelBuild] = useState(FALLBACK_DEFAULTS.parallelBuild)
  const [maxJobs, setMaxJobs] = useState(FALLBACK_DEFAULTS.maxJobs)
  const [recentImageVersions, setRecentImageVersions] = useState(() => loadRecentImageVersions())
  const [showLogModal, setShowLogModal] = useState(false)

  const { clearPackageLogs } = useLogStore()
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
      setImageVersion(source.imageVersion || FALLBACK_DEFAULTS.imageVersion)
      setParallelBuild(source.parallelBuild ?? FALLBACK_DEFAULTS.parallelBuild)
      setMaxJobs(source.maxJobs ?? FALLBACK_DEFAULTS.maxJobs)
    }
  }, [options?.defaults, currentTask?.jobId, currentTask?.metadata])

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
    { label: '最近镜像', value: recentImageVersions[0] || defaults.imageVersion },
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

  const handleSubmit = async () => {
    if (selectedServices.length === 0) {
      toast.error('请至少选择一个服务，第一阶段不支持空选择触发全量打包')
      return
    }

    const payload = {
      services: selectedServices,
      imageVersion: imageVersion.trim(),
      parallelBuild,
      maxJobs
    }

    try {
      clearPackageLogs()
      const task = await startPackage(payload)
      const nextRecent = saveRecentImageVersion(imageVersion.trim())
      setRecentImageVersions(nextRecent)
      toast.success(`打包任务已启动：${task.metadata?.services?.join(', ') || selectedServices.join(', ')}`)
    } catch (error) {
      toast.error(error.message || '启动打包任务失败')
    }
  }

  return (
    <div className="package-tab">
      <div className="package-hero">
        <section className="package-main-card">
          <div className="package-main-header">
            <div>
              <h3 className="section-title">打包配置</h3>
              <p className="package-subtitle">执行外部 `metersphere-build.sh`，参数语义保持与人工命令一致。</p>
            </div>
            <div className="package-header-pills">
              <span className="package-pill">{services.length} 个服务</span>
              <span className="package-pill package-pill-accent">默认镜像 {defaults.imageVersion}</span>
            </div>
          </div>

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
                <div className="package-block-desc">显式选择脚本位置参数，空选择不会触发全量打包。</div>
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
                  </div>
                )
              })}
            </div>
          </div>

          <div className="package-params-grid">
            <div className="package-field">
              <label className="package-label" htmlFor="package-max-jobs">线程数 (`MAX_JOBS`)</label>
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
              <p className="package-field-tip">建议按机器性能设置，默认 4。</p>
            </div>

            <div className="package-field package-field-large">
              <label className="package-label" htmlFor="package-image-version">镜像版本 (`IMAGE_VERSION`)</label>
              <input
                id="package-image-version"
                className="package-input"
                type="text"
                list="package-image-versions"
                value={imageVersion}
                disabled={isRunning}
                onChange={(event) => setImageVersion(event.target.value)}
                placeholder={defaults.imageVersion}
              />
              <datalist id="package-image-versions">
                {recentImageVersions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              {recentImageVersions.length > 0 && (
                <div className="package-recent-list">
                  {recentImageVersions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`package-recent-item ${item === imageVersion ? 'active' : ''}`}
                      onClick={() => setImageVersion(item)}
                      disabled={isRunning}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="package-field">
              <label className="package-label">并行构建 (`PARALLEL_BUILD`)</label>
              <label className={`package-switch ${parallelBuild ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={parallelBuild}
                  disabled={isRunning}
                  onChange={(event) => setParallelBuild(event.target.checked)}
                />
                <span className="package-switch-text">{parallelBuild ? '已开启' : '已关闭'}</span>
              </label>
              <p className="package-field-tip">开启后速度更快，但更占机器资源。</p>
            </div>
          </div>
        </section>

        <aside className="package-side-panel">
          <section className="package-action-card">
            <div className="package-block-header compact">
              <div>
                <div className="package-block-title">执行面板</div>
                <div className="package-block-desc">确认参数后发起整体验证打包。</div>
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
              <div className="package-summary-item">
                <span className="package-summary-label">镜像版本</span>
                <strong>{imageVersion || defaults.imageVersion}</strong>
              </div>
              <div className="package-summary-item">
                <span className="package-summary-label">线程数</span>
                <strong>{maxJobs}</strong>
              </div>
              <div className="package-summary-item">
                <span className="package-summary-label">构建模式</span>
                <strong>{parallelBuild ? '并行' : '串行'}</strong>
              </div>
            </div>

            <div className="package-inline-note">
              <span className="package-inline-label">脚本路径</span>
              <code className="package-inline-code">{scriptInfo?.resolvedPath || '未解析'}</code>
            </div>
          </section>

          {currentTask && (
            <section className="package-status-section">
              <div className="package-block-header compact">
                <div>
                  <div className="package-block-title">任务状态</div>
                  <div className="package-block-desc">状态、心跳、退出码都在这里。</div>
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
                  <div className="package-status-meta-item">
                    <span>镜像版本</span>
                    <strong>{currentTask.metadata?.imageVersion || '-'}</strong>
                  </div>
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
                </div>
                {currentTask.error?.message && (
                  <div className="package-status-error">错误：{currentTask.error.message}</div>
                )}
              </div>
            </section>
          )}
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

function loadRecentImageVersions() {
  try {
    const rawValue = window.localStorage.getItem(RECENT_IMAGE_STORAGE_KEY)
    if (!rawValue) {
      return []
    }

    const values = JSON.parse(rawValue)
    return Array.isArray(values) ? values.filter(Boolean).slice(0, MAX_RECENT_IMAGE_VERSIONS) : []
  } catch (error) {
    return []
  }
}

function saveRecentImageVersion(imageVersion) {
  const normalized = String(imageVersion || '').trim()
  if (!normalized) {
    return loadRecentImageVersions()
  }

  const nextValues = [normalized, ...loadRecentImageVersions().filter((item) => item !== normalized)]
    .slice(0, MAX_RECENT_IMAGE_VERSIONS)

  window.localStorage.setItem(RECENT_IMAGE_STORAGE_KEY, JSON.stringify(nextValues))
  return nextValues
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
