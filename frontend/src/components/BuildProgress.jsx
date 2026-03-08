import { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useBuildStore } from '../store/useAppStore'
import './BuildProgress.css'

function BuildProgress() {
  const { activeBuilds, fetchActiveBuilds, cancelBuild, removeActiveBuild } = useBuildStore()

  useEffect(() => {
    fetchActiveBuilds()
    const interval = setInterval(fetchActiveBuilds, 2000)
    return () => clearInterval(interval)
  }, [fetchActiveBuilds])

  const handleCancel = async (buildId) => {
    if (!window.confirm('确定要取消这个构建任务吗？')) {
      return
    }

    const success = await cancelBuild(buildId)
    if (success) {
      toast.success('已发送取消请求')
    } else {
      toast.error('取消失败，任务可能已结束')
    }
  }

  const handleDismiss = (buildId) => {
    removeActiveBuild(buildId)
  }

  if (activeBuilds.length === 0) return null

  return (
    <div className="build-progress-container">
      {activeBuilds.map((build) => (
        <BuildItem
          key={build.id}
          build={build}
          onCancel={() => handleCancel(build.id)}
          onDismiss={() => handleDismiss(build.id)}
        />
      ))}
    </div>
  )
}

function BuildItem({ build, onCancel, onDismiss }) {
  const isRunning = build.status === 'running'
  const isFailed = build.status === 'failed'
  const isSuccess = build.status === 'success'

  const formatDuration = (ms) => {
    if (!ms) return ''
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remaining = seconds % 60
    return `${minutes}m${remaining}s`
  }

  const progress = build.overallProgress || 0
  const currentStep = build.currentStep || 0
  const totalSteps = build.totalSteps || 5

  return (
    <div className={`build-item ${build.status}`}>
      {/* 左侧：状态图标 */}
      <div className="build-item-status">
        {isRunning && <span className="status-icon spin">⚙️</span>}
        {isSuccess && <span className="status-icon success">✓</span>}
        {isFailed && <span className="status-icon failed">✕</span>}
        {!isRunning && !isSuccess && !isFailed && (
          <span className="status-icon">⏹</span>
        )}
      </div>

      {/* 中间：进度信息 */}
      <div className="build-item-content">
        <div className="build-item-header">
          <span className="build-module">{build.module}</span>
          <span className="build-percent">{Math.round(progress)}%</span>
        </div>
        
        <div className="build-mini-bar">
          <div 
            className={`build-mini-fill ${isRunning ? 'animated' : ''}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="build-item-meta">
          <span className="step-text">{build.stepName || '准备中'}</span>
          <span className="step-count">{currentStep + 1}/{totalSteps}</span>
          {build.duration && (
            <span className="duration">⏱ {formatDuration(build.duration)}</span>
          )}
        </div>

        {build.error && (
          <div className="build-item-error" title={build.error}>
            {build.error}
          </div>
        )}
      </div>

      {/* 右侧：操作按钮 */}
      <div className="build-item-actions">
        {isRunning ? (
          <button className="btn-item-cancel" onClick={onCancel} title="取消">
            ⏹
          </button>
        ) : (
          <button className="btn-item-dismiss" onClick={onDismiss} title="关闭">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

export default BuildProgress
