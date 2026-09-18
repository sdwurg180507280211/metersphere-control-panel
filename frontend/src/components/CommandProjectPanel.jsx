import { commandState } from '../commandState'

export default function CommandProjectPanel({ project, status, manualRunning, busy, onStart, onStop, onVisit, onEdit, lastUpdated }) {
  const state = commandState(project, status, manualRunning, busy)
  return (
    <section className="console-project-page" aria-label={`${project.name} 项目控制`}>
      <div className="console-page-heading">
        <div><span className="console-eyebrow">项目概览</span><h1>{project.name}</h1><p>管理这个项目的运行状态与本机命令。</p></div>
        <button className="console-button" onClick={onEdit} disabled={Boolean(busy)}>配置项目</button>
      </div>
      <div className="console-project-hero">
        <div><span className={`console-status ${state.tone}`}><i />{state.label}</span>
          <h2>{state.port ? `127.0.0.1:${state.port}` : '手动控制'}</h2>
          <p>{state.port ? '端口状态仅表示是否可连接，不代表进程归属或整个项目的健康状态。' : '未配置状态端口，无法验证运行状态。启动和停止命令仍可手动执行。'}</p>
          {state.lastStartIssued && <p>上次已发出启动命令，尚未验证服务是否就绪。</p>}
          {status?.error && <p role="alert">上次操作未确认：{status.error}</p>}
        </div>
        <div className="console-actions">
          <button className="console-button primary" disabled={Boolean(busy) || state.running} onClick={onStart}>{busy === 'starting' ? '启动中…' : '启动项目'}</button>
          <button className="console-button danger" disabled={Boolean(busy)} onClick={onStop}>{busy === 'stopping' ? '关闭中…' : '停止项目'}</button>
          <button className="console-button" onClick={onVisit} disabled={!state.canVisit} title={state.canVisit ? '在系统浏览器中访问' : '服务运行并配置状态端口后可访问'}>访问服务 ↗</button>
        </div>
      </div>
      <div className="console-command-grid">
        <section className="console-command-card"><h2>启动命令</h2><pre>{project.startCommand || '尚未配置'}</pre></section>
        <section className="console-command-card"><h2>关闭命令</h2><pre>{project.stopCommand || '尚未配置'}</pre></section>
      </div>
      <p className="console-footnote">切换项目后，已启动的服务会继续运行。{lastUpdated ? ` 状态更新于 ${lastUpdated.toLocaleTimeString()}` : ''}</p>
    </section>
  )
}
