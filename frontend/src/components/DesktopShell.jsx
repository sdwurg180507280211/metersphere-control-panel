import { useCallback, useEffect, useMemo, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import DesktopAppEditor from './DesktopAppEditor'
import './DesktopShell.css'
import './DesktopShellManage.css'

const POLL_MS = 3000

const PHASE_META = {
  running: { label: '运行中', tone: 'running' },
  starting: { label: '启动中', tone: 'busy' },
  stopping: { label: '关闭中', tone: 'busy' },
  stopped: { label: '已停止', tone: 'stopped' },
  unknown: { label: '未检测', tone: 'unknown' }
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

function LocalServiceCard({ item, status, busy, onStart, onStop, onEdit }) {
  const phase = busy || status?.phase || 'unknown'
  const meta = PHASE_META[phase] || PHASE_META.unknown
  const running = status?.running === true
  const stopped = status?.running === false
  const statusKnown = status?.statusKnown === true
  const port = status?.port || item.statusPort

  return (
    <article className={`desktop-service-card tone-${meta.tone}`}>
      <div className="desktop-service-topline">
        <div className="desktop-service-title-wrap">
          <span className={`desktop-status-dot dot-${meta.tone}`} />
          <div className="desktop-service-heading">
            <strong>{item.name}</strong>
            <span>{statusKnown && port ? `127.0.0.1:${port}` : '未配置状态检测'}</span>
          </div>
        </div>
        <button
          type="button"
          className="desktop-config-button"
          disabled={Boolean(busy)}
          onClick={onEdit}
          title="配置服务"
        >
          配置
        </button>
      </div>

      <div className="desktop-service-meta">
        <span className={`desktop-phase phase-${meta.tone}`}>{meta.label}</span>
        {statusKnown && port ? <span>端口 {port}</span> : <span>启动 / 关闭由命令控制</span>}
      </div>

      <div className="desktop-service-actions desktop-primary-actions">
        <button
          type="button"
          className="action-start"
          disabled={Boolean(busy) || running}
          onClick={onStart}
        >
          {busy === 'starting' ? '启动中…' : '启动'}
        </button>
        <button
          type="button"
          className="action-stop"
          disabled={Boolean(busy) || stopped}
          onClick={onStop}
        >
          {busy === 'stopping' ? '关闭中…' : '关闭'}
        </button>
      </div>
    </article>
  )
}

export default function DesktopShell() {
  const [catalog, setCatalog] = useState([])
  const [status, setStatus] = useState({})
  const [busy, setBusy] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [pinned, setPinned] = useState(true)
  const [editor, setEditor] = useState(null)

  const refresh = useCallback(async (silent = false) => {
    try {
      const [catalogData, statusData] = await Promise.all([
        requestJson('/api/services/desktop-apps/catalog'),
        requestJson('/api/services/desktop-apps/status')
      ])
      setCatalog(Array.isArray(catalogData) ? catalogData : [])
      setStatus(statusData || {})
      setLastUpdated(new Date())
    } catch (error) {
      if (!silent) toast.error(error.message || '读取本地服务状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh(false)
    const timer = setInterval(() => refresh(true), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const summary = useMemo(() => ({
    running: catalog.filter((item) => status[item.id]?.running === true).length,
    total: catalog.length,
    unknown: catalog.filter((item) => status[item.id]?.statusKnown !== true).length
  }), [catalog, status])

  const runAction = useCallback(async (id, action) => {
    setBusy((current) => ({ ...current, [id]: action === 'start' ? 'starting' : 'stopping' }))
    try {
      await requestJson(`/api/services/desktop-apps/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
      toast.success(action === 'start' ? '启动命令已执行' : '关闭命令已执行')
      setTimeout(() => refresh(true), 300)
      setTimeout(() => refresh(true), 1200)
      setTimeout(() => refresh(true), 3000)
    } catch (error) {
      toast.error(error.message || (action === 'start' ? '启动失败' : '关闭失败'))
    } finally {
      setBusy((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }, [refresh])

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
              <span className="group-code">APP</span>
              <h2>本地服务</h2>
            </div>
            <div className="desktop-group-controls">
              {summary.unknown > 0 ? <span>{summary.unknown} 个未检测</span> : null}
              <button type="button" className="desktop-add-app" onClick={() => setEditor({ mode: 'create' })}>＋ 添加</button>
            </div>
          </div>

          {catalog.length === 0 ? (
            <div className="desktop-empty-state">
              <strong>还没有本地服务</strong>
              <span>填写服务名称、启动命令和关闭命令，就可以直接在这里控制。</span>
              <button type="button" className="desktop-empty-add" onClick={() => setEditor({ mode: 'create' })}>＋ 添加第一个服务</button>
            </div>
          ) : (
            <div className="desktop-card-list">
              {catalog.map((item) => (
                <LocalServiceCard
                  key={item.id}
                  item={item}
                  status={status[item.id]}
                  busy={busy[item.id]}
                  onStart={() => runAction(item.id, 'start')}
                  onStop={() => runAction(item.id, 'stop')}
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
