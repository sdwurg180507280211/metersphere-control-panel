import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useBuildStore, useConfigStore, usePackageStore, useServiceStore } from '../store/useAppStore'
import ConfigGeneralSection from './ConfigGeneralSection'
import ConfigServicesSection from './ConfigServicesSection'
import ConfigPackageSection from './ConfigPackageSection'
import ConfigRuntimePanel from './ConfigRuntimePanel'
import ConfigDiagnosticsPanel from './ConfigDiagnosticsPanel'
import ConfigSaveBar from './ConfigSaveBar'
import './ConfigTab.css'

function ConfigTab() {
  const [showServicesModal, setShowServicesModal] = useState(false)

  const {
    snapshot,
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
    refreshDiagnostics
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
  const validationErrorCount = validation?.errors?.length || 0
  const validationWarningCount = validation?.warnings?.length || 0
  const diagnosticsIssueCount = (diagnostics?.errors?.length || 0) + (diagnostics?.warnings?.length || 0)

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

      if (result.requiresRestart?.length > 0) {
        toast.success('配置已应用，部分字段需重启控制面板')
      } else {
        toast.success('配置已应用到运行时')
      }
    } catch (error) {
      if (error.details?.blockingJobs?.length) {
        toast.error(`存在 ${error.details.blockingJobs.length} 个运行中任务，暂时无法应用`)
        return
      }
      toast.error(error.message || '应用配置失败')
    }
  }

  const handleRefreshDiagnostics = async () => {
    try {
      await refreshDiagnostics()
      toast.success('诊断信息已刷新')
    } catch (error) {
      toast.error(error.message || '刷新诊断失败')
    }
  }

  if (loading || !draft) {
    return (
      <div className="tab-content config-tab config-tab-loading">
        <div className="config-loading-card">正在加载配置快照...</div>
      </div>
    )
  }

  return (
    <div className="tab-content config-tab">
      <div className="config-layout">
        <div className="config-main">
          <ConfigGeneralSection
            draft={draft}
            resolved={resolved}
            meta={meta}
            fieldErrors={fieldErrors}
            fieldWarnings={fieldWarnings}
            onChange={updateDraft}
          />
          <ConfigPackageSection
            packageConfig={draft.package || {}}
            resolved={resolved}
            fieldErrors={fieldErrors}
            fieldWarnings={fieldWarnings}
            onChange={updateDraft}
          />
          <section className="config-card">
            <button className="config-primary-btn" onClick={() => setShowServicesModal(true)} style={{ width: '100%' }}>
              📋 服务配置
            </button>
          </section>
        </div>

        <div className="config-side">
          <ConfigRuntimePanel
            runtime={runtime}
            resolved={resolved}
            meta={meta}
            applyImpact={applyImpact}
          />
          <ConfigDiagnosticsPanel
            diagnostics={diagnostics}
            validation={validation}
            loading={diagnosticsLoading}
            onRefresh={handleRefreshDiagnostics}
          />
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

      {showServicesModal && (
        <div className="log-modal-overlay" onClick={() => setShowServicesModal(false)}>
          <div className="log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <h3>服务配置</h3>
              <button className="log-modal-close" onClick={() => setShowServicesModal(false)}>✕</button>
            </div>
            <div className="log-modal-body">
              <ConfigServicesSection
                services={draft.services || {}}
                fieldErrors={fieldErrors}
                fieldWarnings={fieldWarnings}
                onAddService={addService}
                onUpdateService={updateService}
                onRemoveService={removeService}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function buildFieldMap(items) {
  return items.reduce((acc, item) => {
    const key = item.path || 'global'
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(item.message)
    return acc
  }, {})
}

export default ConfigTab
