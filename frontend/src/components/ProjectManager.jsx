import { commandState } from '../commandState'

export default function ProjectManager({ projects, commandStatus, commandBusy, manualRunning, meterSphereSummary, onSelect, onAdd, onEdit }) {
  return (
    <section className="console-project-page" aria-label="管理项目">
      <div className="console-page-heading"><div><span className="console-eyebrow">所有项目 · {projects.length}</span><h1>管理项目</h1><p>选择一个项目继续工作，或添加自己的本地项目。</p></div><button className="console-button primary" onClick={onAdd}>＋ 添加项目</button></div>
      <div className="console-project-grid">
        {projects.map((project) => {
          const isMS = project.type === 'metersphere'
          const state = isMS ? meterSphereSummary : commandState(project, commandStatus[project.id], manualRunning[project.id], commandBusy[project.id])
          return (
            <article className="console-project-card" key={project.id}>
              <span className="console-project-monogram" aria-hidden="true">{isMS ? 'MS' : project.name.slice(0, 2).toUpperCase()}</span>
              <h2><button onClick={() => onSelect(project.id)}>{project.name}</button></h2>
              <p>{isMS ? '服务、构建、打包与 SQL' : '本机命令启动与关闭'}</p>
              <span className={`console-status ${state.tone}`}><i />{state.label}</span>
              <div className="console-actions"><button className="console-button" onClick={() => onSelect(project.id)}>进入项目 →</button>{!isMS && <button className="console-button quiet" onClick={() => onEdit(project)} disabled={Boolean(commandBusy[project.id])}>配置</button>}</div>
            </article>
          )
        })}
        {projects.length === 1 && <button className="console-add-card" onClick={onAdd}><span aria-hidden="true">＋</span><strong>添加你的项目</strong><small>填写启动和关闭命令，即可统一管理</small></button>}
      </div>
    </section>
  )
}
