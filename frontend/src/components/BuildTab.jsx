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
  const buildCount = activeBuilds.length

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
    <div className="tab-content build-tab">
      {/* 构建进度条 - 紧凑模式 */}
      {buildCount > 0 && <BuildProgress />}

      {/* 构建控制区 */}
      <div className="build-control">
        <div className="build-control-header">
          <h3 className="section-title">
            前端模块
            {isBuilding && <span className="building-indicator">构建中...</span>}
          </h3>
          <span className="module-count">{modules.length} 个模块</span>
        </div>
        
        <div className="module-list">
          {modules.map((module) => (
            <button
              key={module.id}
              className="module-btn"
              onClick={() => handleBuild(module.id)}
              disabled={isBuilding}
              title={isBuilding ? '等待当前构建完成' : `构建 ${module.name}`}
            >
              <span className="module-icon">📦</span>
              <span className="module-name">{module.name}</span>
              {isBuilding && <span className="module-spinner">⏳</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 构建日志 */}
      <div className="build-log-section">
        <div className="log-header">
          <h3 className="section-title">构建日志</h3>
        </div>
        <LogViewer type="build" />
      </div>
    </div>
  )
}

export default BuildTab
