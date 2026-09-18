import { useMemo } from 'react'
import { useServiceStore, useBuildStore, usePackageStore, useConfigStore } from '../store/useAppStore'
import './WorkspaceHome.css'

function StatusCard({ title, value, detail }) {
  return (
    <section className="workspace-card">
      <div className="workspace-card-title">{title}</div>
      <div className="workspace-card-value">{value}</div>
      {detail && <div className="workspace-card-detail">{detail}</div>}
    </section>
  )
}

function WorkspaceHome() {
  const { catalog, services } = useServiceStore()
  const { activeBuilds } = useBuildStore()
  const { activeTask } = usePackageStore()
  const { resolved, diagnostics } = useConfigStore()

  const serviceSummary = useMemo(() => {
    const total = catalog?.length || 0
    const running = catalog?.filter((item) => services?.[item.id]?.running).length || 0
    return { total, running }
  }, [catalog, services])

  const problemCount = useMemo(() => {
    let count = 0
    if (diagnostics?.errors?.length) count += diagnostics.errors.length
    return count
  }, [diagnostics])

  return (
    <div className="workspace-home">
      <header className="workspace-hero">
        <div>
          <h1>MeterSphere Workspace</h1>
          <p>开发环境总览、服务状态和任务入口。</p>
        </div>
      </header>

      <div className="workspace-grid">
        <StatusCard
          title="Services"
          value={`${serviceSummary.running}/${serviceSummary.total}`}
          detail="运行中服务"
        />
        <StatusCard
          title="Build"
          value={activeBuilds?.length || 0}
          detail="当前构建任务"
        />
        <StatusCard
          title="Package"
          value={activeTask ? 'Running' : 'Idle'}
          detail="验证打包状态"
        />
        <StatusCard
          title="Problems"
          value={problemCount}
          detail="待处理问题"
        />
      </div>

      <section className="workspace-actions">
        <h2>快速入口</h2>
        <div className="workspace-action-list">
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('switchTab', { detail: 'services' }))}>启动服务</button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('switchTab', { detail: 'build' }))}>执行构建</button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('switchTab', { detail: 'config' }))}>检查配置</button>
        </div>
      </section>

      <section className="workspace-info">
        <h2>Environment</h2>
        <pre>{JSON.stringify(resolved?.projectRoot || '未配置项目路径', null, 2)}</pre>
      </section>
    </div>
  )
}

export default WorkspaceHome
