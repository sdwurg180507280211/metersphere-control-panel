import { useEffect } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import './TasksTab.css'

const STATUS_LABELS = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  success: '已完成',
  failed: '失败',
  cancelled: '已取消'
}

function targetTab(job = {}) {
  if (job.type?.startsWith('frontend.build')) return 'build'
  if (job.type === 'package.run') return 'package'
  if (job.type?.startsWith('service.') || job.type === 'sdk.build') return 'services'
  return 'workspace'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function JobRow({ job, active = false }) {
  const status = job.status || (active ? 'running' : 'completed')
  const progress = Number.isFinite(job.progress) ? Math.max(0, Math.min(100, job.progress)) : null

  return (
    <article className={`task-row status-${status}`}>
      <div className="task-row-main">
        <div>
          <span className="task-type">{job.type || 'task'}</span>
          <h3>{job.message || job.targetId || 'MeterSphere 任务'}</h3>
        </div>
        <strong>{STATUS_LABELS[status] || status}</strong>
      </div>
      {progress !== null && (
        <div className="task-progress" aria-label={`进度 ${progress}%`}>
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="task-row-meta">
        <span>{job.stage || job.targetId || '—'}</span>
        <span>{formatTime(job.updatedAt || job.createdAt)}</span>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('switchTab', { detail: targetTab(job) }))}>打开相关工作区 →</button>
      </div>
      {job.error?.message && <div className="task-error">{job.error.message}</div>}
    </article>
  )
}

export default function TasksTab({ isActive = true }) {
  const { snapshot, loading, error, fetchSnapshot, refresh } = useWorkspaceStore()

  useEffect(() => {
    if (isActive) fetchSnapshot({ deep: false }).catch(() => {})
  }, [isActive, fetchSnapshot])

  const activeJobs = snapshot?.jobs?.active || []
  const recentJobs = snapshot?.jobs?.recent || []

  return (
    <div className="tasks-tab">
      <header className="tasks-header">
        <div>
          <span>UNIFIED JOBS</span>
          <h1>任务中心</h1>
          <p>统一查看服务、构建、SDK 和整体验证任务。</p>
        </div>
        <button type="button" onClick={() => refresh({ deep: false }).catch(() => {})} disabled={loading}>
          {loading ? '刷新中…' : '刷新任务'}
        </button>
      </header>

      {error && <div className="tasks-error" role="alert">{error}</div>}

      <section className="tasks-section">
        <div className="tasks-section-heading"><h2>正在运行</h2><span>{activeJobs.length}</span></div>
        {activeJobs.length
          ? <div className="task-list">{activeJobs.map((job) => <JobRow key={job.jobId} job={job} active />)}</div>
          : <div className="tasks-empty">当前没有运行中的任务。</div>}
      </section>

      <section className="tasks-section">
        <div className="tasks-section-heading"><h2>最近任务</h2><span>{recentJobs.length}</span></div>
        {recentJobs.length
          ? <div className="task-list">{recentJobs.map((job) => <JobRow key={job.jobId} job={job} />)}</div>
          : <div className="tasks-empty">暂无任务历史。</div>}
      </section>
    </div>
  )
}
