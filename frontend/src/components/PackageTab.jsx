import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
  const [releaseContent, setReleaseContent] = useState('')
  const [historyVisible, setHistoryVisible] = useState(false)

  const { clearPackageLogs } = useLogStore()
  const { resolved } = useConfigStore()
  const {
    options,
    optionsLoading,
    currentTask,
    activeLoading,
    fetchOptions,
    fetchActiveTask,
    startPackage,
    history,
    historyTotal,
    historyLoading,
    historyError,
    fetchHistory,
    updateChangelog
  } = usePackageStore()

  useEffect(() => {
    fetchOptions()
    fetchActiveTask()
  }, [fetchOptions, fetchActiveTask])

  // 初次加载历史记录
  useEffect(() => {
    if (historyVisible && history.length === 0) {
      fetchHistory({ page: 1, pageSize: 20 })
    }
  }, [historyVisible, history.length, fetchHistory])

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
      maxJobs,
      changelog: releaseContent.trim()
    }

    try {
      clearPackageLogs()
      const task = await startPackage(payload)
      setReleaseContent('')
      toast.success(`打包任务已启动：${task.metadata?.services?.join(', ') || selectedServices.join(', ')}`)
    } catch (error) {
      toast.error(error.message || '启动打包任务失败')
    }
  }

  const handleLoadMoreHistory = useCallback(() => {
    if (historyLoading || history.length >= historyTotal) return
    const nextPage = Math.floor(history.length / 20) + 1
    fetchHistory({ page: nextPage, pageSize: 20 })
  }, [historyLoading, history.length, historyTotal, fetchHistory])

  const handleRetryHistory = useCallback(() => {
    fetchHistory({ page: 1, pageSize: 20 })
  }, [fetchHistory])

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
              <button
                className={`package-toolbar-btn btn-package-history ${historyVisible ? 'active' : ''}`}
                onClick={() => setHistoryVisible(!historyVisible)}
              >
                <span className="btn-icon-text">HIST</span>
                发布记录
              </button>
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

          <div className="package-release-content-field">
            <label className="package-release-content-label" htmlFor="package-release-content">
              本次上线内容
            </label>
            <textarea
              id="package-release-content"
              className="package-release-content-textarea"
              value={releaseContent}
              disabled={isRunning}
              rows={3}
              maxLength={5000}
              placeholder="可选，输入本次打包/上线内容；发布记录会优先展示这里填写的内容"
              onChange={(e) => setReleaseContent(e.target.value)}
            />
          </div>

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
        <div className="package-bottom-panels">
          <aside className="card log-card package-log-panel">
            <div className="card-header">
              <h2 className="card-title">打包日志</h2>
            </div>
            <LogViewer type="package" searchInputRef={searchInputRef} />
          </aside>
        </div>

        {historyVisible && (
          <div className="package-history-modal-backdrop" onClick={() => setHistoryVisible(false)}>
            <aside
              className="card package-history-panel package-history-modal"
              role="dialog"
              aria-modal="true"
              aria-label="发布记录"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="card-header">
                <div className="package-history-title-group">
                  <h2 className="card-title">发布记录</h2>
                  <span className="package-history-count">{historyTotal} 条</span>
                </div>
                <button
                  className="package-history-close-btn"
                  onClick={() => setHistoryVisible(false)}
                  aria-label="关闭发布记录"
                >
                  ×
                </button>
              </div>
              <div className="package-history-list">
                {historyError && history.length === 0 ? (
                  <div className="package-history-error-state">
                    <span className="package-history-error-msg">{historyError}</span>
                    <button
                      className="package-history-retry-btn"
                      onClick={handleRetryHistory}
                    >
                      重试
                    </button>
                  </div>
                ) : historyLoading && history.length === 0 ? (
                  <div className="package-history-empty">加载中...</div>
                ) : history.length === 0 ? (
                  <div className="package-history-empty">暂无发布记录</div>
                ) : (
                  <>
                    {historyError && (
                      <div className="package-history-error-banner">
                        <span>{historyError}</span>
                        <button className="package-history-retry-btn" onClick={handleRetryHistory}>重试</button>
                      </div>
                    )}
                    {history.map((record) => (
                      <PackageHistoryItem
                        key={record.id}
                        record={record}
                        updateChangelog={updateChangelog}
                      />
                    ))}
                    {history.length < historyTotal && (
                      <button
                        className="package-history-load-more"
                        onClick={handleLoadMoreHistory}
                        disabled={historyLoading}
                      >
                        {historyLoading ? '加载中...' : '加载更多'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </aside>
          </div>
        )}

      </div>
    </div>
  )
}

/* ── 历史记录项组件（发布记录视图） ── */
function PackageHistoryItem({ record, updateChangelog }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(record.changelog || '')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  const handleSaveChangelog = async () => {
    setSaving(true)
    try {
      const nextValue = editValue.slice(0, 5000)
      const result = await updateChangelog(record.id, nextValue)
      if (result.success) {
        setEditing(false)
        toast.success('上线内容已保存')
      } else {
        toast.error(result.error?.message || '保存失败')
      }
    } catch (error) {
      toast.error(error.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditValue(record.changelog || '')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSaveChangelog()
    }
    if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const imageVersions = record.imageVersions
  const recordServices = record.services
  const releaseItems = record.releaseItems
  const commits = record.commits
  const changedFiles = record.changedFiles
  const changeSummary = record.changeSummary
  const metadataWarnings = record.metadataWarnings
  const errorCode = record.errorCode
  const errorMessage = record.errorMessage
  const errorDetails = record.errorDetails
  const gitBranch = record.gitBranch
  const gitCommit = record.gitCommit
  const gitSubject = record.gitSubject
  const previousSuccessCommit = record.previousSuccessCommit
  const durationMs = record.durationMs
  const createdAt = record.createdAt
  const exitCode = record.exitCode
  const changelog = typeof record.changelog === 'string' ? record.changelog.trim() : ''

  const statusMeta = getHistoryStatusMeta(record.status)
  const statusClass = statusMeta.className
  const statusLabel = statusMeta.label
  const duration = durationMs ? formatDuration(durationMs) : '-'
  const time = createdAt ? formatTime(createdAt) : '-'
  const shortCommit = gitCommit ? gitCommit.substring(0, 8) : null
  const shortPreviousCommit = previousSuccessCommit ? previousSuccessCommit.substring(0, 8) : null
  const serviceCount = Array.isArray(recordServices) ? recordServices.length : 0
  const versionSummary = buildVersionSummary(imageVersions, recordServices)
  const changelogSummary = changelog ? compactText(changelog, 80) : null

  // 变更统计合集
  const changeStats = useMemo(() => {
    if (!changeSummary || Object.keys(changeSummary).length === 0) return null
    const labels = { frontend: '前端', backend: '后端', database: '数据库', config: '配置', docs: '文档', test: '测试', other: '其他' }
    return Object.entries(changeSummary).map(([cat, data]) => ({
      cat,
      label: labels[cat] || cat,
      total: data.total
    }))
  }, [changeSummary])

  return (
    <div className={`package-history-item ${statusClass}`}>
      <div className="package-history-item-header" onClick={() => setExpanded(!expanded)}>
        <span className="package-history-id">#{record.id}</span>
        <span className={`package-history-status ${statusClass}`}>
          {statusLabel}
        </span>
        <span className="package-history-time">{time}</span>
        <span className="package-history-duration">{duration}</span>
        {serviceCount > 0 && (
          <span className="package-history-services">{serviceCount} 个服务</span>
        )}
        {versionSummary && (
          <span className="package-history-version-summary" title={versionSummary}>{versionSummary}</span>
        )}
        <span
          className={`package-history-changelog-summary ${changelogSummary ? '' : 'empty'}`}
          title={changelog || '未填写上线内容'}
        >
          {changelogSummary || '未填写上线内容'}
        </span>
        <span className={`package-history-expand ${expanded ? 'expanded' : ''}`}>▸</span>
      </div>

      {expanded && (
        <div className="package-history-item-detail">
          <div className="package-history-primary">
            <div className="package-history-primary-meta">
              <span>记录 ID: #{record.id}</span>
              <span>Job ID: {record.jobId || '-'}</span>
            </div>

            {/* 本次上线内容 */}
            <div className="package-history-changelog package-history-changelog-primary">
              <div className="package-history-changelog-header">
                <span className="package-history-label">本次上线内容:</span>
                {!editing && (
                  <button
                    className="package-history-changelog-edit-btn"
                    onClick={(e) => { e.stopPropagation(); setEditing(true); setEditValue(record.changelog || '') }}
                  >
                    {record.changelog ? '编辑' : '+ 添加'}
                  </button>
                )}
              </div>
              {editing ? (
                <div className="package-history-changelog-editor">
                  <textarea
                    ref={textareaRef}
                    className="package-history-changelog-textarea"
                    value={editValue}
                    maxLength={5000}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入本次上线/发布内容..."
                    rows={3}
                  />
                  <div className="package-history-changelog-actions">
                    <button
                      className="package-history-changelog-save"
                      onClick={handleSaveChangelog}
                      disabled={saving}
                    >
                      {saving ? '保存中...' : '保存 (Ctrl+Enter)'}
                    </button>
                    <button
                      className="package-history-changelog-cancel"
                      onClick={handleCancelEdit}
                      disabled={saving}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="package-history-changelog-content">
                  {record.changelog || <span className="package-history-changelog-empty">未填写上线内容</span>}
                </div>
              )}
            </div>

            <div className="package-history-section">
              <span className="package-history-label">本次服务版本:</span>
              <div className="package-history-version-list">
                {buildVersionEntries(imageVersions, recordServices).map(([id, ver]) => (
                  <span key={id} className="package-version-tag">{id}: {ver}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Git 自动追溯信息 */}
          {(releaseItems?.length > 0 || gitBranch || gitCommit || gitSubject || commits?.length > 0 || changeStats || changedFiles?.length > 0 || metadataWarnings?.length > 0) && (
            <div className="package-history-section package-history-trace-section">
              <span className="package-history-label">Git 自动追溯（辅助）:</span>
            </div>
          )}

          {/* 自动识别的变更内容 */}
          {releaseItems && releaseItems.length > 0 && (
            <ReleaseItemsView items={releaseItems} />
          )}

          {/* Git 信息 */}
          {(gitBranch || gitCommit || gitSubject) && (
            <div className="package-history-section">
              <span className="package-history-label">Git 信息:</span>
              <div className="package-history-git-info">
                {gitBranch && <span className="git-info-item">分支: <code>{gitBranch}</code></span>}
                {shortPreviousCommit && <span className="git-info-item">上次成功: <code>{shortPreviousCommit}</code></span>}
                {gitCommit && <span className="git-info-item">本次快照: <code>{shortCommit}</code></span>}
                {gitSubject && <span className="git-info-item">提交信息: <span className="git-subject-text">{gitSubject}</span></span>}
              </div>
            </div>
          )}

          {/* Commit 列表 */}
          {commits && commits.length > 0 && (
            <div className="package-history-section">
              <span className="package-history-label">Commits ({commits.length}):</span>
              <div className="package-history-commit-list">
                {commits.slice(0, 10).map((c, i) => (
                  <div key={i} className="commit-item">
                    <code className="commit-hash">{c.hash}</code>
                    <span className="commit-subject">{c.subject}</span>
                    <span className="commit-meta">{c.author} · {c.date ? formatTime(c.date) : ''}</span>
                  </div>
                ))}
                {commits.length > 10 && (
                  <span className="commit-more">...还有 {commits.length - 10} 个 commits</span>
                )}
              </div>
            </div>
          )}

          {/* 变更分类摘要 */}
          {changeStats && (
            <div className="package-history-section">
              <span className="package-history-label">变更统计:</span>
              <div className="package-history-change-summary">
                {changeStats.map((s) => (
                  <span key={s.cat} className={`change-summary-chip chip-${s.cat}`}>
                    {s.label}: {s.total} 个文件
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 变更文件列表（可折叠） */}
          {changedFiles && changedFiles.length > 0 && (
            <ChangedFilesView files={changedFiles} />
          )}

          {/* 失败详情 */}
          {record.status === 'failed' && (errorCode || errorMessage) && (
            <div className="package-history-section">
              <span className="package-history-label">失败原因:</span>
              <div className="package-history-error-info">
                {errorCode && <span className="error-code-chip">{errorCode}</span>}
                {errorMessage && <div className="package-history-error-text">{errorMessage}</div>}
                {errorDetails && typeof errorDetails === 'object' && Object.keys(errorDetails).length > 0 && (
                  <pre className="package-history-error-details">{JSON.stringify(errorDetails, null, 2)}</pre>
                )}
              </div>
            </div>
          )}

          {/* 元数据警告 */}
          {metadataWarnings && metadataWarnings.length > 0 && (
            <div className="package-history-section">
              <span className="package-history-label">警告:</span>
              <div className="package-history-warnings">
                {metadataWarnings.map((w, i) => (
                  <div key={i} className="warning-item">{w}</div>
                ))}
              </div>
            </div>
          )}

          {/* 参数信息 */}
          <div className="package-history-meta">
            <span>Job: {record.jobId || '-'}</span>
            {exitCode !== null && exitCode !== undefined && <span>退出码: {exitCode}</span>}
            {record.parallelBuild && <span>并行构建</span>}
            {record.maxJobs && <span>线程: {record.maxJobs}</span>}
            {record.buildOnly && <span>仅构建</span>}
            {record.packagePath && <span>输出: {record.packagePath}</span>}
          </div>

        </div>
      )}
    </div>
  )
}

/* ── 发布条目视图 ── */
function ReleaseItemsView({ items }) {
  return (
    <div className="release-items">
      {items.map((item, idx) => (
        <div key={idx} className={`release-item release-item-${item.type}`}>
          <span className="release-item-label">{item.label}</span>
          {item.type === 'frontend' && item.modules && (
            <div className="release-item-modules">
              {item.modules.map((mod, mi) => (
                <div key={mi} className="release-module">
                  <span className="release-module-name">{mod.module}</span>
                  {mod.pages?.length > 0 && (
                    <div className="release-file-group">
                      <span className="release-file-tag tag-page">页面</span>
                      {mod.pages.map((f, fi) => <code key={fi} className="release-file-path">{f}</code>)}
                    </div>
                  )}
                  {mod.components?.length > 0 && (
                    <div className="release-file-group">
                      <span className="release-file-tag tag-component">组件</span>
                      {mod.components.map((f, fi) => <code key={fi} className="release-file-path">{f}</code>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {item.type === 'backend' && item.modules && (
            <div className="release-item-modules">
              {item.modules.map((mod, mi) => (
                <div key={mi} className="release-module">
                  <span className="release-module-name">{mod.module}</span>
                  <div className="release-file-group">
                    {mod.files?.slice(0, 5).map((f, fi) => <code key={fi} className="release-file-path">{f}</code>)}
                    {mod.files?.length > 5 && <span className="file-more">+{mod.files.length - 5} more</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(item.type === 'database' || item.type === 'config' || item.type === 'frontend-other' || item.type === 'other') && item.files && (
            <div className="release-item-files">
              {item.files.slice(0, 5).map((f, fi) => <code key={fi} className="release-file-path">{f}</code>)}
              {item.files.length > 5 && <span className="file-more">+{item.files.length - 5} more</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── 变更文件视图 ── */
function ChangedFilesView({ files }) {
  const [showAll, setShowAll] = useState(false)
  const INITIAL_COUNT = 10
  const visibleFiles = showAll ? files : files.slice(0, INITIAL_COUNT)

  // 按分类分组
  const groups = useMemo(() => {
    const map = {}
    for (const f of visibleFiles) {
      const cat = f.category || 'other'
      if (!map[cat]) map[cat] = []
      map[cat].push(f)
    }
    return map
  }, [visibleFiles])

  const catLabels = { frontend: '前端', backend: '后端', database: '数据库', config: '配置', docs: '文档', test: '测试', other: '其他' }

  return (
    <div className="package-history-section">
      <span className="package-history-label">变更文件 ({files.length}):</span>
      <div className="changed-files-view">
        {Object.entries(groups).map(([cat, catFiles]) => (
          <div key={cat} className="changed-files-group">
            <span className={`changed-files-cat cat-${cat}`}>{catLabels[cat] || cat}</span>
            {catFiles.map((f, i) => (
              <code key={i} className="changed-file-path" title={f.path}>{f.path}</code>
            ))}
          </div>
        ))}
        {files.length > INITIAL_COUNT && (
          <button
            className="changed-files-toggle"
            onClick={(e) => { e.stopPropagation(); setShowAll(!showAll) }}
          >
            {showAll ? '收起' : `显示全部 ${files.length} 个文件`}
          </button>
        )}
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
      {task.error?.details?.logSnippet && (
        <pre className="package-error-snippet">{task.error.details.logSnippet}</pre>
      )}
    </div>
  )
}

/* ── 工具函数 ── */
function getHistoryStatusMeta(status) {
  const meta = {
    succeeded: { className: 'succeeded', label: '成功' },
    failed: { className: 'failed', label: '失败' },
    running: { className: 'running', label: '运行中' },
    pending: { className: 'running', label: '等待中' },
    cancelled: { className: 'unknown', label: '已取消' }
  }
  return meta[status] || { className: 'unknown', label: status || '未知' }
}

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

function formatDuration(ms) {
  if (!ms && ms !== 0) return '-'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return `${hours}h ${remainMinutes}m`
}

function buildVersionEntries(versions, recordServices) {
  if (!versions || typeof versions !== 'object') return []
  if (Array.isArray(recordServices) && recordServices.length > 0) {
    return recordServices
      .filter((id) => versions[id])
      .map((id) => [id, versions[id]])
  }
  return Object.entries(versions).filter(([, ver]) => Boolean(ver))
}

function buildVersionSummary(versions, recordServices) {
  const entries = buildVersionEntries(versions, recordServices)
  if (entries.length === 0) return null
  const summary = entries.slice(0, 2).map(([id, ver]) => `${id}: ${ver}`).join(' / ')
  return entries.length > 2 ? `${summary} +${entries.length - 2}` : summary
}

function compactText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function formatTime(dateStr) {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return dateStr
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hours}:${minutes}`
  } catch {
    return dateStr
  }
}

export default PackageTab
