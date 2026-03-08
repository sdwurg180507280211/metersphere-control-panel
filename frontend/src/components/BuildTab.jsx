import { useEffect, useCallback, useState, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { useBuildStore } from '../store/useAppStore'
import LogViewer from './LogViewer'
import BuildProgress from './BuildProgress'
import BuildHistory from './BuildHistory'
import EmptyState from './EmptyState'
import ConfirmDialog from './ConfirmDialog'
import Tooltip from './Tooltip'
import { ModuleButtonSkeleton, BuildProgressSkeleton } from './Skeleton'
import './BuildTab.css'

function BuildTab({ searchInputRef }) {
  const { modules, activeBuilds, loading, fetchModules, fetchActiveBuilds, addActiveBuild } = useBuildStore()
  const [initialLoading, setInitialLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, moduleId: null, moduleName: '' })

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchModules(), fetchActiveBuilds()])
      // 模拟短暂延迟以确保骨架屏有足够时间展示
      setTimeout(() => setInitialLoading(false), 300)
    }
    loadData()
  }, [fetchModules, fetchActiveBuilds])

  const isBuilding = activeBuilds.some((build) => build.status === 'running')
  const buildCount = activeBuilds.length

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
    const { moduleId, moduleName } = confirmDialog
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

  // 渲染骨架屏
  if (initialLoading) {
    return (
      <div className="tab-content build-tab">
        <div className="build-control skeleton-wrapper">
          <div className="build-control-header">
            <h3 className="section-title">
              前端模块
              <span className="loading-dots">加载中</span>
            </h3>
          </div>
          <div className="module-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <ModuleButtonSkeleton key={i} />
            ))}
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
      {/* 构建进度条 - 紧凑模式 */}
      {buildCount > 0 && <BuildProgress />}

      {/* 构建历史 */}
      <BuildHistory />

      {/* 构建控制区 */}
      <div className="build-control">
        <div className="build-control-header">
          <h3 className="section-title">
            前端模块
            {isBuilding && (
              <span className="building-indicator">
                <span className="pulse-dot" />
                构建中
              </span>
            )}
          </h3>
          <span className="module-count">{modules.length} 个模块</span>
        </div>
        
        {modules.length === 0 ? (
          <EmptyState type="modules" />
        ) : (
          <div className="module-list">
            {modules.map((module, index) => (
              <Tooltip 
                key={module.id} 
                content={isBuilding ? '等待当前构建完成' : `构建 ${module.name}`}
                position="top"
              >
                <button
                  className={`module-btn ${isBuilding ? 'disabled' : ''}`}
                  onClick={() => handleBuildClick(module.id)}
                  disabled={isBuilding}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span className="module-icon">📦</span>
                  <span className="module-name">{module.name}</span>
                  {isBuilding && <span className="module-spinner" />}
                </button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>

      {/* 构建日志 */}
      <div className="build-log-section">
        <div className="log-header">
          <h3 className="section-title">构建日志</h3>
        </div>
        <LogViewer type="build" searchInputRef={searchInputRef} />
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="确认构建"
        message={`确定要开始构建 ${confirmDialog.moduleName} 吗？`}
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
