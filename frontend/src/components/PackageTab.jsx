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
  }, [options?.defaults, currentTask?.jobId])

  const defaults = options?.defaults || FALLBACK_DEFAULTS
  const services = options?.services || []
  const isRunning = ['pending', 'running'].includes(currentTask?.status)
  const scriptInfo = options?.script || null
  const selectedServiceNames = useMemo(() => {
    const serviceMap = new Map(services.map((item) => [item.id, item.name]))
    return selectedServices.map((item) => serviceMap.get(item) || item)
  }, [selectedServices, services])

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
      <section className="package-control">
        <div className="package-control-header">
          <div>
            <h3 className="section-title">📦 打包配置</h3>
            <p className="package-subtitle">执行外部 `metersphere-build.sh`，参数语义保持与人工命令一致。</p>
          </div>
          <div className="package-header-actions">
            {isRunning && (
              <span className="package-running-indicator">
                <span className="pulse-dot" /> 运行中
              </span>
            )}
            <button
              className="module-btn btn-ripple"
              onClick={handleSubmit}
              disabled={isRunning || optionsLoading || activeLoading}
            >
              {isRunning ? '⏳ 打包中...' : '▶️ 开始打包'}
            </button>
          </div>
        </div>

        {!scriptInfo?.valid && (
          <div className="package-warning">
            <strong>脚本不可用：</strong>
            <span>{scriptInfo?.error || '未找到打包脚本'}</span>
          </div>
        )}

        <div className="package-form-grid">
          <div className="package-field package-field-wide">
            <label className="package-label">目标服务</label>
            <div className="package-service-panel">
              <div className="package-selected-summary">
                {selectedServiceNames.length > 0 ? selectedServiceNames.join('、') : '请选择至少一个服务'}
              </div>
              <div className="package-service-list">
                {services.map((service) => {
                  const checked = selectedServices.includes(service.id)
                  return (
                    <label key={service.id} className={`package-service-item ${checked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleService(service.id)}
                        disabled={isRunning}
                      />
                      <span className="package-service-name">{service.name}</span>
                      <span className="package-service-id">{service.id}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <p className="package-hint">默认必须显式选择服务；空选择不会触发全量打包。</p>
          </div>

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
          </div>

          <div className="package-field">
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
                    className="package-recent-item"
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
            <label className="package-switch">
              <input
                type="checkbox"
                checked={parallelBuild}
                disabled={isRunning}
                onChange={(event) => setParallelBuild(event.target.checked)}
              />
              <span>{parallelBuild ? '已开启' : '已关闭'}</span>
            </label>
          </div>
        </div>

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
            <span className="package-summary-label">并行构建</span>
            <strong>{parallelBuild ? 'true' : 'false'}</strong>
          </div>
        </div>
      </section>

      <section className="package-status-section">
        <div className="log-header">
          <h3 className="section-title">📡 任务状态</h3>
        </div>
        {currentTask ? (
          <div className="package-status-card">
            <div className="package-status-row">
              <span className={`package-status-badge status-${normalizeStatus(currentTask.status)}`}>
                {renderStatusText(currentTask.status)}
              </span>
              <span className="package-status-message">{currentTask.message || '等待日志输出'}</span>
            </div>
            <div className="package-status-meta">
              <span>任务 ID：{currentTask.jobId}</span>
              <span>服务：{currentTask.metadata?.services?.join(', ') || '-'}</span>
              <span>镜像版本：{currentTask.metadata?.imageVersion || '-'}</span>
              <span>线程数：{currentTask.metadata?.maxJobs ?? '-'}</span>
              <span>并行构建：{String(currentTask.metadata?.parallelBuild ?? false)}</span>
              {currentTask.result?.exitCode !== undefined && <span>退出码：{currentTask.result.exitCode}</span>}
              {currentTask.metadata?.lastHeartbeatAt && <span>最近心跳：{formatDateTime(currentTask.metadata.lastHeartbeatAt)}</span>}
              {currentTask.error?.message && <span className="package-status-error">错误：{currentTask.error.message}</span>}
            </div>
          </div>
        ) : (
          <div className="package-status-empty">
            <EmptyState type="logs" />
          </div>
        )}
      </section>

      <section className="package-log-section">
        <div className="log-header">
          <h3 className="section-title">📝 打包日志</h3>
        </div>
        <LogViewer type="package" searchInputRef={searchInputRef} />
      </section>
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
