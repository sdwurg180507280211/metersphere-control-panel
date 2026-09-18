import { memo } from 'react'
import { SERVICE_BUSY_PHASES } from '../store/useAppStore'
import { compactServicePresentation } from '../utils/servicePresentation'
import './ServiceCard.css'

const PHASE_LABELS = {
  starting: '启动中', checking_health: '检查中', running: '运行中',
  stopping: '停止中', stopped: '已停止', failed: '服务异常',
  restarting: '重启中', compiling: '编译中', reloading: '重载中', processing: '处理中'
}

export default memo(function ServiceCard({ service, status, isLoading, stale, selected,
  onToggle, onRestart, onForceStop, onViewLogs, onDetails }) {
  const { phase, running } = status
  const busy = isLoading || SERVICE_BUSY_PHASES.has(phase)
  const view = compactServicePresentation(status, stale)
  const name = service.name || service.id
  const phaseLabel = PHASE_LABELS[phase] || '状态未知'
  const actionLabel = running ? '停止' : '启动'
  const outdated = stale || status.processStale

  return (
    <article className={`compact-service-card phase-${phase || 'unknown'}${selected ? ' is-log-selected' : ''}${outdated ? ' is-stale' : ''}`}
      aria-label={`${name}${selected ? '，正在查看日志' : ''}`}>
      <div className="compact-service-top">
        <span className="compact-service-name" title={name}>{name}</span>
        <span className={`compact-service-phase${busy ? ' is-busy' : ''}`} title={outdated ? `上次状态：${phaseLabel}，待刷新` : phaseLabel}>
          {outdated ? '待刷新' : phaseLabel}
        </span>
        <div className="compact-service-actions">
          <button type="button" aria-label={`查看 ${name} 的服务日志`} aria-pressed={selected} onClick={onViewLogs}>日志</button>
          {(running || phase === 'failed') && <button type="button" aria-label={`重启 ${name}`} disabled={busy} onClick={onRestart}>重启</button>}
          {phase === 'failed' && !running && <button type="button" aria-label={`停止 ${name}`} disabled={busy} onClick={onForceStop}>停止</button>}
          <button type="button" aria-label={`${actionLabel} ${name}`} disabled={busy} onClick={onToggle}>{actionLabel}</button>
        </div>
      </div>
      <div className="compact-service-bottom">
        <span className={`compact-service-summary tone-${view.summaryTone}`} title={view.summary}>{view.summary}</span>
        <button type="button" className={view.hasIssue || view.dependencyNeedsAttention ? 'has-issue' : ''}
          aria-label={`查看 ${name} 的诊断详情`} aria-haspopup="dialog" onClick={onDetails}>
          {view.dependencyNeedsAttention && !view.hasIssue ? '依赖提示' : '详情'}
        </button>
      </div>
    </article>
  )
})
