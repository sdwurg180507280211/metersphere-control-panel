export function commandState(project, status, manualRunning, busy) {
  const known = status?.statusKnown === true
  const running = known ? status.running === true : manualRunning === true
  const phase = busy || (known ? status.phase : running ? 'manual-running' : 'unknown')
  const labels = { running: '运行中', stopped: '已停止', starting: '启动中…', stopping: '关闭中…', 'manual-running': '手动已启动', unknown: '未检测' }
  const port = status?.port || project.statusPort
  return { running, port, canVisit: Boolean(port && known && running && !busy), label: labels[phase] || '未检测', tone: busy ? 'busy' : running ? 'running' : known ? 'stopped' : 'unknown' }
}

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
          <p>{state.port ? '通过本机端口检测状态，服务运行后可在浏览器访问。' : '尚未配置状态端口。执行命令后显示手动状态，不代表服务已经就绪。'}</p>
        </div>
        <div className="console-actions">
          <button className={`console-button ${state.running ? 'danger' : 'primary'}`} disabled={Boolean(busy)} onClick={state.running ? onStop : onStart}>
            {busy ? state.label : state.running ? '停止项目' : '启动项目'}
          </button>
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
