import { useEffect, useCallback, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useBuildStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import EmptyState from './EmptyState'
import ConfirmDialog from './ConfirmDialog'
import BackendBuildPromptDialog from './BackendBuildPromptDialog'
import Tooltip from './Tooltip'
import { ModuleButtonSkeleton } from './Skeleton'
import './BuildTab.css'

function BuildTab({ searchInputRef }) {
  const { modules, activeBuilds, fetchModules, fetchActiveBuilds, addActiveBuild } = useBuildStore()
  const [initialLoading, setInitialLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, moduleId: null, moduleName: '' })
  const [backendPrompt, setBackendPrompt] = useState({ isOpen: false })
  const [devServer, setDevServer] = useState({ running: false, module: null, loading: false })

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchModules(), fetchActiveBuilds()])
      setTimeout(() => setInitialLoading(false), 300)
    }
    loadData()

    // 获取开发服务器状态
    fetch('/api/build/dev-server/status')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDevServer({ running: data.data.running, module: data.data.module, loading: false })
        }
      })
      .catch(() => {})
  }, [fetchModules, fetchActiveBuilds])

  useEffect(() => {
    const handleBuildComplete = (event) => {
      if (event.detail?.status === 'success') {
        setBackendPrompt({ isOpen: true })
      }
    }
    window.addEventListener('buildComplete', handleBuildComplete)
    return () => window.removeEventListener('buildComplete', handleBuildComplete)
  }, [])

  const isBuilding = activeBuilds.some((build) => build.status === 'running')
  const buildCount = activeBuilds.length
  const successCount = activeBuilds.filter((build) => build.status === 'success').length
  const failedCount = activeBuilds.filter((build) => build.status === 'failed').length

  const handleBuildClick = useCallback((moduleId) => {
    const module = modules.find((item) => item.id === moduleId)
    if (!module) return

    if (isBuilding) {
      toast.error('已有构建任务进行中，请等待完成')
      return
    }

    setConfirmDialog({
      isOpen: true,
      moduleId,
      moduleName: module.name
    })
  }, [isBuilding, modules])

  const handleConfirmBuild = useCallback(async () => {
    const { moduleId } = confirmDialog
    setConfirmDialog({ isOpen: false, moduleId: null, moduleName: '' })

    const module = modules.find((item) => item.id === moduleId)
    if (!module) return

    try {
      const res = await fetch('/api/build/frontend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId })
      })

      const data = await res.json()

      if (data.success) {
        toast.success(`已启动 ${module.name} 的构建`, {
          icon: '🚀',
        })
        if (data.buildId) {
          addActiveBuild({
            id: data.buildId,
            module: module.name,
            moduleId: module.id,
            status: 'running',
            currentStep: 0,
            totalSteps: 5,
            overallProgress: 0,
            stepName: '准备环境'
          })
        }
      } else {
        toast.error(data.error || '启动构建失败')
      }
    } catch (error) {
      toast.error(`网络错误: ${error.message}`)
    }
  }, [confirmDialog, modules, addActiveBuild])

  const handleBuildBackend = useCallback(() => {
    setBackendPrompt({ isOpen: false })
    window.dispatchEvent(new CustomEvent('switchTab', { detail: 'services' }))
    toast.success('已切换到服务管理，请启动后端服务', { icon: '🚀' })
  }, [])

  const handleCancelBackendPrompt = useCallback(() => {
    setBackendPrompt({ isOpen: false })
  }, [])

  const handleStartDevServer = useCallback(async (moduleId) => {
    setDevServer(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/build/dev-server/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId })
      })
      const data = await res.json()
      if (data.success) {
        setDevServer({ running: true, module: data.module, loading: false })
        toast.success('开发服务器已启动', { icon: '🚀' })
      } else {
        toast.error(data.error || '启动失败')
        setDevServer(prev => ({ ...prev, loading: false }))
      }
    } catch (error) {
      toast.error(`启动失败: ${error.message}`)
      setDevServer(prev => ({ ...prev, loading: false }))
    }
  }, [])

  const handleStopDevServer = useCallback(async () => {
    setDevServer(prev => ({ ...prev, loading: true }))
    try {
      const res = await fetch('/api/build/dev-server/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (data.success) {
        setDevServer({ running: false, module: null, loading: false })
        toast.success('开发服务器已停止')
      } else {
        toast.error(data.error || '停止失败')
        setDevServer(prev => ({ ...prev, loading: false }))
      }
    } catch (error) {
      toast.error(`停止失败: ${error.message}`)
      setDevServer(prev => ({ ...prev, loading: false }))
    }
  }, [])

  const handleOpenDevServer = useCallback(() => {
    window.open('http://localhost:4200', '_blank')
  }, [])

  if (initialLoading) {
    return (
      <div className="tab-content build-tab">
        <div className="build-workspace">
          <div className="build-control skeleton-wrapper">
            <div className="build-control-header">
              <h3 className="section-title">
                构建模块
                <span className="loading-dots">加载中</span>
              </h3>
            </div>
            <div className="module-list">
              {Array.from({ length: 6 }).map((_, i) => (
                <ModuleButtonSkeleton key={i} />
              ))}
            </div>
          </div>
        </div>

        <div className="build-log-section skeleton-wrapper">
          <div className="log-header">
            <h3 className="section-title">构建日志</h3>
          </div>
          <div className="log-container skeleton-log-placeholder">
            <div className="skeleton-log-lines">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton-log-line" style={{ width: `${60 + Math.random() * 40}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-content build-tab">
      <div className="build-workspace">
        <section className="build-control">
          {modules.length === 0 ? (
            <EmptyState type="modules" />
          ) : (
            <>
              <div className="dev-server-panel">
                <div className="dev-server-header">
                  <h3>前端开发服务器</h3>
                  {devServer.running && devServer.module && (
                    <span className="dev-server-status running">运行中: {devServer.module.name}</span>
                  )}
                  {!devServer.running && (
                    <span className="dev-server-status stopped">未运行</span>
                  )}
                </div>
                <div className="dev-server-controls">
                  {!devServer.running ? (
                    <select
                      className="dev-server-select"
                      onChange={(e) => e.target.value && handleStartDevServer(e.target.value)}
                      disabled={devServer.loading}
                      value=""
                    >
                      <option value="">选择模块启动...</option>
                      {modules.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <button
                        className="btn-dev-server btn-open"
                        onClick={handleOpenDevServer}
                        disabled={devServer.loading}
                      >
                        🌐 打开网页
                      </button>
                      <button
                        className="btn-dev-server btn-stop"
                        onClick={handleStopDevServer}
                        disabled={devServer.loading}
                      >
                        ⏹ 停止服务器
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="module-list">
              {modules.map((module, index) => {
                const isBuildingThis = activeBuilds.some(b => b.moduleId === module.id && b.status === 'running')
                return (
                  <div
                    key={module.id}
                    className={`module-card ${isBuildingThis ? 'building' : 'idle'}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <button
                      className="module-btn-main"
                      onClick={() => handleBuildClick(module.id)}
                      disabled={isBuilding}
                    >
                      <div className="module-btn-content">
                        <div className="module-main-row">
                          <div className="module-info">
                            <span className={`module-status-icon ${isBuildingThis ? 'spinning' : ''}`}>
                              {isBuildingThis ? '⚙️' : '○'}
                            </span>
                            <span className="module-name">{module.name}</span>
                          </div>
                          <span className={`module-status-badge ${isBuildingThis ? 'building' : 'idle'}`}>
                            {isBuildingThis ? '构建中' : '空闲'}
                          </span>
                        </div>
                        <div className="module-meta-row">
                          {!isBuilding && (
                            <span className="module-action-hint">点击构建</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
            </>
          )}
        </section>

        <aside className="build-log-panel">
          <div className="card-header">
            <h2 className="card-title">构建日志</h2>
          </div>
          <LogViewer type="build" searchInputRef={searchInputRef} />
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="确认构建"
        message={`确定要构建 ${confirmDialog.moduleName} 吗？`}
        confirmText="开始构建"
        cancelText="取消"
        type="info"
        onConfirm={handleConfirmBuild}
        onCancel={() => setConfirmDialog({ isOpen: false, moduleId: null, moduleName: '' })}
      />

      <BackendBuildPromptDialog
        isOpen={backendPrompt.isOpen}
        onBuildBackend={handleBuildBackend}
        onCancel={handleCancelBackendPrompt}
      />
    </div>
  )
}

export default BuildTab
