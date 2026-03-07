import { useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useBuildStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import BuildProgress from './BuildProgress'
import './BuildTab.css'

function BuildTab() {
  const { modules, activeBuilds, fetchModules, fetchActiveBuilds, addActiveBuild } = useBuildStore()

  useEffect(() => {
    fetchModules()
    fetchActiveBuilds()
  }, [fetchModules, fetchActiveBuilds])

  const isBuilding = activeBuilds.some((build) => build.status === 'running')

  const handleBuild = useCallback(async (moduleId) => {
    if (isBuilding) {
      toast.error('已有构建任务进行中，请等待完成')
      return
    }

    const module = modules.find((item) => item.id === moduleId)
    if (!module) {
      toast.error('模块不存在')
      return
    }

    try {
      const res = await fetch('/api/build/frontend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId })
      })

      const data = await res.json()

      if (data.success) {
        toast.success(`已启动 ${module.name} 的构建`)
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
  }, [isBuilding, modules, addActiveBuild])

  return (
    <div className="tab-content">
      <BuildProgress />

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">前端构建</h2>
          {isBuilding && <span className="building-badge">构建中...</span>}
        </div>
        <div className="btn-grid">
          {modules.map((module) => (
            <button
              key={module.id}
              className="btn-build"
              onClick={() => handleBuild(module.id)}
              disabled={isBuilding}
            >
              {module.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card log-card">
        <div className="card-header">
          <h2 className="card-title">构建日志</h2>
        </div>
        <LogViewer type="build" />
      </div>
    </div>
  )
}

export default BuildTab
