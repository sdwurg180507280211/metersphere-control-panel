import { servicePresentation, dependencyPresentation } from '../utils/servicePresentation'
import './ServiceDiagnostics.css'

export default function ServiceDiagnostics({ service, status, stale, expanded, onToggle, onViewLogs, onRefresh, refreshing }) {
  const view = servicePresentation(status, stale)
  const dependency = dependencyPresentation(status, stale)
  const detailId = `service-details-${encodeURIComponent(service.id)}`
  const hasDetails = view.hasIssue || Boolean(dependency)

  return (
    <div className="service-diagnostics">
      <div className={`service-observation tone-${view.healthTone}`}>
        <span>{view.processLabel}</span><span>{view.healthLabel}</span>
      </div>
      {view.hasIssue && <p className="service-issue-summary">{stale || status.healthStale ? '上次异常' : '异常信息'}：{view.message || '服务状态异常，请展开详情检查。'}</p>}
      {dependency && <p className="service-dependency-summary">依赖参考：{dependency.label}</p>}
      <div className="service-diagnostic-actions">
        {hasDetails && <button type="button" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
          {expanded ? '收起详情' : '查看详情'}
        </button>}
        <button type="button" onClick={onViewLogs} aria-label={`查看 ${service.name || service.id} 的服务日志`}>查看服务日志</button>
        <button type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? '检查中…' : '重新检查'}</button>
      </div>
      {hasDetails && expanded && <div className="service-diagnostic-details" id={detailId}>
        {view.message && <p className="service-issue-detail">{view.message}</p>}
        {view.hint && <p>排查建议：{view.hint}</p>}
        {dependency && <>
          <ul className="service-dependency-list">
            {dependency.items.map((item) => <li key={item.id} className={`tone-${item.tone}`}><span>{item.name}</span><span>{item.label}</span></li>)}
          </ul>
          <p className="service-advisory-note">{dependency.note}</p>
        </>}
      </div>}
    </div>
  )
}
