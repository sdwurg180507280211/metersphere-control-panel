import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { usePackageStore } from '../store/useAppStore'
import PackageProgressStepper from './PackageProgressStepper'

const POLL_INTERVAL_MS = 5000

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
  const [dismissedJobId, setDismissedJobId] = useState(null)

  const isRunning = ['pending', 'running'].includes(currentTask?.status)
  const isFailed = currentTask?.status === 'failed'
  const isCancelling = cancelling || currentTask?.stage === 'cancelling'
  const isDismissed = currentTask?.jobId && dismissedJobId === currentTask.jobId
  const buildProgress = currentTask?.metadata?.buildProgress || currentTask?.error?.details?.buildProgress || null
  const lastError = buildProgress?.lastError || currentTask?.error?.message || null
  const services = currentTask?.metadata?.services || []

  useEffect(() => {
    if (currentTask?.jobId && currentTask.jobId !== dismissedJobId) {
      setCancelling(false)
    }
  }, [currentTask?.jobId, dismissedJobId])

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

  if ((!isRunning && !isFailed) || isDismissed) {
    return null
  }

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
    <div style={{ ...styles.container, ...(isFailed ? styles.failedContainer : {}) }} role="status" aria-live="polite">
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <span style={{ ...styles.indicator, ...(isFailed ? styles.failedIndicator : {}) }} aria-hidden="true" />
          <strong style={styles.title}>
            {isFailed ? '打包失败' : isCancelling ? '正在取消打包' : '打包运行中'}
          </strong>
          {services.length > 0 && <span style={styles.serviceCount}>{services.length} 个服务</span>}
        </div>
        <span style={styles.jobId}>{currentTask?.jobId}</span>
      </div>

      <PackageProgressStepper task={currentTask} compact={isRunning} />

      <div style={{ ...styles.message, ...(isFailed ? styles.failedMessage : {}) }} title={lastError || currentTask?.message || ''}>
        {isFailed
          ? (lastError || '打包任务失败，请查看打包日志定位具体原因')
          : (currentTask?.message || (isCancelling ? '正在取消打包任务' : '打包任务运行中'))}
      </div>

      <div style={styles.actions}>
        {isRunning ? (
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
        ) : (
          <button
            type="button"
            style={styles.dismissButton}
            onClick={() => setDismissedJobId(currentTask?.jobId)}
          >
            关闭
          </button>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: 1200,
    width: 'min(560px, calc(100vw - 40px))',
    padding: '13px',
    borderRadius: '16px',
    border: '1px solid rgba(96, 165, 250, 0.28)',
    background: 'rgba(7, 15, 35, 0.96)',
    boxShadow: '0 22px 54px rgba(2, 6, 23, 0.48)',
    color: '#e2e8f0',
    backdropFilter: 'blur(14px)'
  },
  failedContainer: {
    border: '1px solid rgba(248, 113, 113, 0.3)',
    background: 'rgba(31, 12, 28, 0.97)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    marginBottom: '9px'
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    minWidth: 0
  },
  indicator: {
    width: '8px',
    height: '8px',
    flex: '0 0 auto',
    borderRadius: '50%',
    background: '#60a5fa',
    boxShadow: '0 0 12px rgba(96, 165, 250, 0.85)'
  },
  failedIndicator: {
    background: '#f87171',
    boxShadow: '0 0 12px rgba(248, 113, 113, 0.75)'
  },
  title: {
    fontSize: '13px',
    color: '#f8fafc'
  },
  serviceCount: {
    padding: '2px 7px',
    borderRadius: '999px',
    background: 'rgba(148, 163, 184, 0.1)',
    color: '#94a3b8',
    fontSize: '9px',
    fontWeight: 700
  },
  jobId: {
    maxWidth: '145px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
    fontSize: '9px',
    color: '#64748b'
  },
  message: {
    marginTop: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '11px',
    color: '#94a3b8'
  },
  failedMessage: {
    color: '#fecaca'
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '9px'
  },
  cancelButton: {
    padding: '7px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(248, 113, 113, 0.35)',
    background: 'rgba(127, 29, 29, 0.72)',
    color: '#fecaca',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 700
  },
  cancelButtonDisabled: {
    cursor: 'wait',
    opacity: 0.65
  },
  dismissButton: {
    padding: '7px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(30, 41, 59, 0.72)',
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 700
  }
}
