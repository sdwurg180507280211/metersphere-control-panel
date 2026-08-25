import { useCallback, useEffect, useMemo, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import DesktopAppEditor from './DesktopAppEditor'
import './DesktopShell.css'

const POLL_MS = 3000
const MANUAL_RUNNING_KEY = 'local-service-hub.manual-running'

const PHASE_META = {
  running: { label: '运行中', tone: 'running' },
  'manual-running': { label: '手动已启动', tone: 'running' },
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

function readManualRunning() {
  try {
    const value = JSON.parse(localStorage.getItem(MANUAL_RUNNING_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

function LocalServiceRow({ item, status, manualRunning, busy, onStart, onStop, onVisit, onEdit }) {
  const statusKnown = status?.statusKnown === true
  const running = statusKnown ? status?.running === true : manualRunning === true
  const phase = busy || (statusKnown ? status?.phase : running ? 'manual-running' : 'unknown')
  const meta = PHASE_META[phase] || PHASE_META.unknown
  const port = status?.port || item.statusPort
  const actionIsStop = running || busy === 'stopping'
  const actionLabel = busy === 'starting'
    ? '启动中…'
    : busy === 'stopping'
      ? '关闭中…'
      : actionIsStop
        ? '关闭'
        : '启动'

  return (
    <article className="desktop-service-row">
      <div className="desktop-service-identity">
        <span className={`desktop-status-dot dot-${meta.tone}`} aria-hidden="true" />
        <div>
          <strong>{item.name}</strong>
          <span>{port ? `127.0.0.1:${port}` : '未配置状态端口'}</span>
        </div>
      </div>

      <div className="desktop-service-state">
        <span className={`desktop-state-pill state-${meta.tone}`}>{meta.label}</span>
        <small>{port ? `TCP ${port}` : '手动控制'}</small>
      </div>

      <div className="desktop-service-actions">
        <button
          type="button"
          className="desktop-action desktop-action-secondary"
          disabled={Boolean(busy)}
          onClick={onEdit}
        >
          配置
        </button>
        {port && (
          <button
            type="button"
            className="desktop-action desktop-action-visit"
            disabled={Boolean(busy) || !statusKnown || !running}
            onClick={onVisit}
            title={statusKnown && running ? `在浏览器中打开 http://127.0.0.1:${port}` : '服务运行后可访问'}
          >
            访问
          </button>
        )}
        <button
          type="button"
          className={`desktop-action ${actionIsStop ? 'desktop-action-stop' : 'desktop-action-start'}`}
          disabled={Boolean(busy)}
          onClick={actionIsStop ? onStop : onStart}
        >
          {actionLabel}
        </button>
      </div>
    </article>
  )
}

export default function DesktopShell() {
  const [catalog, setCatalog] = useState([])
  const [status, setStatus] = useState({})
  const [manualRunning, setManualRunning] = useState(readManualRunning)
  const [busy, setBusy] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
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
    const previousTitle = document.title
    document.title = 'Local Service Hub'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    refresh(false)
    const timer = setInterval(() => refresh(true), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (catalog.length === 0) return
    const ids = new Set(catalog.map((item) => item.id))
    setManualRunning((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id)))
      if (Object.keys(next).length === Object.keys(current).length) return current
      try {
        localStorage.setItem(MANUAL_RUNNING_KEY, JSON.stringify(next))
      } catch {
        // localStorage 不可用时仅清理当前会话状态。
      }
      return next
    })
  }, [catalog])

  const summary = useMemo(() => {
    const running = catalog.filter((item) => status[item.id]?.running === true).length
    const stopped = catalog.filter((item) => status[item.id]?.running === false).length
    const unknown = catalog.filter((item) => status[item.id]?.statusKnown !== true).length
    return { running, stopped, unknown, total: catalog.length }
  }, [catalog, status])

  const rememberManualRunning = useCallback((id, running) => {
    setManualRunning((current) => {
      const next = { ...current, [id]: Boolean(running) }
      try {
        localStorage.setItem(MANUAL_RUNNING_KEY, JSON.stringify(next))
      } catch {
        // localStorage 不可用时仅保留当前会话状态。
      }
      return next
    })
  }, [])

  const runAction = useCallback(async (id, action) => {
    setBusy((current) => ({ ...current, [id]: action === 'start' ? 'starting' : 'stopping' }))
    try {
      await requestJson(`/api/services/desktop-apps/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
      if (status[id]?.statusKnown !== true) {
        rememberManualRunning(id, action === 'start')
      }
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
  }, [refresh, rememberManualRunning, status])

  const visitService = useCallback(async (item) => {
    const serviceStatus = status[item.id]
    const port = serviceStatus?.port || item.statusPort
    if (!port || serviceStatus?.statusKnown !== true || serviceStatus?.running !== true) return

    const url = `http://127.0.0.1:${port}`
    try {
      if (window.desktopBridge?.openExternal) {
        await window.desktopBridge.openExternal(url)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      toast.error(error.message || '打开服务地址失败')
    }
  }, [status])

  return (
    <div className="desktop-shell">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 2200,
          style: {
            background: '#ffffff',
            color: '#1d1d1f',
            border: '1px solid #e5e5e7',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.10)'
          }
        }}
      />

      <header className="desktop-app-header">
        <div className="desktop-app-brand">
          <div className="desktop-app-mark" aria-hidden="true">LS</div>
          <div>
            <span className="desktop-app-kicker">LOCAL SERVICE HUB</span>
            <h1>本地服务</h1>
            <p>在 Mac 上集中启动、访问和关闭常用开发服务。</p>
          </div>
        </div>
        <button type="button" className="desktop-primary-button" onClick={() => setEditor({ mode: 'create' })}>
          ＋ 添加服务
        </button>
      </header>

      <section className="desktop-summary-grid" aria-label="服务概览">
        <div className="desktop-summary-card">
          <span>全部服务</span>
          <strong>{summary.total}</strong>
          <small>已保存的本地服务</small>
        </div>
        <div className="desktop-summary-card summary-running">
          <span>运行中</span>
          <strong>{summary.running}</strong>
          <small>状态端口可连接</small>
        </div>
        <div className="desktop-summary-card">
          <span>已停止</span>
          <strong>{summary.stopped}</strong>
          <small>状态端口未监听</small>
        </div>
        <div className="desktop-summary-card">
          <span>未检测</span>
          <strong>{summary.unknown}</strong>
          <small>未配置状态端口</small>
        </div>
      </section>

      <main className="desktop-content-panel">
        <div className="desktop-list-toolbar">
          <div>
            <h2>服务列表</h2>
            <span>{lastUpdated ? `最后更新 ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '正在读取状态'}</span>
          </div>
          <button type="button" className="desktop-refresh-button" onClick={() => refresh(false)} disabled={loading}>
            {loading ? '刷新中…' : '刷新状态'}
          </button>
        </div>

        <div className="desktop-service-list">
          {catalog.length === 0 ? (
            <div className="desktop-empty-state">
              <div className="desktop-empty-icon">＋</div>
              <strong>还没有本地服务</strong>
              <span>添加服务名称、启动命令、关闭命令和可选状态端口后，就可以从这里直接管理。</span>
              <button type="button" className="desktop-primary-button" onClick={() => setEditor({ mode: 'create' })}>
                添加第一个服务
              </button>
            </div>
          ) : (
            catalog.map((item) => (
              <LocalServiceRow
                key={item.id}
                item={item}
                status={status[item.id]}
                manualRunning={manualRunning[item.id]}
                busy={busy[item.id]}
                onStart={() => runAction(item.id, 'start')}
                onStop={() => runAction(item.id, 'stop')}
                onVisit={() => visitService(item)}
                onEdit={() => setEditor({ mode: 'edit', app: item })}
              />
            ))
          )}
        </div>
      </main>

      <footer className="desktop-app-footer">
        <span>Local Service Hub · macOS</span>
        <button type="button" onClick={() => window.desktopBridge?.openMainWindow?.()}>
          打开完整控制面板
        </button>
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
