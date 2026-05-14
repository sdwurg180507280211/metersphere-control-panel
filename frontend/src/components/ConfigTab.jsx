import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { useBuildStore, useConfigStore, usePackageStore, useServiceStore, useWebSocketStore } from '../store/useAppStore'
import { passwordCache } from '../utils/passwordCache'
import ConfigSaveBar from './ConfigSaveBar'
import ConfigField from './ConfigField'
import CustomSelect from './CustomSelect'
import ConfirmDialog from './ConfirmDialog'
import PropertiesDialog from './PropertiesDialog'
import PasswordDialog from './PasswordDialog'
import ConfigRuntimePanel from './ConfigRuntimePanel'
import ConfigDiagnosticsPanel from './ConfigDiagnosticsPanel'
import ConfigPanelModal from './ConfigPanelModal'
import './ConfigTab.css'

function ConfigTab() {
  const [activeTab, setActiveTab] = useState('environment')
  const [showPropertiesModal, setShowPropertiesModal] = useState(false)
  const [showRuntimeModal, setShowRuntimeModal] = useState(false)
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false)
  const [serviceFilter, setServiceFilter] = useState('')
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    action: null,
    type: 'warning'
  })
  const [reloadDialog, setReloadDialog] = useState({
    isOpen: false,
    password: '',
    error: '',
    loading: false
  })

  const {
    draft,
    snapshot,
    resolved,
    runtime,
    diagnostics,
    validation,
    meta,
    applyImpact,
    dirtyFields,
    loading,
    validating,
    saving,
    applying,
    scanning,
    diagnosticsLoading,
    nodeVersions,
    scanningNodeVersions,
    fetchConfig,
    updateDraft,
    addService,
    updateService,
    removeService,
    validateDraft,
    saveConfig,
    applyConfig,
    resetDraft,
    refreshDiagnostics,
    scanProject,
    scanNodeVersions
  } = useConfigStore()

  const { fetchCatalog, fetchServices } = useServiceStore()
  const { fetchModules, fetchActiveBuilds } = useBuildStore()
  const { fetchOptions: fetchPackageOptions, fetchActiveTask: fetchActivePackageTask } = usePackageStore()
  const { connected } = useWebSocketStore()

  useEffect(() => {
    fetchConfig().catch((error) => {
      toast.error(error.message || '加载配置失败')
    })
  }, [fetchConfig])

  const fieldErrors = useMemo(() => buildFieldMap(validation?.errors || []), [validation?.errors])
  const fieldWarnings = useMemo(() => buildFieldMap(validation?.warnings || []), [validation?.warnings])

  const tabErrorCounts = useMemo(() => {
    const counts = { environment: 0, services: 0, integrations: 0, advanced: 0 }
    const errors = validation?.errors || []
    errors.forEach(err => {
      const path = err.path || ''
      if (path.startsWith('projectRoot') || path.startsWith('npmPath') || path.startsWith('properties')) counts.environment++
      else if (path.startsWith('services')) counts.services++
      else if (path.startsWith('redis') || path.startsWith('claudeCode') || path.startsWith('tunnel') || path.startsWith('waifu')) counts.integrations++
      else counts.advanced++
    })
    return counts
  }, [validation?.errors])

  const tabDirtyCounts = useMemo(() => {
    const counts = { environment: 0, services: 0, integrations: 0, advanced: 0 }
    dirtyFields.forEach(path => {
      if (path.startsWith('projectRoot') || path.startsWith('npmPath') || path.startsWith('properties')) counts.environment++
      else if (path.startsWith('services')) counts.services++
      else if (path.startsWith('redis') || path.startsWith('claudeCode') || path.startsWith('tunnel') || path.startsWith('waifu')) counts.integrations++
      else counts.advanced++
    })
    return counts
  }, [dirtyFields])

  const filteredServices = useMemo(() => {
    const entries = Object.entries(draft?.services || {})
    if (!serviceFilter) return entries
    const term = serviceFilter.toLowerCase()
    return entries.filter(([id, s]) => id.toLowerCase().includes(term) || (s.name || '').toLowerCase().includes(term))
  }, [draft?.services, serviceFilter])

  const [showNodeVersionDropdown, setShowNodeVersionDropdown] = useState(false)
  const nodeVersionDropdownRef = useRef(null)

  const handleScanNodeVersions = async () => {
    try {
      const result = await scanNodeVersions()
      if (result.versions.length > 0) {
        setShowNodeVersionDropdown(true)
      } else {
        toast('未发现其他 Node.js 安装')
      }
    } catch (error) {
      toast.error(error.message || '扫描 Node 版本失败')
    }
  }

  const handleSelectNodeVersion = (ver) => {
    if (ver.npmPath) {
      updateDraft('npmPath', ver.npmPath)
    }
    setShowNodeVersionDropdown(false)
  }

  useEffect(() => {
    if (!showNodeVersionDropdown) return
    const handleClickOutside = (e) => {
      if (nodeVersionDropdownRef.current && !nodeVersionDropdownRef.current.contains(e.target)) {
        setShowNodeVersionDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showNodeVersionDropdown])

  const handleScan = async () => {
    try {
      const result = await scanProject(draft.projectRoot)
      toast.success(`扫描完成，已同步 ${result.count} 个服务模块`)
    } catch (error) {
      toast.error(error.message || '扫描失败')
    }
  }

  const handleValidate = async () => {
    try {
      const result = await validateDraft()
      if (result.valid) toast.success('配置校验通过')
      else toast.error(`校验未通过，发现 ${result.errors.length} 个潜在问题`)
    } catch (error) {
      toast.error(error.message || '校验失败')
    }
  }

  const handleSave = async () => {
    try {
      const result = await saveConfig()
      toast.success(result.meta?.hasUnappliedChanges ? '配置已固化到磁盘，等待应用' : '配置已保存并同步')
      return true
    } catch (error) {
      toast.error(error.message || '保存失败')
      return false
    }
  }

  const handleSaveAndApply = async () => {
    const saved = await handleSave()
    if (saved) await handleApply()
  }

  const handleApply = async () => {
    const requiresRestart = applyImpact?.requiresRestart?.length > 0
    const hotFields = applyImpact?.changedPaths?.filter(p => !applyImpact.requiresRestart?.includes(p)) || []
    const message = requiresRestart
      ? `即将应用配置到运行时。\n\n热更新字段: ${hotFields.length} 项\n需重启字段: ${applyImpact.requiresRestart.length} 项（${applyImpact.requiresRestart.join(', ')}）`
      : '即将应用配置到运行时，所有修改将立即生效。'
    setConfirmDialog({
      isOpen: true,
      title: '确认应用配置',
      message,
      action: 'apply',
      type: requiresRestart ? 'warning' : 'primary'
    })
  }

  const handleApplyConfirmed = async () => {
    try {
      const result = await applyConfig()
      await Promise.allSettled([
        fetchCatalog(), fetchServices(), fetchModules(), fetchActiveBuilds(),
        fetchPackageOptions(), fetchActivePackageTask(), refreshDiagnostics()
      ])
      toast.success(result.requiresRestart?.length > 0 ? '配置已热更新，部分修改需重启生效' : '配置已成功应用到运行时')
    } catch (error) {
      toast.error(error.message || '应用失败')
    }
  }

  const handleRemoveService = (id, name) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除服务定义',
      message: `确定删除服务「${name || id}」吗？删除后需保存配置才会生效。`,
      action: `remove:${id}`,
      type: 'danger'
    })
  }

  const handleResetDraft = () => {
    setConfirmDialog({
      isOpen: true,
      title: '重置所有修改',
      message: '确定丢弃所有未保存的修改吗？此操作不可撤销。',
      action: 'reset',
      type: 'danger'
    })
  }

  const handleConfirmAction = () => {
    const { action } = confirmDialog
    setConfirmDialog({ isOpen: false, title: '', message: '', action: null, type: 'warning' })
    if (action === 'apply') handleApplyConfirmed()
    else if (action === 'reset') resetDraft()
    else if (action?.startsWith('remove:')) removeService(action.slice(7))
  }

  const openSystemReloadDialog = useCallback(() => {
    setReloadDialog({
      isOpen: true,
      password: '',
      error: '',
      loading: false
    })
  }, [])

  const closeSystemReloadDialog = useCallback(() => {
    setReloadDialog((prev) => (prev.loading ? prev : {
      isOpen: false,
      password: '',
      error: '',
      loading: false
    }))
  }, [])

  const confirmSystemReload = useCallback(async () => {
    if (!reloadDialog.password) {
      setReloadDialog((prev) => ({ ...prev, error: '请输入管理员密码' }))
      return
    }

    setReloadDialog((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const response = await fetch('/api/services/system/reload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: reloadDialog.password })
      })
      const data = await response.json()

      if (data.success) {
        toast.success(data.message || 'msctl reload 执行成功', { icon: '⚙️' })
        closeSystemReloadDialog()
        if (connected) {
          await fetchServices()
        }
        return
      }

      const message = data?.error?.message || 'msctl reload 执行失败'
      setReloadDialog((prev) => ({ ...prev, loading: false, error: message }))
      toast.error(message)
    } catch (error) {
      const message = `网络错误: ${error.message}`
      setReloadDialog((prev) => ({ ...prev, loading: false, error: message }))
      toast.error(message)
    }
  }, [connected, fetchServices, reloadDialog.password])


  if (loading || !draft) {
    return (
      <div className="tab-content config-tab config-tab-loading">
        <div className="config-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }}></div>
        <p style={{ marginTop: '16px', color: 'var(--text-tertiary)' }}>正在同步配置快照...</p>
      </div>
    )
  }

  const renderEnvironment = () => (
    <div className="config-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <h3 className="config-section-title">基础环境</h3>
          <p className="config-section-subtitle">控制面板的核心运行锚点。系统将基于项目根目录自动推导微服务结构与配置文件位置。</p>
        </div>
        <button className="config-scan-btn" onClick={openSystemReloadDialog} style={{ whiteSpace: 'nowrap' }}>
          <span>⚙️</span>
          系统 Reload
        </button>
      </div>
      
      <div className="config-form-grid">
        <ConfigField label="项目根目录 (Project Root)" path="projectRoot" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} checkPath={true} hint=" MeterSphere 源码仓库的绝对路径">
          <input value={draft.projectRoot ?? ''} onChange={e => updateDraft('projectRoot', e.target.value)} placeholder="/Users/username/ideaProjects/metersphere" />
        </ConfigField>

        <ConfigField label="npm 执行路径" path="npmPath" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} checkPath={true} hint={resolved?.npmPath ? `当前自动识别: ${resolved.npmPath}` : "系统将尝试在 PATH 中自动探测"}>
          <div className="npm-path-field">
            <div className="npm-path-input-row">
              <input value={draft.npmPath ?? ''} onChange={e => updateDraft('npmPath', e.target.value)} placeholder="例如: /usr/local/bin/npm" />
              <button
                className={`config-scan-btn ${scanningNodeVersions ? 'scanning' : ''}`}
                onClick={handleScanNodeVersions}
                disabled={scanningNodeVersions}
                style={{ whiteSpace: 'nowrap' }}
              >
                {scanningNodeVersions ? <span className="config-spinner-mini" /> : <span>🔍</span>}
                {scanningNodeVersions ? '扫描中...' : '扫描版本'}
              </button>
            </div>
            {showNodeVersionDropdown && nodeVersions.length > 0 && (
              <div className="node-version-dropdown" ref={nodeVersionDropdownRef}>
                {nodeVersions.map((ver, idx) => (
                  <div
                    key={ver.nodePath}
                    className={`node-version-item ${ver.npmPath === draft.npmPath ? 'selected' : ''}`}
                    onClick={() => handleSelectNodeVersion(ver)}
                  >
                    <div className="node-version-main">
                      <span className="node-version-label">{ver.version}</span>
                      <span className={`node-version-source source-${ver.source}`}>{ver.source}</span>
                      {ver.npmPath === (draft.npmPath || resolved?.npmPath) && <span className="node-version-current-badge">当前</span>}
                    </div>
                    <div className="node-version-path">{ver.npmPath || ver.nodePath}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ConfigField>

        <ConfigField label="metersphere.properties" path="properties.metersphere" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} checkPath={true} hint={resolved?.properties?.metersphere || "未找到默认配置文件"}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={draft.properties?.metersphere ?? ''} onChange={e => updateDraft('properties.metersphere', e.target.value)} placeholder="自动推导中..." />
            <button className="config-scan-btn" onClick={() => setShowPropertiesModal(true)} style={{ whiteSpace: 'nowrap' }}>内容在线编辑</button>
          </div>
        </ConfigField>

        <ConfigField label="redisson.yml" path="properties.redisson" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} checkPath={true} hint={resolved?.properties?.redisson || "未找到默认配置文件"}>
          <input value={draft.properties?.redisson ?? ''} onChange={e => updateDraft('properties.redisson', e.target.value)} placeholder="自动推导中..." />
        </ConfigField>
      </div>
    </div>
  )

  const renderServices = () => (
    <div className="config-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
        <div>
          <h3 className="config-section-title">服务管理</h3>
          <p className="config-section-subtitle" style={{ marginBottom: 0 }}>通过扫描自动识别微服务。系统将自动解析 POM 结构与端口定义。</p>
        </div>
        <button className={`config-scan-btn ${scanning ? 'scanning' : ''}`} onClick={handleScan} disabled={scanning}>
          {scanning ? <span className="config-spinner" /> : <span>🔍</span>}
          {scanning ? '智能探测中...' : '一键扫描项目'}
        </button>
      </div>

      <div className="config-search-wrapper" style={{ marginTop: '24px' }}>
        <span className="config-search-icon-inline">🔍</span>
        <input className="config-search-input" placeholder="输入服务 ID 或名称快速过滤..." value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} />
        {serviceFilter && <button className="config-search-clear" onClick={() => setServiceFilter('')}>✕</button>}
      </div>

      <table className="config-service-table">
        <thead>
          <tr>
            <th style={{ width: '80px' }}>状态</th>
            <th>服务定义</th>
            <th>端口 (Port)</th>
            <th style={{ width: '160px' }}>镜像版本</th>
            <th style={{ width: '100px' }}>启动顺序</th>
            <th style={{ width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {filteredServices.length > 0 ? (
            filteredServices.sort((a,b) => (a[1].startOrder || 99) - (b[1].startOrder || 99)).map(([id, s]) => {
              const isCore = ['eureka', 'gateway'].includes(id);
              const isRowDirty = dirtyFields.some(path => path.startsWith(`services.${id}`));
              
              return (
                <tr key={id} className={`config-service-row ${isCore ? 'is-core' : ''} ${isRowDirty ? 'config-field-dirty' : ''}`}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      <label className="config-switch">
                        <input type="checkbox" checked={s.enabled !== false} onChange={e => updateService(id, { enabled: e.target.checked })} />
                        <span className="slider round"></span>
                      </label>
                      <span className={`config-tag ${s.enabled !== false ? 'config-tag-success' : 'config-tag-neutral'}`}>
                        {s.enabled !== false ? 'ACTIVE' : 'OFF'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="config-service-id-link">{id}</span>
                      {isCore && <span title="基础设施核心服务" style={{ cursor: 'help', fontSize: '14px' }}>🛡️</span>}
                    </div>
                    <input 
                      className="config-service-input-name" 
                      value={s.name ?? ''} 
                      onChange={e => updateService(id, { name: e.target.value })} 
                      style={{ 
                        display: 'block',
                        fontSize: '14px', 
                        fontWeight: 600, 
                        marginTop: '4px',
                        width: '100%',
                        border: 'none',
                        background: 'transparent'
                      }} 
                      placeholder="设置显示名称..." 
                    />
                    <div className="config-service-meta" style={{ marginTop: '6px', fontSize: '11px', opacity: 0.6 }}>{s.pom}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="number" 
                        value={s.port ?? ''} 
                        onChange={e => updateService(id, { port: e.target.value })} 
                        style={{ width: '80px', fontWeight: 700, fontSize: '15px' }} 
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                      HC: {s.healthCheck || '/actuator/health'}
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="config-service-version-input"
                      value={s.imageVersion ?? ''}
                      onChange={e => updateService(id, { imageVersion: e.target.value })}
                      placeholder="v2.10.26.01-lts"
                    />
                  </td>
                  <td>
                     <input 
                       type="number" 
                       value={s.startOrder ?? ''} 
                       onChange={e => updateService(id, { startOrder: e.target.value })} 
                       style={{ width: '60px', textAlign: 'center' }} 
                     />
                  </td>
                  <td>
                    <button className="config-action-btn-danger" onClick={() => handleRemoveService(id, s.name)}>✕</button>
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan="6">
                <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', borderRadius: '16px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '20px', opacity: 0.5 }}>🔎</div>
                  <div style={{ fontSize: '16px', fontWeight: 600 }}>未发现匹配的服务模块</div>
                  <div style={{ fontSize: '13px', marginTop: '8px' }}>调整搜索词或点击“一键扫描”重新探测</div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <button className="config-add-btn" onClick={() => addService()}>+ 手动定义非标准服务模块</button>
    </div>
  )

  const renderIntegrations = () => (
    <div className="config-section">
      <h3 className="config-section-title">外部集成</h3>
      <p className="config-section-subtitle">连接外部基础设施与 AI 模型服务。Redis 用于任务队列与缓存加速，ClaudeCode 提供智能分析能力。</p>

      <div className="config-form-grid">
        <ConfigField label="缓存存储模式" path="redis.mode" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings}>
          <CustomSelect value={draft.redis?.mode ?? 'memory'} onChange={val => updateDraft('redis.mode', val)} options={[{ value: 'memory', label: '内置内存 (轻量)' }, { value: 'redis', label: '外部 Redis (高可靠)' }]} />
        </ConfigField>

        <ConfigField label="Redis 主机地址" path="redis.host" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings}>
          <input value={draft.redis?.host ?? ''} onChange={e => updateDraft('redis.host', e.target.value)} disabled={draft.redis?.mode !== 'redis'} placeholder="127.0.0.1" />
        </ConfigField>

        <ConfigField label="ClaudeCode API 凭据" path="claudeCode.authToken" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="ANTHROPIC_AUTH_TOKEN 环境变量覆盖">
          <input type="password" value={draft.claudeCode?.authToken ?? ''} onChange={e => updateDraft('claudeCode.authToken', e.target.value)} placeholder="sk-ant-..." />
        </ConfigField>
      </div>

      <h3 className="config-section-title" style={{ marginTop: '32px' }}>SSH 隧道</h3>
      <p className="config-section-subtitle">配置 SSH 反向隧道的远程目标主机。修改后无需重启控制面板即可生效。</p>

      <div className="config-form-grid">
        <ConfigField label="远程主机地址" path="sshTunnel.remoteHost" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="SSH 反向隧道的目标主机 IP 或域名">
          <input value={draft.sshTunnel?.remoteHost ?? draft.tunnel?.remoteHost ?? ''} onChange={e => updateDraft('sshTunnel.remoteHost', e.target.value)} placeholder="example.com" />
        </ConfigField>

        <ConfigField label="远程用户名" path="sshTunnel.remoteUser" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="SSH 登录远程主机的用户名">
          <input value={draft.sshTunnel?.remoteUser ?? draft.tunnel?.remoteUser ?? ''} onChange={e => updateDraft('sshTunnel.remoteUser', e.target.value)} placeholder="ssh-user" />
        </ConfigField>
      </div>

      <h3 className="config-section-title" style={{ marginTop: '32px' }}>看板娘</h3>
      <p className="config-section-subtitle">Live2D 看板娘为可选插件，关闭后不加载任何相关资源（pixi.js、Live2D SDK 等），节省内存和加载时间。</p>

      <div className="config-form-grid">
        <ConfigField label="启用看板娘" path="waifu.enabled" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="关闭后需应用配置才能生效，页面会刷新">
          <label className="config-switch">
            <input type="checkbox" checked={draft.waifu?.enabled !== false} onChange={e => updateDraft('waifu.enabled', e.target.checked)} />
            <span className="slider round" />
          </label>
        </ConfigField>
      </div>

      <div className="config-form-grid" style={{ opacity: draft.waifu?.enabled === false ? 0.5 : 1, transition: 'opacity 0.2s' }}>
        <ConfigField label="AI 对话模型" path="waifu.model" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="看板娘 AI 聊天使用的语言模型">
          <input value={draft.waifu?.model ?? ''} onChange={e => updateDraft('waifu.model', e.target.value)} placeholder="qwen3.5-plus" />
        </ConfigField>

        <ConfigField label="AI API Key" path="waifu.apiKey" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="大模型服务的 API Key，启用看板娘聊天时必填">
          <input type="password" value={draft.waifu?.apiKey ?? ''} onChange={e => updateDraft('waifu.apiKey', e.target.value)} placeholder="sk-..." />
        </ConfigField>

        <ConfigField label="AI API Base URL" path="waifu.baseUrl" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="自定义 API 端点，留空使用默认（通义千问）">
          <input value={draft.waifu?.baseUrl ?? ''} onChange={e => updateDraft('waifu.baseUrl', e.target.value)} placeholder="https://api.example.com/v1" />
        </ConfigField>

        <ConfigField label="系统提示词" path="waifu.systemPrompt" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="自定义看板娘角色设定，留空使用默认">
          <textarea value={draft.waifu?.systemPrompt ?? ''} onChange={e => updateDraft('waifu.systemPrompt', e.target.value)} placeholder="你是一个名为小梦的看板娘..." rows={3} style={{ width: '100%', resize: 'vertical' }} />
        </ConfigField>
      </div>

      {draft.waifu?.enabled !== false && !draft.waifu?.apiKey && (
        <p className="config-section-subtitle" style={{ color: '#faad14', marginTop: '4px' }}>提示：AI 聊天功能需要配置 API Key 才能使用</p>
      )}
    </div>
  )

  const renderAdvanced = () => (
    <div className="config-section">
      <h3 className="config-section-title">运行控制</h3>
      <p className="config-section-subtitle">调节控制面板的性能参数。除非有明确的硬件瓶颈或调试需求，否则建议保持默认。</p>

      <div className="config-form-grid">
        <ConfigField label="终端日志回溯行数" path="maxLogLines" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint="增加行数会消耗更多前端内存">
          <input type="number" value={draft.maxLogLines ?? ''} onChange={e => updateDraft('maxLogLines', e.target.value)} />
        </ConfigField>

        <ConfigField label="构建并行限制 (Max Jobs)" path="package.maxJobs" fieldErrors={fieldErrors} fieldWarnings={fieldWarnings} hint={`基于当前 CPU 核心数推导: ${resolved?.package?.maxJobs || '-'}`}>
          <input type="number" value={draft.package?.maxJobs ?? ''} onChange={e => updateDraft('package.maxJobs', e.target.value)} />
        </ConfigField>
      </div>

      <div className="config-action-grid" style={{ marginTop: '48px', display: 'flex', gap: '16px' }}>
        <button className="config-scan-btn" onClick={() => setShowDiagnosticsModal(true)} style={{ flex: 1 }}>
          <span>🔍</span> 深度配置诊断
        </button>
        <button className="config-scan-btn" onClick={() => setShowRuntimeModal(true)} style={{ flex: 1 }}>
          <span>⚙️</span> 系统运行时快照
        </button>
      </div>
    </div>
  )

  return (
    <div className="tab-content config-tab">
      <div className="config-container">
        <div className="config-sidebar">
          <NavItem id="environment" icon="🌍" label="基础环境" activeId={activeTab} errorCount={tabErrorCounts.environment} dirtyCount={tabDirtyCounts.environment} onClick={setActiveTab} />
          <NavItem id="services" icon="📋" label="服务管理" activeId={activeTab} errorCount={tabErrorCounts.services} dirtyCount={tabDirtyCounts.services} onClick={setActiveTab} />
          <NavItem id="integrations" icon="🔗" label="外部集成" activeId={activeTab} errorCount={tabErrorCounts.integrations} dirtyCount={tabDirtyCounts.integrations} onClick={setActiveTab} />
          <NavItem id="advanced" icon="⚙️" label="运行控制" activeId={activeTab} errorCount={tabErrorCounts.advanced} dirtyCount={tabDirtyCounts.advanced} onClick={setActiveTab} />
        </div>

        <div className="config-content">
          {activeTab === 'environment' && renderEnvironment()}
          {activeTab === 'services' && renderServices()}
          {activeTab === 'integrations' && renderIntegrations()}
          {activeTab === 'advanced' && renderAdvanced()}
        </div>
      </div>

      <ConfigSaveBar dirtyCount={dirtyFields.length} validating={validating} saving={saving} applying={applying} hasUnappliedChanges={meta?.hasUnappliedChanges} applyImpact={applyImpact} onValidate={handleValidate} onSave={handleSave} onSaveAndApply={handleSaveAndApply} onApply={handleApply} onReset={handleResetDraft} />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText="确认"
        cancelText="取消"
        type={confirmDialog.type}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmDialog({ isOpen: false, title: '', message: '', action: null, type: 'warning' })}
      />

      {showPropertiesModal && <PropertiesDialog onClose={() => setShowPropertiesModal(false)} />}
      
      <ConfigPanelModal isOpen={showDiagnosticsModal} title="深度配置诊断" onClose={() => setShowDiagnosticsModal(false)} maxWidth="960px">
        <ConfigDiagnosticsPanel diagnostics={diagnostics} validation={validation} loading={diagnosticsLoading} onRefresh={refreshDiagnostics} />
      </ConfigPanelModal>

      <ConfigPanelModal isOpen={showRuntimeModal} title="系统运行时快照" onClose={() => setShowRuntimeModal(false)}>
        <ConfigRuntimePanel runtime={runtime} resolved={resolved} meta={meta} applyImpact={applyImpact} />
      </ConfigPanelModal>

      <PasswordDialog
        isOpen={reloadDialog.isOpen}
        title="执行系统 Reload"
        description="请输入管理员密码后执行 sudo msctl reload。"
        value={reloadDialog.password}
        error={reloadDialog.error}
        loading={reloadDialog.loading}
        onChange={(password) => setReloadDialog((prev) => ({ ...prev, password, error: '' }))}
        onConfirm={confirmSystemReload}
        onCancel={closeSystemReloadDialog}
      />
    </div>
  )
}

function NavItem({ id, icon, label, activeId, errorCount, dirtyCount, onClick }) {
  return (
    <div className={`config-nav-item ${activeId === id ? 'active' : ''}`} onClick={() => onClick(id)}>
      <div className="config-nav-content"><span className="config-nav-icon">{icon}</span>{label}</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {dirtyCount > 0 && <span className="config-nav-dirty-dot" title={`${dirtyCount} 项未保存修改`} />}
        {errorCount > 0 && <span className="config-nav-badge">{errorCount}</span>}
      </div>
    </div>
  )
}

function buildFieldMap(items) {
  return (items || []).reduce((acc, item) => {
    const key = item.path || 'global'
    if (!acc[key]) acc[key] = []
    acc[key].push(item.message)
    return acc
  }, {})
}

export default ConfigTab
