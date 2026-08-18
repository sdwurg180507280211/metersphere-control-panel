import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { usePackageStore } from '../store/useAppStore'

const POLL_INTERVAL_MS = 5000

const STAGE_LABELS = {
  prepare: '准备任务',
  spawn: '启动脚本',
  running: '执行打包',
  preflight: '环境检查',
  dependencies: '依赖初始化',
  build_modules: '模块构建',
  maven_build: 'Maven 编译',
  docker_build: 'Docker 镜像',
  export_images: '镜像导出',
  summary: '结果汇总',
  cancelling: '正在取消'
}

function extractError(data, fallback) {
  const error = data?.error
  if (error && typeof error === 'object') {
    return error.message || fallback
  }
  return error || fallback
}

export default function PackageTaskGuard() {
  const currentTask = usePackageStore((state) => state.currentTask)
  const fetchActiveTask = usePackageStore((state) => state.fetchActiveTask)
  const [cancelling, setCancelling] = useState(false)

  const isRunning = ['pending', 'running'].includes(currentTask?.status)
  const isCancelling = cancelling || currentTask?.stage === 'cancelling'
  const progress = Math.max(0, Math.min(100, Math.round(Number(currentTask?.progress) || 0)))
  const buildProgress = currentTask?.metadata?.buildProgress || null
  const stageLabel = STAGE_LABELS[currentTask?.stage] || currentTask?.stage || '执行打包'

  const moduleSummary = useMemo(() => {
    if (!buildProgress) return null
    const total = Number(buildProgress.totalModules) || 0
    const completed = buildProgress.completedModules?.length || 0
    const failed = buildProgress.failedModules?.length || 0
    const active = buildProgress.activeModules || []

    if (active.length > 0) {
      return `${completed}/${total} 完成 · 当前 ${active.slice(0, 2).join(', ')}${active.length > 2 ? '…' : ''}${failed > 0 ? ` · ${failed} 失败` : ''}`
    }
    if (total > 0) {
      return `${completed}/${total} 完成${failed > 0 ? ` · ${failed} 失败` : ''}`
    }
    return null
  }, [buildProgress])

  useEffect(() => {
    if (!isRunning) {
      setCancelling(false)
      return undefined
    }

    const timer = setInterval(() => {
      fetchActiveTask().catch(() => null)
    }, POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [fetchActiveTask, isRunning])

  if (!isRunning) {
    return null
  }

  const services = currentTask?.metadata?.services || []
  const message = currentTask?.message || (isCancelling ? '正在取消打包任务' : '打包任务运行中')

  const handleCancel = async () => {
    if (isCancelling || !currentTask?.jobId) return

    setCancelling(true)
    try {
      const response = await fetch('/api/package/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentTask.jobId })
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(extractError(data, '取消打包失败'))
      }
      toast.success('已发送取消打包请求')
      await fetchActiveTask().catch(() => null)
    } catch (error) {
      setCancelling(false)
      toast.error(error.message || '取消打包失败')
    }
  }

  return (
    <div style={styles.container} role="status" aria-live="polite">
      <div style={styles.indicator} aria-hidden="true" />
      <div style={styles.content}>
        <div style={styles.titleRow}>
          <strong style={styles.title}>{isCancelling ? '正在取消打包' : '打包运行中'}</strong>
          <span style={styles.stage}>{stageLabel}</span>
          <span style={styles.progressText}>{progress}%</span>
          <span style={styles.jobId}>{currentTask.jobId}</span>
        </div>
        <div style={styles.progressTrack} aria-label={`打包进度 ${progress}%`}>
          <div style={{ ...styles.progressBar, width: `${progress}%` }} />
        </div>
        <div style={styles.message}>{message}</div>
        {moduleSummary ? (
          <div style={styles.services}>{moduleSummary}</div>
        ) : services.length > 0 ? (
          <div style={styles.services} title={services.join(', ')}>
            {services.length} 个服务 · {services.slice(0, 3).join(', ')}{services.length > 3 ? '…' : ''}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        style={{
          ...styles.cancelButton,
          ...(isCancelling ? styles.cancelButtonDisabled : {})
        }}
        onClick={handleCancel}
        disabled={isCancelling}
      >
        {isCancelling ? '取消中…' : '取消打包'}
      </button>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '390px',
    maxWidth: '600px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid rgba(96, 165, 250, 0.28)',
    background: 'rgba(10, 19, 45, 0.96)',
    boxShadow: '0 18px 40px rgba(2, 6, 23, 0.42)',
    color: '#e2e8f0',
    backdropFilter: 'blur(10px)'
  },
  indicator: {
    width: '9px',
    height: '9px',
    flex: '0 0 auto',
    borderRadius: '50%',
    background: '#60a5fa',
    boxShadow: '0 0 12px rgba(96, 165, 250, 0.8)'
  },
  content: {
    flex: '1 1 auto',
    minWidth: 0
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  title: {
    fontSize: '13px',
    color: '#f8fafc'
  },
  stage: {
    padding: '2px 7px',
    borderRadius: '999px',
    background: 'rgba(59, 130, 246, 0.16)',
    border: '1px solid rgba(96, 165, 250, 0.2)',
    color: '#bfdbfe',
    fontSize: '10px',
    fontWeight: 700
  },
  progressText: {
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 700,
    color: '#93c5fd'
  },
  jobId: {
    marginLeft: 'auto',
    maxWidth: '130px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#64748b'
  },
  progressTrack: {
    width: '100%',
    height: '4px',
    marginTop: '7px',
    overflow: 'hidden',
    borderRadius: '999px',
    background: 'rgba(148, 163, 184, 0.16)'
  },
  progressBar: {
    height: '100%',
    borderRadius: '999px',
    background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)',
    transition: 'width 240ms ease'
  },
  message: {
    marginTop: '5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '12px',
    color: '#cbd5e1'
  },
  services: {
    marginTop: '3px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '11px',
    color: '#94a3b8'
  },
  cancelButton: {
    flex: '0 0 auto',
    padding: '7px 11px',
    borderRadius: '8px',
    border: '1px solid rgba(248, 113, 113, 0.35)',
    background: 'rgba(127, 29, 29, 0.72)',
    color: '#fecaca',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700
  },
  cancelButtonDisabled: {
    cursor: 'wait',
    opacity: 0.65
  }
}
