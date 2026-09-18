import './WorkspaceHome.css'

function WorkspaceHome({
  projectName = 'MeterSphere',
  servicesRunning = 0,
  servicesTotal = 0,
  infrastructure = [],
  actions = []
}) {
  return (
    <div className="workspace-home">
      <section className="workspace-hero">
        <div>
          <div className="workspace-eyebrow">Development Workspace</div>
          <h1>{projectName}</h1>
          <p>从环境检查、服务状态到开发任务，一个入口掌握当前研发状态。</p>
        </div>

        <div className="workspace-summary">
          <strong>{servicesRunning}/{servicesTotal}</strong>
          <span>服务运行中</span>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="workspace-card">
          <h2>基础设施</h2>
          <div className="status-list">
            {infrastructure.length === 0 ? (
              <span>等待环境检测</span>
            ) : infrastructure.map((item) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <b>{item.ok ? '✓' : '!'}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="workspace-card">
          <h2>开发动作</h2>
          <div className="action-list">
            {actions.map((action) => (
              <button key={action.id} onClick={action.onClick}>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default WorkspaceHome
