import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { servicePresentation, dependencyPresentation } from '../utils/servicePresentation'
import './ServiceDiagnostics.css'

export default function ServiceDiagnostics({ service, status, stale, onClose, onViewLogs, onRefresh, refreshing }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog.open) dialog.showModal()
    return () => { if (dialog.open) dialog.close() }
  }, [])
  const view = servicePresentation(status, stale)
  const dependency = dependencyPresentation(status, stale)
  const titleId = `service-details-${encodeURIComponent(service.id)}`
  const close = () => dialogRef.current?.close()

  return createPortal(
    <dialog ref={dialogRef} className="service-diagnostics-drawer" aria-labelledby={titleId}
      onClose={(event) => { if (!event.currentTarget.open) onClose() }}>
      <header className="service-diagnostics-header">
        <div><h2 id={titleId}>{service.name || service.id}</h2><span>服务诊断 · 仅查看观测，不会自动操作服务</span></div>
        <button type="button" autoFocus onClick={close} aria-label="关闭诊断详情">关闭</button>
      </header>
      <div className="service-diagnostics">
        <h3>进程与健康</h3>
        <div className={`service-observation tone-${view.healthTone}`}>
          <span>{view.processLabel}</span><span>{view.healthLabel}</span>
        </div>
        {status.pid && <p>PID：{status.pid}</p>}
        {view.hasIssue && <>
          <h3>{stale || status.healthStale || status.processStale ? '上次异常（状态待刷新）' : '异常信息'}</h3>
          <p className="service-issue-detail">{view.message || (status.portOccupied ? '端口被其他进程占用。' : '服务状态异常，请结合日志检查。')}</p>
        </>}
        {view.hint && <p>排查建议：{view.hint}</p>}
        <h3>依赖参考</h3>
        {dependency ? <>
          <p>{dependency.label}</p>
          <ul className="service-dependency-list">
            {dependency.items.map((item) => <li key={item.id} className={`tone-${item.tone}`}><span>{item.name}</span><span>{item.label}</span></li>)}
          </ul>
          <p className="service-advisory-note">{dependency.note}</p>
        </> : <p className="service-advisory-note">暂无依赖观测，不代表该服务没有依赖。</p>}
      </div>
      <div className="service-diagnostic-actions">
        <button type="button" onClick={() => { close(); onViewLogs() }} aria-label={`查看 ${service.name || service.id} 的服务日志`}>查看服务日志</button>
        <button type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? '检查中…' : '重新检查'}</button>
      </div>
    </dialog>, document.body
  )
}
