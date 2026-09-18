import { useEffect, useMemo } from 'react'
import { useWorkspaceStore } from '../store/useWorkspaceStore'
import './WorkspaceHome.css'

function navigate(tab) {
  window.dispatchEvent(new CustomEvent('switchTab', { detail: tab }))
}

function SummaryCard({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`workspace-summary-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function InfrastructureStatus({ infrastructure = {} }) {
  const items = ['mysql', 'redis', 'kafka']
    .map((key) => infrastructure[key])
    .filter(Boolean)

  return (
    <div className="workspace-infra-list">
      {items.map((item) => (
        <div className="workspace-infra-item" key={item.name}>
          <i className={item.reachable ? 'ok' : 'bad'} />
          <div>
            <strong>{item.name}</strong>
            <span>{item.reachable ? '可连接' : item.error || '不可连接'}</span>
          </div>
          <code>{item.host}:{item.port}</code>
        </div>
      ))}
    </div>
  )
}

function ProblemPreview({ problems = [] }) {
  if (!problems.length) {
    return <div className="workspace-empty-good">当前没有发现阻塞开发的问题。</div>
  }

  return (
    <div className="workspace-problem-list">
      {problems.slice(0, 4).map((problem) => (
        <button
          type="button"
          key={problem.id}
          className={`workspace-problem severity-${problem.severity}`}
          onClick={() => problem.action?.tab && navigate(problem.action.tab)}
        >
          <span>{problem.title}</span>
          <small>{problem.message}</small>
          <b>{problem.action?.label || '查看诊断'} →</b>
        </button>
      ))}
    </div>
  )
}

export default function WorkspaceHome({ isActive = true }) {
  const { snapshot, loading, error, fetchSnapshot, refresh, lastLoadedAt } = useWorkspaceStore()

  useEffect(() => {
    if (isActive && !snapshot && !loading) {
      fetchSnapshot({ deep: true }).catch(() => {})
    }
  }, [isActive, snapshot, loading, fetchSnapshot])

  const summary = snapshot?.summary || {}
  const environmentReady = useMemo(() => (
    snapshot
      ? Boolean(summary.environmentReady)
      : false
  ), [snapshot, summary.environmentReady])

  if (!snapshot && loading) {
    return <div className="workspace-home workspace-loading" role="status">正在分析 MeterSphere 开发环境…</div>
  }

  return (
    <div className="workspace-home">
      <header className="workspace-hero">
        <div>
          <span className="workspace-eyebrow">METERSPHERE ENGINEERING WORKSPACE</span>
          <h1>{environmentReady ? '开发环境已就绪' : '开发环境需要关注'}</h1>
          <p className="workspace-project-path">{snapshot?.project?.root || '尚未配置 MeterSphere 项目路径'}</p>
        </div>
        <div className="workspace-hero-actions">
          <button type="button" className="workspace-secondary-btn" onClick={() => refresh({ deep: true }).catch(() => {})} disabled={loading}>
            {loading ? '刷新中…' : '重新检查'}
          </button>
          <button type="button" className="workspace-primary-btn" onClick={() => navigate('services')}>进入开发环境</button>
        </div>
      </header>

      {error && <div className="workspace-error" role="alert">{error}</div>}

      <section className="workspace-summary-grid" aria-label="开发环境摘要">
        <SummaryCard
          label="服务"
          value={`${summary.runningServices || 0}/${summary.totalServices || 0}`}
          detail={summary.failedServices ? `${summary.failedServices} 个异常` : '运行状态'}
          tone={summary.failedServices ? 'danger' : 'good'}
        />
        <SummaryCard
          label="基础设施"
          value={summary.infrastructureReachable === false ? '异常' : summary.infrastructureReachable === true ? '正常' : '未知'}
          detail="MySQL / Redis / Kafka"
          tone={summary.infrastructureReachable === false ? 'danger' : summary.infrastructureReachable === true ? 'good' : 'neutral'}
        />
        <SummaryCard
          label="运行任务"
          value={summary.activeJobs || 0}
          detail="构建 / 服务 / 打包"
          tone={summary.activeJobs ? 'info' : 'neutral'}
        />
        <SummaryCard
          label="待处理问题"
          value={summary.problems || 0}
          detail={summary.blockers ? `${summary.blockers} 个阻塞项` : '环境诊断'}
          tone={summary.blockers ? 'danger' : summary.problems ? 'warning' : 'good'}
        />
      </section>

      <div className="workspace-main-grid">
        <section className="workspace-panel">
          <div className="workspace-panel-heading">
            <div>
              <span>Environment</span>
              <h2>基础设施</h2>
            </div>
            <button type="button" onClick={() => navigate('services')}>服务管理 →</button>
          </div>
          <InfrastructureStatus infrastructure={snapshot?.infrastructure} />
        </section>

        <section className="workspace-panel">
          <div className="workspace-panel-heading">
            <div>
              <span>Diagnosis</span>
              <h2>需要处理</h2>
            </div>
            <button type="button" onClick={() => navigate('diagnosis')}>全部诊断 →</button>
          </div>
          <ProblemPreview problems={snapshot?.problems} />
        </section>
      </div>

      <section className="workspace-panel workspace-quick-panel">
        <div className="workspace-panel-heading">
          <div>
            <span>Quick Actions</span>
            <h2>继续开发</h2>
          </div>
          <small>{lastLoadedAt ? `状态更新于 ${new Date(lastLoadedAt).toLocaleTimeString()}` : ''}</small>
        </div>
        <div className="workspace-action-grid">
          <button type="button" onClick={() => navigate('services')}><b>启动 / 检查服务</b><span>服务编排、健康检查和实时日志</span></button>
          <button type="button" onClick={() => navigate('build')}><b>前端构建</b><span>模块构建、开发服务和构建日志</span></button>
          <button type="button" onClick={() => navigate('tasks')}><b>任务中心</b><span>统一查看运行任务和最近结果</span></button>
          <button type="button" onClick={() => navigate('config')}><b>项目配置</b><span>项目扫描、诊断和覆盖配置</span></button>
        </div>
      </section>
    </div>
  )
}
