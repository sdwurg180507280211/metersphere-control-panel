import { useCallback, useEffect, useMemo, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import DesktopAppEditor from './DesktopAppEditor'
import './DesktopShell.css'

const POLL_MS = 3000

const PHASE_META = {
  running: { label: '运行中', tone: 'running' },
  starting: { label: '启动中', tone: 'busy' },
  checking_health: { label: '检查中', tone: 'busy' },
  stopping: { label: '停止中', tone: 'busy' },
  restarting: { label: '重启中', tone: 'busy' },
  failed: { label: '失败', tone: 'failed' },
  stopped: { label: '已停止', tone: 'stopped' }
}

function normalizePhase(status) {
  if (!status) return 'stopped'
  if (status.phase) return status.phase
  return status.running ? 'running' : 'stopped'
}

async function requestJson(url, init) {
  const response = await fetch(url, init)
  const data = await response.json()
  if (!response.ok || data.success === false) {
    const message = data.error?.message || data.error || `请求失败 (${response.status})`
    throw new Error(message)
  }
  return data.data
}

function DesktopServiceCard({ item, status, kind, busy, onAction, onLogs, onEdit }) {
  const phase = busy || normalizePhase(status)
  const meta = PHASE_META[phase] || PHASE_META.stopped
  const running = status?.running === true
  const port = item.port || status?.port
  const runtime = item.runtime || (kind === 'metersphere' ? 'JAVA' : 'PROCESS')

  return (
    <article className={`desktop-service-card tone-${meta.tone}`}>
      <div className="desktop-service-topline">
        <div className="desktop-service-title-wrap">
          <span className={`desktop-status-dot dot-${meta.tone}`} />
          <div className="desktop-service-heading">
            <strong>{item.name || item.id}</strong>
            <span>{item.id}</span>
          </div>
        </div>
        <span className="desktop-runtime-badge">{String(runtime).toUpperCase()}</span>
      </div>

      <div className="desktop-service-meta">
        <span className={`desktop-phase phase-${meta.tone}`}>{meta.label}</span>
        {port ? <span>:{port}</span> : null}
        {status?.pid ? <span>PID {status.pid}</span> : null}
        {status?.portReachable === true ? <span className="desktop-health-ok">PORT OK</span> : null}
        {status?.portReachable === false && running ? <span className="desktop-health-wait">PORT WAIT</span> : null}
      </div>

      <div className="desktop-service-actions">
        <button
          type="button"
          className={running ? 'action-stop' : 'action-start'}
          disabled={Boolean(busy)}
          onClick={() => onAction(running ? 'stop' : 'start')}
        >
          {busy ? '处理中…' : running ? '停止' : '启动'}
        </button>
        <button
          type="button"
          className="action-secondary"
          disabled={Boolean(busy) || !running}
          onClick={() => onAction('restart')}
        >
          重启
        </button>
        {kind === 'desktop' ? (
          <>
            <button type="button" className="action-secondary" onClick={onLogs}>日志</button>
            <button
              type="button"
              className="action-secondary"
              disabled={Boolean(busy) || running}
              onClick={onEdit}
              title={running ? '停止应用后可修改配置' : '配置应用'}
            >
              配置
            </button>
          </>
        ) : null}
      </div>
    </article>
  )
}

export default function DesktopShell() {
  const [meterCatalog, setMeterCatalog] = useState([])
  const [meterStatus, setMeterStatus] = useState({})
  const [desktopCatalog, setDesktopCatalog] = useState([])
  const [desktopStatus, setDesktopStatus] = useState({})
  const [busy, setBusy] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pinned, setPinned] = useState(true)
  const [logPanel, setLogPanel] = useState(null)
  const [editor, setEditor] = useState(null)

  const refresh = useCallback(async (silent = false) => {
    try {
      const [meterCatalogData, meterStatusData, desktopCatalogData, desktopStatusData] = await Promise.all([
        requestJson('/api/services/catalog'),
        requestJson('/api/services/status'),
        requestJson('/api/services/desktop-apps/catalog'),
        requestJson('/api/services/desktop-apps/status')
      ])
      setMeterCatalog(Array.isArray(meterCatalogData) ? meterCatalogData : [])
      setMeterStatus(meterStatusData || {})
      setDesktopCatalog(Array.isArray(desktopCatalogData) ? desktopCatalogData : [])
      setDesktopStatus(desktopStatusData || {})
      setLastUpdated(new Date())
    } catch (error) {
      if (!silent) toast.error(error.message || '读取服务状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh(false)
    const timer = setInterval(() => refresh(true), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const summary = useMemo(() => {
    const meterRunning = meterCatalog.filter((item) => meterStatus[item.id]?.running).length
    const desktopRunning = desktopCatalog.filter((item) => desktopStatus[item.id]?.running).length
    return {
      running: meterRunning + desktopRunning,
      total: meterCatalog.length + desktopCatalog.length,
      meterRunning,
      desktopRunning
    }
  }, [meterCatalog, meterStatus, desktopCatalog, desktopStatus])

  const runAction = useCallback(async (kind, id, action) => {
    const key = `${kind}:${id}`
    setBusy((current) => ({ ...current, [key]: action === 'stop' ? 'stopping' : action === 'restart' ? 'restarting' : 'starting' }))
    try {
      const base = kind === 'desktop'
        ? `/api/services/desktop-apps/${encodeURIComponent(id)}`
        : `/api/services/${encodeURIComponent(id)}`
      await requestJson(`${base}/${action}`, { method: 'POST' })
      toast.success(`${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}命令已发送`)
      setTimeout(() => refresh(true), 500)
      setTimeout(() => refresh(true), 1800)
    } catch (error) {
      toast.error(error.message || '操作失败')
    } finally {
      setTimeout(() => {
        setBusy((current) => {
          const next = { ...current }
          delete next[key]
          return next
        })
      }, 1200)
    }
  }, [refresh])

  const showLogs = useCallback(async (item) => {
    try {
      const data = await requestJson(`/api/services/desktop-apps/${encodeURIComponent(item.id)}/logs?tail=160`)
      setLogPanel({ item, content: data?.content || '暂无日志' })
    } catch (error) {
      toast.error(error.message || '读取日志失败')
    }
  }, [])

  const togglePin = async () => {
    const next = !pinned
    setPinned(next)
    try {
      await window.desktopBridge?.setAlwaysOnTop?.(next)
    } catch {
      // Browser fallback: visual state only.
    }
  }

  return (
    <div className="desktop-shell">
      <Toaster position="top-center" toastOptions={{ duration: 2200 }} />

      <header className="desktop-shell-header desktop-drag-region">
        <div>
          <div className="desktop-eyebrow">MAC LOCAL CONTROL</div>
          <h1>Local Service Hub</h1>
        </div>
        <div className="desktop-window-actions desktop-no-drag">
          <button type="button" className={pinned ? 'is-active' : ''} onClick={togglePin} title="置顶">PIN</button>
          <button type="button" onClick={() => window.desktopBridge?.hideWindow?.()} title="隐藏">—</button>
        </div>
      </header>

      <section className="desktop-overview desktop-no-drag">
        <div className="desktop-overview-count">
          <strong>{summary.running}</strong>
          <span>/ {summary.total} RUNNING</span>
        </div>
        <div className="desktop-overview-pulse"><span /></div>
        <button type="button" onClick={() => refresh(false)} disabled={loading}>{loading ? '同步中' : '刷新'}</button>
      </section>

      <main className="desktop-shell-scroll desktop-no-drag">
        <section className="desktop-group">
          <div className="desktop-group-heading">
            <div>
              <span className="group-code">MS</span>
              <h2>MeterSphere</h2>
            </div>
            <span>{summary.meterRunning}/{meterCatalog.length}</span>
          </div>
          <div className="desktop-card-list">
            {meterCatalog.map((item) => (
              <DesktopServiceCard
                key={item.id}
                item={item}
                kind="metersphere"
                status={meterStatus[item.id]}
                busy={busy[`metersphere:${item.id}`]}
                onAction={(action) => runAction('metersphere', item.id, action)}
              />
            ))}
          </div>
        </section>

        <section className="desktop-group">
          <div className="desktop-group-heading">
            <div>
              <span className="group-code">APP</span>
              <h2>本地应用</h2>
            </div>
            <div className="desktop-group-controls">
              <span>{summary.desktopRunning}/{desktopCatalog.length}</span>
              <button type="button" className="desktop-add-app" onClick={() => setEditor({ mode: 'create' })}>＋ 添加</button>
            </div>
          </div>

          {desktopCatalog.length === 0 ? (
            <div className="desktop-empty-state">
              <strong>还没有登记本地应用</strong>
              <span>选择项目目录后自动识别 Node / Python / Maven / Gradle / Shell 启动方式。</span>
              <button type="button" className="desktop-empty-add" onClick={() => setEditor({ mode: 'create' })}>＋ 添加第一个应用</button>
            </div>
          ) : (
            <div className="desktop-card-list">
              {desktopCatalog.map((item) => (
                <DesktopServiceCard
                  key={item.id}
                  item={item}
                  kind="desktop"
                  status={desktopStatus[item.id]}
                  busy={busy[`desktop:${item.id}`]}
                  onAction={(action) => runAction('desktop', item.id, action)}
                  onLogs={() => showLogs(item)}
                  onEdit={() => setEditor({ mode: 'edit', app: item })}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="desktop-shell-footer desktop-no-drag">
        <span>{lastUpdated ? `更新 ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '等待状态'}</span>
        <button type="button" onClick={() => window.desktopBridge?.openMainWindow?.()}>打开完整控制面板 ↗</button>
      </footer>

      {logPanel && (
        <div className="desktop-log-backdrop desktop-no-drag" onClick={() => setLogPanel(null)}>
          <section className="desktop-log-panel" onClick={(event) => event.stopPropagation()}>
            <div className="desktop-log-head">
              <div><strong>{logPanel.item.name}</strong><span>最新日志</span></div>
              <button type="button" onClick={() => setLogPanel(null)}>×</button>
            </div>
            <pre>{logPanel.content}</pre>
          </section>
        </div>
      )}

      {editor && (
        <DesktopAppEditor
          app={editor.mode === 'edit' ? editor.app : null}
          onClose={() => setEditor(null)}
          onSaved={() => refresh(false)}
        />
      )}
    </div>
  )
}
