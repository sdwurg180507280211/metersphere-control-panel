import { useEffect, useMemo } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import './DiagnosisTab.css'

const SEVERITY_LABELS = {
  blocker: '阻塞',
  error: '错误',
  warning: '提醒'
}

function navigate(tab) {
  window.dispatchEvent(new CustomEvent('switchTab', { detail: tab }))
}

export default function DiagnosisTab({ isActive = true }) {
  const { snapshot, loading, error, fetchSnapshot, refresh } = useWorkspaceStore()

  useEffect(() => {
    if (isActive) fetchSnapshot({ deep: true }).catch(() => {})
  }, [isActive, fetchSnapshot])

  const counts = useMemo(() => {
    const result = { blocker: 0, error: 0, warning: 0 }
    for (const problem of snapshot?.problems || []) {
      if (Object.prototype.hasOwnProperty.call(result, problem.severity)) result[problem.severity] += 1
    }
    return result
  }, [snapshot?.problems])

  const problems = snapshot?.problems || []

  return (
    <div className="diagnosis-tab">
      <header className="diagnosis-header">
        <div>
          <span>ENGINEERING DIAGNOSIS</span>
          <h1>诊断中心</h1>
          <p>聚合基础设施、配置、服务进程和健康检查结果，告诉你下一步该处理什么。</p>
        </div>
        <button type="button" onClick={() => refresh({ deep: true }).catch(() => {})} disabled={loading}>
          {loading ? '诊断中…' : '重新诊断'}
        </button>
      </header>

      {error && <div className="diagnosis-error" role="alert">{error}</div>}

      <section className="diagnosis-summary">
        <div><strong>{counts.blocker}</strong><span>阻塞</span></div>
        <div><strong>{counts.error}</strong><span>错误</span></div>
        <div><strong>{counts.warning}</strong><span>提醒</span></div>
        <div><strong>{snapshot?.summary?.runningServices || 0}/{snapshot?.summary?.totalServices || 0}</strong><span>服务运行</span></div>
      </section>

      <section className="diagnosis-panel">
        <div className="diagnosis-panel-heading">
          <h2>问题与建议</h2>
          <small>{snapshot?.generatedAt ? `快照 ${new Date(snapshot.generatedAt).toLocaleTimeString()}` : ''}</small>
        </div>

        {problems.length === 0 ? (
          <div className="diagnosis-clear">
            <strong>没有发现明显问题</strong>
            <span>基础设施、运行服务与当前配置未发现阻塞项。</span>
          </div>
        ) : (
          <div className="diagnosis-list">
            {problems.map((problem) => (
              <article key={problem.id} className={`diagnosis-item severity-${problem.severity}`}>
                <div className="diagnosis-item-head">
                  <span>{SEVERITY_LABELS[problem.severity] || problem.severity}</span>
                  <strong>{problem.title}</strong>
                </div>
                <p>{problem.message}</p>
                {problem.details && <code>{problem.details}</code>}
                {problem.action?.tab && (
                  <button type="button" onClick={() => navigate(problem.action.tab)}>
                    {problem.action.label || '处理问题'} →
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="diagnosis-panel">
        <div className="diagnosis-panel-heading"><h2>服务健康状态</h2></div>
        <div className="diagnosis-service-grid">
          {(snapshot?.services || []).map((service) => (
            <button type="button" key={service.id} onClick={() => navigate('services')}>
              <i className={service.running && service.health?.healthy !== false ? 'ok' : service.phase === 'failed' ? 'bad' : ''} />
              <span>{service.name}</span>
              <small>{service.running ? service.health?.healthy === false ? '健康检查异常' : '运行中' : service.phase === 'failed' ? '启动失败' : '已停止'}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
