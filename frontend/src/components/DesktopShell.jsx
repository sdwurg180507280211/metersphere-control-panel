import { useEffect, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import App, { TAB_ITEMS } from '../App'
import CommandProjectEditor from './DesktopAppEditor'
import CommandProjectPanel from './CommandProjectPanel'
import ProjectManager from './ProjectManager'
import PackageTaskGuard from './PackageTaskGuard'
import { useProjectConsole } from '../hooks/useProjectConsole'
import { useProjectNavigation } from '../hooks/useProjectNavigation'
import { useWebSocket } from '../hooks/useWebSocket'
import { useBuildStore } from '../store/useAppStore'
import './DesktopShell.css'

export default function DesktopShell() {
  const consoleState = useProjectConsole()
  const { route, activeTab, go, selectProject } = useProjectNavigation()
  const { connected, reconnectAttempts } = useWebSocket()
  const [editor, setEditor] = useState(null)
  const isMS = route.projectId === 'metersphere'
  const [visitedMS, setVisitedMS] = useState(isMS)
  const headingRef = useRef(null)
  const previousRoute = useRef(route)
  const activeBuilds = useBuildStore((state) => state.activeBuilds)
  const buildCount = activeBuilds.filter((build) => ['pending', 'running'].includes(build.status)).length
  const { projects, loaded, loading, loadError, commandStatus, commandBusy, manualRunning, refresh, update } = consoleState
  const selected = projects.find((project) => project.id === route.projectId)
  const pageName = !route.projectId ? '管理项目' : isMS ? TAB_ITEMS.find((tab) => tab.id === activeTab)?.label : '项目概览'

  useEffect(() => { if (isMS) setVisitedMS(true) }, [isMS])
  useEffect(() => {
    document.title = selected ? `${selected.name} · Local Service Hub` : 'Local Service Hub'
  }, [selected?.name])
  useEffect(() => {
    if (loaded && !loadError && !editor && route.projectId && !selected) {
      toast('这个项目已被移除，请选择其他项目')
      go({ projectId: null }, { replace: true })
    }
  }, [loaded, loadError, editor, route.projectId, selected, go])
  useEffect(() => {
    if (previousRoute.current !== route) headingRef.current?.focus({ preventScroll: true })
    previousRoute.current = route
  }, [route])

  const openTask = (tab) => go({ projectId: 'metersphere', tab })
  return (
    <div className="console-shell">
      <aside className="console-sidebar" aria-label="项目导航">
        <div className="console-brand"><span aria-hidden="true">L</span><div>Local Service Hub<small>本地项目控制台</small></div></div>
        <label className="console-project-picker">
          <span>当前项目</span>
          <select aria-label="当前项目" value={route.projectId || ''} onChange={(event) => selectProject(event.target.value || null)}>
            <option value="" disabled>选择项目</option>
            {!selected && route.projectId && <option value={route.projectId}>正在读取项目…</option>}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <nav className="console-nav" aria-label={selected ? `${selected.name} 功能` : '控制台功能'}>
          {isMS ? TAB_ITEMS.map((tab) => (
            <button key={tab.id} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => openTask(tab.id)}>
              <span aria-hidden="true">{tab.icon}</span>{tab.label}
            </button>
          )) : selected ? <>
            <button aria-current="page" onClick={() => selectProject(selected.id)}><span aria-hidden="true">◉</span>项目概览</button>
            <button onClick={() => setEditor({ project: selected })} disabled={Boolean(commandBusy[selected.id])}><span aria-hidden="true">⚙</span>项目配置</button>
          </> : <p className="console-nav-hint">所有项目都在这里。<br />选择后，在当前窗口继续。</p>}
        </nav>
        <div className="console-sidebar-bottom">
          <button className="console-manage" aria-current={!route.projectId ? 'page' : undefined} onClick={() => selectProject(null)}>▦ <span>管理项目</span><span>{projects.length}</span></button>
          <div className="console-connection" role="status"><i className={connected ? 'connected' : ''} />{connected ? '实时连接正常' : reconnectAttempts >= 5 ? '连接中断，请刷新重试' : '正在连接本机服务…'}</div>
          <div className="console-update">
            <span>{update.currentVersion ? `v${update.currentVersion}` : 'Local Service Hub'}</span>
            {update.installSupported ? <button disabled={update.checking || update.installing} onClick={() => update.updateAvailable ? consoleState.installUpdate() : consoleState.checkUpdate(false)}>
              {update.installing ? '正在安装…' : update.checking ? '检查中…' : update.updateAvailable ? `升级 v${update.latestVersion}` : '检查更新'}
            </button> : <span>本地控制台</span>}
          </div>
        </div>
      </aside>
      <main className="console-main">
        <header className="console-topbar">
          <h2 ref={headingRef} tabIndex={-1}>{selected?.name || (route.projectId ? '正在读取项目' : '控制台')}<span aria-hidden="true"> / </span><small>{pageName}</small></h2>
          {buildCount > 0 && <button className="console-task-link" onClick={() => openTask('build')}>MeterSphere · {buildCount} 个构建运行中 →</button>}
          <PackageTaskGuard compact onOpen={() => openTask('package')} />
        </header>
        {loadError && <div className="console-error" role="alert"><span>无法刷新项目状态：{loadError}。已有状态可能不是最新的。</span><button onClick={() => refresh(false)}>重试</button></div>}
        <div className="console-body">
          {(visitedMS || isMS) && <div className="console-workspace-host" hidden={!isMS} inert={!isMS ? '' : undefined}><App activeTab={activeTab} isActive={isMS} /></div>}
          {!route.projectId && <ProjectManager {...consoleState} onSelect={selectProject} onAdd={() => setEditor({ project: null })} onEdit={(project) => setEditor({ project })} />}
          {selected && !isMS && <CommandProjectPanel project={selected} status={loadError ? {} : commandStatus[selected.id]} busy={commandBusy[selected.id]} manualRunning={!loadError && manualRunning[selected.id]} lastUpdated={consoleState.lastUpdated}
            onStart={() => consoleState.runCommandAction(selected.id, 'start')} onStop={() => consoleState.runCommandAction(selected.id, 'stop')} onVisit={() => consoleState.visitCommandProject(selected)} onEdit={() => setEditor({ project: selected })} />}
          {route.projectId && !selected && <div className="console-loading" role="status">{loading ? '正在读取项目…' : loadError ? '恢复连接后将继续显示这个项目。' : '正在返回项目列表…'}</div>}
        </div>
      </main>
      {editor && <CommandProjectEditor project={editor.project} onClose={() => setEditor(null)} onSaved={() => refresh(true)} />}
      <Toaster position="top-right" toastOptions={{ duration: 3500, style: { background: '#172238', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' } }} />
    </div>
  )
}
