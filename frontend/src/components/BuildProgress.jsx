import { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useBuildStore } from '../store/useAppStore'
import './BuildProgress.css'

function BuildProgress() {
  const { activeBuilds, fetchActiveBuilds, cancelBuild, removeActiveBuild } = useBuildStore()

  useEffect(() => {
    fetchActiveBuilds()
    const interval = setInterval(fetchActiveBuilds, 5000)
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
        <BuildCard
          key={build.id}
          build={build}
          onCancel={() => handleCancel(build.id)}
          onDismiss={() => handleDismiss(build.id)}
        />
      ))}
    </div>
  )
}

function BuildCard({ build, onCancel, onDismiss }) {
  const isRunning = build.status === 'running'
  const isFailed = build.status === 'failed'
  const isSuccess = build.status === 'success'
  const isCancelled = build.status === 'cancelled'

  const formatDuration = (ms) => {
    if (!ms) return ''
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}秒`
    const minutes = Math.floor(seconds / 60)
    const remaining = seconds % 60
    return `${minutes}分${remaining}秒`
  }

  return (
    <div className={`build-card ${build.status}`}>
      <div className="build-card-header">
        <div className="build-info">
          <span className="build-module">{build.module}</span>
          <span className={`build-status ${build.status}`}>
            {isRunning && '🔄'}
            {isSuccess && '✅'}
            {isFailed && '❌'}
            {isCancelled && '🚫'}{' '}
            {getStatusText(build.status)}
          </span>
        </div>
        <div className="build-actions">
          {isRunning && (
            <button className="btn-cancel" onClick={onCancel}>
              取消
            </button>
          )}
          {!isRunning && (
            <button className="btn-dismiss" onClick={onDismiss}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="build-progress-bar">
        <div
          className="build-progress-fill"
          style={{ width: `${build.overallProgress || 0}%` }}
        />
      </div>

      <div className="build-details">
        <div className="build-step">
          <span className="step-name">{build.stepName || '准备中...'}</span>
          <span className="step-progress">步骤 {build.currentStep + 1} / {build.totalSteps}</span>
        </div>

        {build.duration && (
          <div className="build-duration">
            耗时: {formatDuration(build.duration)}
          </div>
        )}
      </div>

      {build.error && (
        <div className="build-error">
          错误: {build.error}
        </div>
      )}
    </div>
  )
}

function getStatusText(status) {
  const map = {
    running: '构建中',
    success: '构建成功',
    failed: '构建失败',
    cancelled: '已取消'
  }
  return map[status] || status
}

export default BuildProgress
