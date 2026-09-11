import { useCallback, useEffect, useMemo, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import DesktopAppEditor from './DesktopAppEditor'
import './DesktopShell.css'

const POLL_MS = 3000
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000
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

function summarizeMeterSphere(catalog, status, available) {
  const total = catalog.length
  const running = catalog.filter((item) => status[item.id]?.running === true).length
  const transitioning = catalog.some((item) => ['starting', 'stopping', 'restarting', 'checking_health'].includes(status[item.id]?.phase))
  const failed = catalog.some((item) => status[item.id]?.phase === 'failed')

  if (!available) {
    return { total, running, tone: 'unknown', label: '状态不可用', detail: '打开工作区检查配置' }
  }
  if (total === 0) {
    return { total, running, tone: 'unknown', label: '未检测', detail: '尚未读取服务目录' }
  }
  if (transitioning) {
    return { total, running, tone: 'busy', label: `${running} / ${total} 运行中`, detail: '服务状态变化中' }
  }
  if (running === total) {
    return { total, running, tone: 'running', label: `${running} / ${total} 运行中`, detail: '全部服务正常' }
  }
  if (running > 0) {
    return { total, running, tone: 'partial', label: `${running} / ${total} 运行中`, detail: '部分服务已启动' }
  }
  if (failed) {
    return { total, running, tone: 'failed', label: '服务异常', detail: `${total} 个 MeterSphere 服务` }
  }
  return { total, running, tone: 'stopped', label: '全部已停止', detail: `${total} 个 MeterSphere 服务` }
}

function MeterSphereProjectRow({ summary, onOpen }) {
  return (
    <article className="desktop-service-row desktop-project-row-featured">
      <div className="desktop-service-identity">
        <div className="desktop-project-icon" aria-hidden="true">MS</div>
        <div>
          <button type="button" className="desktop-service-title desktop-project-title" onClick={onOpen}>
            MeterSphere
          </button>
          <span>Java / Vue · {summary.total ? `${summary.total} 个服务` : '多服务项目'}</span>
        </div>
      </div>

      <div className="desktop-service-state">
        <span className={`desktop-state-pill state-${summary.tone}`}>{summary.label}</span>
        <small>{summary.detail}</small>
      </div>

      <div className="desktop-service-actions">
        <button type="button" className="desktop-action desktop-workspace-action" onClick={onOpen}>
          打开工作区
        </button>
      </div>
    </article>
  )
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
  const canVisit = Boolean(port && statusKnown && running && !busy)
  const actionIsStop = running || busy === 'stopping'
  const actionLabel = busy === 'starting'
    ? '启动中…'
    : busy === 'stopping'
      ? '关闭中…'
      : actionIsStop
        ? '关闭'
        : '启动'

  const visitFromRow = () => {
    if (canVisit) onVisit()
  }

  const handleTitleClick = (event) => {
    event.stopPropagation()
    if (canVisit) onVisit()
  }

  return (
    <article
      className={`desktop-service-row ${canVisit ? 'desktop-service-row-visitable' : ''}`}
      onClick={visitFromRow}
      title={canVisit ? `打开 http://127.0.0.1:${port}` : undefined}
    >
      <div className="desktop-service-identity">
        <span className={`desktop-status-dot dot-${meta.tone}`} aria-hidden="true" />
        <div>
          <button
            type="button"
            className="desktop-service-title"
            disabled={!canVisit}
            onClick={handleTitleClick}
            title={canVisit ? `在浏览器中打开 http://127.0.0.1:${port}` : undefined}
          >
            {item.name}
          </button>
          <span>{port ? `127.0.0.1:${port}` : '未配置状态端口'}</span>
        </div>
      </div>

      <div className="desktop-service-state">
        <span className={`desktop-state-pill state-${meta.tone}`}>{meta.label}</span>
        <small>{port ? `TCP ${port}` : '手动控制'}</small>
      </div>

      <div className="desktop-service-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="desktop-action desktop-action-secondary"
          disabled={Boolean(busy)}
          onClick={onEdit}
        >
          配置
        </button>
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
  const [meterSphere, setMeterSphere] = useState({ catalog: [], status: {}, available: true })
  const [manualRunning, setManualRunning] = useState(readManualRunning)
  const [busy, setBusy] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [editor, setEditor] = useState(null)
  const [update, setUpdate] = useState({
    currentVersion: '',
    latestVersion: null,
    updateAvailable: false,
    installSupported: false,
    checking: false,
    installing: false,
    checked: false,
    notes: ''
  })

  const refresh = useCallback(async (silent = false) => {
    try {
      const commandProjectsRequest = Promise.all([
        requestJson('/api/services/desktop-apps/catalog'),
        requestJson('/api/services/desktop-apps/status')
      ])
      const meterSphereRequest = Promise.all([
        requestJson('/api/services/catalog'),
        requestJson('/api/services/status')
      ]).catch(() => null)

      const [[catalogData, statusData], meterSphereData] = await Promise.all([
        commandProjectsRequest,
        meterSphereRequest
      ])

      setCatalog(Array.isArray(catalogData) ? catalogData : [])
      setStatus(statusData || {})
      if (meterSphereData) {
        const [meterSphereCatalog, meterSphereStatus] = meterSphereData
        setMeterSphere({
          catalog: Array.isArray(meterSphereCatalog) ? meterSphereCatalog : [],
          status: meterSphereStatus || {},
          available: true
        })
      } else {
        setMeterSphere((current) => ({ ...current, available: false }))
      }
      setLastUpdated(new Date())
    } catch (error) {
      if (!silent) toast.error(error.message || '读取项目状态失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const checkUpdate = useCallback(async (silent = false) => {
    setUpdate((current) => ({ ...current, checking: true }))
    try {
      const data = await requestJson('/api/services/desktop-update/check')
      setUpdate((current) => ({
        ...current,
        ...data,
        checking: false,
        checked: true
      }))
      if (!silent) {
        toast.success(data.updateAvailable ? `发现新版本 v${data.latestVersion}` : '当前已经是最新版本')
      }
    } catch (error) {
      setUpdate((current) => ({ ...current, checking: false, checked: true }))
      if (!silent) toast.error(error.message || '检查更新失败')
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!update.updateAvailable || update.installing) return
    setUpdate((current) => ({ ...current, installing: true }))
    try {
      const data = await requestJson('/api/services/desktop-update/install', { method: 'POST' })
      toast.success(`v${data.latestVersion} 已下载并校验，正在重启安装…`, { duration: 5000 })
    } catch (error) {
      setUpdate((current) => ({ ...current, installing: false }))
      toast.error(error.message || '安装更新失败')
    }
  }, [update.installing, update.updateAvailable])

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
    let cancelled = false
    requestJson('/api/services/desktop-update/info')
      .then((data) => {
        if (cancelled) return
        setUpdate((current) => ({ ...current, ...data }))
      })
      .catch(() => {})

    const startupTimer = setTimeout(() => checkUpdate(true), 1500)
    const interval = setInterval(() => checkUpdate(true), UPDATE_CHECK_MS)
    return () => {
      cancelled = true
      clearTimeout(startupTimer)
      clearInterval(interval)
    }
  }, [checkUpdate])

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

  const meterSphereSummary = useMemo(
    () => summarizeMeterSphere(meterSphere.catalog, meterSphere.status, meterSphere.available),
    [meterSphere]
  )

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

  const openMeterSphereWorkspace = useCallback(async () => {
    if (!window.desktopBridge?.openWorkspace) {
      toast.error('当前环境不支持打开 MeterSphere 工作区')
      return
    }
    try {
      await window.desktopBridge.openWorkspace('metersphere')
    } catch (error) {
      toast.error(error.message || '打开 MeterSphere 工作区失败')
    }
  }, [])

  const versionLabel = update.currentVersion ? `v${update.currentVersion}` : '版本读取中' 
  const formatSize = (bytes) => (
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round((bytes || 0) / 1024))} KB`
  )
  const updateButtonTitle = [
    update.asset?.updateMode === 'delta' ? '增量更新（模型层复用旧包）' : '完整更新',
    update.asset?.bytes ? `约 ${formatSize(update.asset.bytes)}` : '',
    update.notes ? update.notes.slice(0, 400) : ''
  ].filter(Boolean).join(' · ') || undefined

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
            <h1>我的项目</h1>
            <p>集中管理本地开发项目与服务。</p>
          </div>
        </div>
        <button type="button" className="desktop-primary-button" onClick={() => setEditor({ mode: 'create' })}>
          ＋ 添加项目
        </button>
      </header>

      <section className="desktop-summary-grid" aria-label="项目概览">
        <div className="desktop-summary-card">
          <span>全部项目</span>
          <strong>{summary.total + 1}</strong>
          <small>MeterSphere + Command 项目</small>
        </div>
        <div className="desktop-summary-card summary-running">
          <span>MeterSphere</span>
          <strong>{meterSphereSummary.total ? `${meterSphereSummary.running}/${meterSphereSummary.total}` : '—'}</strong>
          <small>运行中的服务</small>
        </div>
        <div className="desktop-summary-card">
          <span>Command 项目</span>
          <strong>{summary.total}</strong>
          <small>使用启动 / 关闭命令管理</small>
        </div>
        <div className="desktop-summary-card">
          <span>Command 运行中</span>
          <strong>{summary.running}</strong>
          <small>状态端口可连接</small>
        </div>
      </section>

      <main className="desktop-content-panel">
        <div className="desktop-list-toolbar">
          <div>
            <h2>项目列表</h2>
            <span>{lastUpdated ? `最后更新 ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '正在读取状态'}</span>
          </div>
          <button type="button" className="desktop-refresh-button" onClick={() => refresh(false)} disabled={loading}>
            {loading ? '刷新中…' : '刷新状态'}
          </button>
        </div>

        <div className="desktop-service-list">
          <div className="desktop-project-section-label">高级项目</div>
          <MeterSphereProjectRow summary={meterSphereSummary} onOpen={openMeterSphereWorkspace} />
          <div className="desktop-project-section-label desktop-project-section-label-command">Command 项目</div>
          {catalog.length === 0 ? (
            <div className="desktop-empty-state desktop-empty-state-compact">
              <div className="desktop-empty-icon">＋</div>
              <strong>还没有 Command 项目</strong>
              <span>添加项目名称、启动命令、关闭命令和可选状态端口后，就可以从这里直接管理。</span>
              <button type="button" className="desktop-primary-button" onClick={() => setEditor({ mode: 'create' })}>
                添加第一个项目
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
        <span>Local Service Hub · {versionLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {update.installSupported && update.updateAvailable ? (
            <button
              type="button"
              onClick={installUpdate}
              disabled={update.installing}
              title={updateButtonTitle}
            >
              {update.installing ? '正在下载并安装…' : `更新到 v${update.latestVersion}`}
            </button>
          ) : update.installSupported ? (
            <button type="button" onClick={() => checkUpdate(false)} disabled={update.checking}>
              {update.checking ? '检查中…' : update.checked ? '已是最新' : '检查更新'}
            </button>
          ) : null}
          <button type="button" onClick={openMeterSphereWorkspace}>
            打开 MeterSphere 工作区
          </button>
        </div>
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
