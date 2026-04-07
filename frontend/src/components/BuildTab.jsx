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
  const [devServers, setDevServers] = useState({
    runningModules: new Map(), // key: moduleId, value: module info
    loadingModules: new Set()  // 正在启动/停止中的模块 ID
  })

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchModules(), fetchActiveBuilds()])
      setTimeout(() => setInitialLoading(false), 300)
    }
    loadData()

    const fetchDevServerStatus = async () => {
      try {
        const res = await fetch('/api/build/dev-server/status')
        const data = await res.json()
        if (data.success && data.data) {
          const newRunningModules = new Map()
          // 兼容旧版单模块返回格式
          if (data.data.module) {
            if (data.data.running && data.data.module) {
              newRunningModules.set(data.data.module.id, data.data.module)
            }
          } else if (data.data.runningModules) {
            // 新版多模块返回格式
            Object.entries(data.data.runningModules).forEach(([id, module]) => {
              newRunningModules.set(parseInt(id) || id, module)
            })
          }

          // 只在 runningModules 变化时更新状态，不改变 loadingModules
          setDevServers(prev => {
            if (prev.runningModules.size !== newRunningModules.size) {
              return { ...prev, runningModules: newRunningModules }
            }
            // 检查每个条目是否相同
            for (const [id, module] of newRunningModules) {
              const prevModule = prev.runningModules.get(id)
              if (!prevModule ||
                  prevModule.id !== module.id ||
                  prevModule.port !== module.port ||
                  prevModule.name !== module.name) {
                return { ...prev, runningModules: newRunningModules }
              }
            }
            // 没有变化，不更新
            return prev
          })
        }
      } catch (e) {
        console.error('获取开发服务器状态失败:', e)
      }
    }
    fetchDevServerStatus()

    // 定时轮询开发服务器状态，每 5 秒刷新一次，及时发现被外部杀死的进程
    const interval = setInterval(fetchDevServerStatus, 5000)
    return () => clearInterval(interval)
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
        const errorMsg = typeof data.error === 'string' ? data.error : data.error?.message || '启动构建失败'
        toast.error(errorMsg)
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

  // Helper to update loading state
  const setLoading = useCallback((moduleId, isLoading) => {
    setDevServers(prev => {
      const loadingModules = new Set(prev.loadingModules)
      if (isLoading) {
        loadingModules.add(moduleId)
      } else {
        loadingModules.delete(moduleId)
      }
      return { ...prev, loadingModules }
    })
  }, [])

  const handleStartDevServer = useCallback(async (moduleId) => {
    setLoading(moduleId, true)
    try {
      const res = await fetch('/api/build/dev-server/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId })
      })
      const data = await res.json()
      if (data.success) {
        setDevServers(prev => {
          const runningModules = new Map(prev.runningModules)
          runningModules.set(moduleId, data.module)
          const loadingModules = new Set(prev.loadingModules)
          loadingModules.delete(moduleId)
          return { runningModules, loadingModules }
        })
        toast.success('开发服务器已启动', { icon: '🚀' })
      } else {
        const errorMsg = typeof data.error === 'string' ? data.error : data.error?.message || '启动失败'
        toast.error(errorMsg)
        setLoading(moduleId, false)
      }
    } catch (error) {
      toast.error(`启动失败: ${error.message}`)
      setLoading(moduleId, false)
    }
  }, [setLoading])

  const handleStopDevServer = useCallback(async (moduleId) => {
    setLoading(moduleId, true)
    try {
      const res = await fetch('/api/build/dev-server/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId })
      })
      const data = await res.json()
      if (data.success) {
        setDevServers(prev => {
          const runningModules = new Map(prev.runningModules)
          runningModules.delete(moduleId)
          const loadingModules = new Set(prev.loadingModules)
          loadingModules.delete(moduleId)
          return { runningModules, loadingModules }
        })
        toast.success('开发服务器已停止')
      } else {
        const errorMsg = typeof data.error === 'string' ? data.error : data.error?.message || '停止失败'
        toast.error(errorMsg)
        setLoading(moduleId, false)
      }
    } catch (error) {
      toast.error(`停止失败: ${error.message}`)
      setLoading(moduleId, false)
    }
  }, [setLoading])

  const handleOpenDevServer = useCallback((moduleId) => {
    const module = devServers.runningModules.get(moduleId)
    const port = module?.port || 4200
    window.open(`http://127.0.0.1:${port}`, '_blank')
  }, [devServers.runningModules])

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
              <div className="build-control-header">
                <h3 className="section-title">前端模块</h3>
                <span className="module-count">{modules.length} 个模块</span>
              </div>

              <div className="module-list">
                {modules.map((module, index) => {
                  const isRunningDev = devServers.runningModules.has(module.id)
                  const isBuildingThis = activeBuilds.some(b => b.moduleId === module.id && b.status === 'running')
                  const isLoading = devServers.loadingModules.has(module.id)

                  return (
                    <div
                      key={module.id}
                      className={`module-card ${isRunningDev ? 'running' : isBuildingThis ? 'building' : 'idle'}`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="module-btn-main">
                        <div className="module-btn-content">
                          <div className="module-main-row">
                            <div className="module-info">
                              <span className={`module-status-icon ${isRunningDev || isBuildingThis ? 'spinning' : ''}`}>
                                {isRunningDev ? '⚡' : isBuildingThis ? '⚙️' : '○'}
                              </span>
                              <span className="module-name">{module.name}</span>
                            </div>
                            <span className={`module-status-badge ${isRunningDev ? 'running' : isBuildingThis ? 'building' : 'idle'}`}>
                              {isRunningDev ? '运行中' : isBuildingThis ? '构建中' : '空闲'}
                            </span>
                          </div>

                          <div className="module-meta-row" style={{ marginTop: '12px', flexDirection: 'column', gap: '8px' }}>
                            {!isRunningDev ? (
                              <button
                                className="btn-dev-server btn-start"
                                onClick={() => handleStartDevServer(module.id)}
                                disabled={isLoading || isBuilding}
                                style={{ width: '100%' }}
                              >
                                {isLoading ? '启动中...' : '启动开发服务器'}
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                <button
                                  className="btn-dev-server btn-open"
                                  onClick={() => handleOpenDevServer(module.id)}
                                  disabled={isLoading}
                                  style={{ flex: 1 }}
                                >
                                  🌐 打开
                                </button>
                                <button
                                  className="btn-dev-server btn-stop"
                                  onClick={() => handleStopDevServer(module.id)}
                                  disabled={isLoading}
                                  style={{ flex: 1 }}
                                >
                                  {isLoading ? '停止中...' : '停止'}
                                </button>
                              </div>
                            )}

                            <button
                              className="btn-dev-server btn-start"
                              onClick={() => handleBuildClick(module.id)}
                              disabled={isBuilding || isRunningDev}
                              style={{ width: '100%' }}
                            >
                              构建生产版本
                            </button>
                          </div>
                        </div>
                      </div>
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
