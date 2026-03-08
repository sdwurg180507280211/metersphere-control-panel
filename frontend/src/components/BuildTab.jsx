import { useEffect, useCallback, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useBuildStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import ConfirmDialog from './ConfirmDialog'
import './BuildTab.css'

function BuildTab() {
  const { modules, activeBuilds, fetchModules, fetchActiveBuilds, addActiveBuild } = useBuildStore()
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, moduleId: null, moduleName: '' })

  useEffect(() => {
    fetchModules()
    fetchActiveBuilds()
    const interval = setInterval(fetchActiveBuilds, 2000)
    return () => clearInterval(interval)
  }, [fetchModules, fetchActiveBuilds])

  const isBuilding = activeBuilds.some((build) => build.status === 'running')

  const handleBuildClick = useCallback((moduleId) => {
    const module = modules.find((item) => item.id === moduleId)
    if (!module) return

    if (isBuilding) {
      toast.error('已有构建任务进行中')
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
        toast.success(`开始构建 ${module.name}`)
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

  return (
    <div className="page-container">
      {/* 顶部：模块列表 */}
      <div className="top-section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-title-icon">📦</span>
            前端模块
            <span className="section-count">{modules.length}</span>
          </div>
          {isBuilding && (
            <div className="building-indicator">
              <span className="spinner" />
              构建中...
            </div>
          )}
        </div>
        <div className="section-body">
          <div className="modules-grid">
            {modules.map((module) => (
              <button
                key={module.id}
                className={`module-btn ${isBuilding ? 'disabled' : ''}`}
                onClick={() => handleBuildClick(module.id)}
                disabled={isBuilding}
              >
                <span className="module-btn-icon">📦</span>
                <span>{module.name}</span>
                {isBuilding && <span className="module-btn-spinner" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 底部：构建日志 */}
      <div className="bottom-section">
        <LogViewer type="build" />
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
    </div>
  )
}

export default BuildTab
