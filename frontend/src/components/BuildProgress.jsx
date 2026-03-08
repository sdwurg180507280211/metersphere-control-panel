import { useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useBuildStore } from '../store/useAppStore'
import ConfirmDialog from './ConfirmDialog'
import './BuildProgress.css'
import { useState } from 'react'

function BuildProgress() {
  const { activeBuilds, fetchActiveBuilds, cancelBuild, removeActiveBuild } = useBuildStore()
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, buildId: null, buildName: '' })

  useEffect(() => {
    fetchActiveBuilds()
    const interval = setInterval(fetchActiveBuilds, 2000)
    return () => clearInterval(interval)
  }, [fetchActiveBuilds])

  const handleCancelClick = (buildId, buildName) => {
    setConfirmDialog({ isOpen: true, buildId, buildName })
  }

  const handleConfirmCancel = async () => {
    const { buildId } = confirmDialog
    setConfirmDialog({ isOpen: false, buildId: null, buildName: '' })
    
    const success = await cancelBuild(buildId)
    if (success) {
      toast.success('已发送取消请求')
    } else {
      toast.error('取消失败，任务可能已结束')
    }
  }

  const handleDismiss = (buildId, module, status) => {
    removeActiveBuild(buildId)
    if (status === 'success') {
      toast.success(`${module} 构建完成`, { icon: '✅' })
    } else if (status === 'failed') {
      toast.error(`${module} 构建失败`, { icon: '❌' })
    }
  }

  if (activeBuilds.length === 0) return null

  return (
    <>
      <div className="build-progress-container">
        {activeBuilds.map((build, index) => (
          <BuildItem
            key={build.id}
            build={build}
            index={index}
            onCancel={() => handleCancelClick(build.id, build.module)}
            onDismiss={() => handleDismiss(build.id, build.module, build.status)}
          />
        ))}
      </div>
      
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="确认取消构建"
        message={`确定要取消 ${confirmDialog.buildName} 的构建任务吗？`}
        confirmText="确认取消"
        cancelText="继续构建"
        type="warning"
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmDialog({ isOpen: false, buildId: null, buildName: '' })}
      />
    </>
  )
}

function BuildItem({ build, index, onCancel, onDismiss }) {
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

  const getStatusIcon = () => {
    if (isRunning) return '⚙️'
    if (isSuccess) return '✅'
    if (isFailed) return '❌'
    return '⏹'
  }

  const getStatusClass = () => {
    if (isRunning) return 'running'
    if (isSuccess) return 'success'
    if (isFailed) return 'failed'
    return ''
  }

  return (
    <div 
      className={`build-item ${getStatusClass()}`}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* 左侧：状态图标 */}
      <div className="build-item-status">
        <span className={`status-icon ${isRunning ? 'spin' : ''}`}>
          {getStatusIcon()}
        </span>
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
          <span className="step-text" title={build.stepName}>
            {build.stepName || '准备中'}
          </span>
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
          <button 
            className="btn-item-cancel" 
            onClick={onCancel} 
            title="取消构建"
          >
            <span className="cancel-icon">⏹</span>
            <span className="cancel-text">取消</span>
          </button>
        ) : (
          <button 
            className={`btn-item-dismiss ${isSuccess ? 'success' : isFailed ? 'failed' : ''}`}
            onClick={onDismiss} 
            title="关闭"
          >
            <span className="dismiss-icon">✕</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default BuildProgress
