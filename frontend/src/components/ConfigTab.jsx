import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useBuildStore, useConfigStore, usePackageStore, useServiceStore } from '../store/useAppStore'
import ConfigSaveBar from './ConfigSaveBar'
import ConfigField from './ConfigField'
import CustomSelect from './CustomSelect'
import PropertiesDialog from './PropertiesDialog'
import ConfigRuntimePanel from './ConfigRuntimePanel'
import ConfigDiagnosticsPanel from './ConfigDiagnosticsPanel'
import './ConfigTab.css'

function ConfigTab() {
  const [activeTab, setActiveTab] = useState('environment')
  const [showPropertiesModal, setShowPropertiesModal] = useState(false)
  const [showRuntimeModal, setShowRuntimeModal] = useState(false)
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false)

  const {
    draft,
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
    scanProject
  } = useConfigStore()

  const { fetchCatalog, fetchServices } = useServiceStore()
  const { fetchModules, fetchActiveBuilds } = useBuildStore()
  const { fetchOptions: fetchPackageOptions, fetchActiveTask: fetchActivePackageTask } = usePackageStore()

  useEffect(() => {
    fetchConfig().catch((error) => {
      toast.error(error.message || '加载配置失败')
    })
  }, [fetchConfig])

  const fieldErrors = useMemo(() => buildFieldMap(validation?.errors || []), [validation?.errors])
  const fieldWarnings = useMemo(() => buildFieldMap(validation?.warnings || []), [validation?.warnings])

  const handleScan = async () => {
    try {
      const result = await scanProject(draft.projectRoot)
      toast.success(`扫描完成，探测到 ${result.count} 个服务`)
    } catch (error) {
      toast.error(error.message || '扫描失败')
    }
  }

  const handleValidate = async () => {
    try {
      const result = await validateDraft()
      if (result.valid) {
        toast.success('配置校验通过')
      } else {
        toast.error(`发现 ${result.errors.length} 个配置问题`)
      }
    } catch (error) {
      toast.error(error.message || '校验配置失败')
    }
  }

  const handleSave = async () => {
    try {
      const result = await saveConfig()
      toast.success(result.meta?.hasUnappliedChanges ? '配置已保存，等待应用' : '配置已保存')
    } catch (error) {
      toast.error(error.message || '保存配置失败')
    }
  }

  const handleApply = async () => {
    try {
      const result = await applyConfig()
      await Promise.allSettled([
        fetchCatalog(),
        fetchServices(),
        fetchModules(),
        fetchActiveBuilds(),
        fetchPackageOptions(),
        fetchActivePackageTask(),
        refreshDiagnostics()
      ])
      toast.success(result.requiresRestart?.length > 0 ? '配置已应用，部分字段需重启' : '配置已应用')
    } catch (error) {
      toast.error(error.message || '应用配置失败')
    }
  }

  if (loading || !draft) {
    return (
      <div className="tab-content config-tab config-tab-loading">
        <div className="config-loading-card">正在加载配置...</div>
      </div>
    )
  }

  const renderEnvironment = () => (
    <div className="config-section">
      <h3 className="config-section-title">基础环境</h3>
      <p className="config-section-subtitle">配置 MeterSphere 项目根路径及环境依赖</p>
      
      <div className="config-form-grid">
        <ConfigField 
          label="项目根目录" 
          path="projectRoot" 
          fieldErrors={fieldErrors} 
          fieldWarnings={fieldWarnings}
          hint="控制面板将以此为锚点探测所有微服务"
        >
          <input 
            value={draft.projectRoot ?? ''} 
            onChange={e => updateDraft('projectRoot', e.target.value)} 
            placeholder="/Users/xxx/ideaProjects/metersphere"
          />
        </ConfigField>

        <ConfigField 
          label="npm 命令路径" 
          path="npmPath" 
          fieldErrors={fieldErrors} 
          fieldWarnings={fieldWarnings}
          hint={resolved?.npmPath ? `当前推测路径: ${resolved.npmPath}` : "留空则自动探测系统环境变量"}
        >
          <input 
            value={draft.npmPath ?? ''} 
            onChange={e => updateDraft('npmPath', e.target.value)} 
            placeholder="例如: /usr/local/bin/npm"
          />
        </ConfigField>

        <ConfigField 
          label="metersphere.properties 路径" 
          path="properties.metersphere" 
          fieldErrors={fieldErrors} 
          fieldWarnings={fieldWarnings}
          hint={resolved?.properties?.metersphere ? `当前指向: ${resolved.properties.metersphere}` : "留空则尝试自动查找"}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              value={draft.properties?.metersphere ?? ''} 
              onChange={e => updateDraft('properties.metersphere', e.target.value)} 
              placeholder="自动探测中..."
            />
            <button className="config-scan-btn" onClick={() => setShowPropertiesModal(true)}>编辑内容</button>
          </div>
        </ConfigField>

        <ConfigField 
          label="redisson.yml 路径" 
          path="properties.redisson" 
          fieldErrors={fieldErrors} 
          fieldWarnings={fieldWarnings}
          hint={resolved?.properties?.redisson ? `当前指向: ${resolved.properties.redisson}` : "留空则尝试自动查找"}
        >
          <input 
            value={draft.properties?.redisson ?? ''} 
            onChange={e => updateDraft('properties.redisson', e.target.value)} 
            placeholder="自动探测中..."
          />
        </ConfigField>
      </div>
    </div>
  )

  const renderServices = () => (
    <div className="config-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h3 className="config-section-title">服务管理</h3>
        <button 
          className={`config-scan-btn ${scanning ? 'scanning' : ''}`} 
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? <span className="config-spinner" /> : <span className="config-scan-icon">🔍</span>}
          {scanning ? '智能探测中...' : '自动扫描项目服务'}
        </button>
      </div>
      <p className="config-section-subtitle">探测到的微服务列表及运行参数（修改后将覆盖自动探测结果）</p>

      <table className="config-service-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>服务标识 / 名称</th>
            <th>POM 路径</th>
            <th>端口</th>
            <th>顺序</th>
            <th style={{ width: '80px' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(draft.services || {}).sort((a,b) => (a[1].startOrder || 99) - (b[1].startOrder || 99)).map(([id, s]) => (
            <tr key={id} className="config-service-row">
              <td>
                <input 
                  type="checkbox" 
                  checked={s.enabled !== false} 
                  onChange={e => updateService(id, { enabled: e.target.checked })} 
                />
              </td>
              <td>
                <div style={{ fontWeight: 600 }}>{id}</div>
                <input 
                  className="config-service-input-small"
                  value={s.name ?? ''} 
                  onChange={e => updateService(id, { name: e.target.value })} 
                  style={{ width: '120px' }}
                />
              </td>
              <td>
                <span className="config-service-meta">{s.pom}</span>
              </td>
              <td>
                <input 
                  className="config-service-input-small"
                  type="number"
                  value={s.port ?? ''} 
                  onChange={e => updateService(id, { port: e.target.value })} 
                />
                <span className="config-service-meta">HC: {s.healthCheckPort || s.port || '-'}</span>
              </td>
              <td>
                <input 
                  className="config-service-input-small"
                  type="number"
                  value={s.startOrder ?? ''} 
                  onChange={e => updateService(id, { startOrder: e.target.value })} 
                />
              </td>
              <td>
                <button className="config-action-btn-danger" onClick={() => removeService(id)} title="移除">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="config-scan-btn" style={{ marginTop: '16px', width: '100%' }} onClick={() => addService()}>
        + 手动添加服务
      </button>
    </div>
  )

  const renderIntegrations = () => (
    <div className="config-section">
      <h3 className="config-section-title">外部集成</h3>
      <p className="config-section-subtitle">配置 Redis 缓存及 ClaudeCode AI 集成凭据</p>

      <div className="config-form-grid">
        <ConfigField label="Redis 缓存模式" path="redis.mode">
          <CustomSelect
            value={draft.redis?.mode ?? 'memory'}
            onChange={val => updateDraft('redis.mode', val)}
            options={[
              { value: 'memory', label: '内存缓存' },
              { value: 'redis', label: 'Redis' }
            ]}
          />
        </ConfigField>
        
        <ConfigField label="Redis 主机" path="redis.host">
          <input 
            value={draft.redis?.host ?? ''} 
            onChange={e => updateDraft('redis.host', e.target.value)} 
            disabled={draft.redis?.mode !== 'redis'}
            placeholder="localhost"
          />
        </ConfigField>

        <ConfigField label="ClaudeCode Base URL" path="claudeCode.baseUrl">
          <input 
            value={draft.claudeCode?.baseUrl ?? ''} 
            onChange={e => updateDraft('claudeCode.baseUrl', e.target.value)} 
            placeholder="https://api.anthropic.com"
          />
        </ConfigField>

        <ConfigField label="ClaudeCode API Token" path="claudeCode.authToken">
          <input 
            type="password"
            value={draft.claudeCode?.authToken ?? ''} 
            onChange={e => updateDraft('claudeCode.authToken', e.target.value)} 
            placeholder="sk-..."
          />
        </ConfigField>
      </div>
    </div>
  )

  const renderAdvanced = () => (
    <div className="config-section">
      <h3 className="config-section-title">高级设置</h3>
      <p className="config-section-subtitle">低频修改的运行参数</p>

      <div className="config-form-grid">
        <ConfigField label="最大日志行数" path="maxLogLines">
          <input 
            type="number"
            value={draft.maxLogLines ?? ''} 
            onChange={e => updateDraft('maxLogLines', e.target.value)} 
          />
        </ConfigField>

        <ConfigField label="并行构建任务数" path="package.maxJobs">
          <input 
            type="number"
            value={draft.package?.maxJobs ?? ''} 
            onChange={e => updateDraft('package.maxJobs', e.target.value)} 
            placeholder={`系统建议: ${resolved?.package?.maxJobs || '-'}`}
          />
        </ConfigField>

        <div style={{ display: 'flex', gap: '24px', gridColumn: '1 / -1' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={draft.package?.parallelBuild !== false} 
              onChange={e => updateDraft('package.parallelBuild', e.target.checked)} 
              style={{ width: 'auto', marginRight: '8px' }}
            />
            <span>启用并行构建</span>
          </label>
        </div>
      </div>

      <div className="config-action-grid" style={{ marginTop: '40px' }}>
        <button className="config-action-btn" onClick={() => setShowDiagnosticsModal(true)}>
          <span className="config-action-icon">🔍</span>
          <span className="config-action-label">配置诊断</span>
        </button>
        <button className="config-action-btn" onClick={() => setShowRuntimeModal(true)}>
          <span className="config-action-icon">⚙️</span>
          <span className="config-action-label">运行时信息</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="tab-content config-tab">
      <div className="config-container">
        <div className="config-sidebar">
          <div className={`config-nav-item ${activeTab === 'environment' ? 'active' : ''}`} onClick={() => setActiveTab('environment')}>
            <span className="config-nav-icon">🌍</span> 基础环境
          </div>
          <div className={`config-nav-item ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>
            <span className="config-nav-icon">📋</span> 服务管理
          </div>
          <div className={`config-nav-item ${activeTab === 'integrations' ? 'active' : ''}`} onClick={() => setActiveTab('integrations')}>
            <span className="config-nav-icon">🔗</span> 外部集成
          </div>
          <div className={`config-nav-item ${activeTab === 'advanced' ? 'active' : ''}`} onClick={() => setActiveTab('advanced')}>
            <span className="config-nav-icon">⚙️</span> 高级设置
          </div>
        </div>

        <div className="config-content">
          {activeTab === 'environment' && renderEnvironment()}
          {activeTab === 'services' && renderServices()}
          {activeTab === 'integrations' && renderIntegrations()}
          {activeTab === 'advanced' && renderAdvanced()}
        </div>
      </div>

      <ConfigSaveBar
        dirtyCount={dirtyFields.length}
        validating={validating}
        saving={saving}
        applying={applying}
        hasUnappliedChanges={meta?.hasUnappliedChanges}
        applyImpact={applyImpact}
        onValidate={handleValidate}
        onSave={handleSave}
        onApply={handleApply}
        onReset={resetDraft}
      />

      {showPropertiesModal && (
        <PropertiesDialog onClose={() => setShowPropertiesModal(false)} />
      )}

      {showDiagnosticsModal && (
        <div className="log-modal-overlay" onClick={() => setShowDiagnosticsModal(false)}>
          <div className="log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <h3>配置诊断</h3>
              <button className="log-modal-close" onClick={() => setShowDiagnosticsModal(false)}>✕</button>
            </div>
            <div className="log-modal-body">
              <ConfigDiagnosticsPanel
                diagnostics={diagnostics}
                validation={validation}
                loading={diagnosticsLoading}
                onRefresh={refreshDiagnostics}
              />
            </div>
          </div>
        </div>
      )}

      {showRuntimeModal && (
        <div className="log-modal-overlay" onClick={() => setShowRuntimeModal(false)}>
          <div className="log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <h3>运行时信息</h3>
              <button className="log-modal-close" onClick={() => setShowRuntimeModal(false)}>✕</button>
            </div>
            <div className="log-modal-body">
              <ConfigRuntimePanel
                runtime={runtime}
                resolved={resolved}
                meta={meta}
                applyImpact={applyImpact}
              />
            </div>
          </div>
        </div>
      )}
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
