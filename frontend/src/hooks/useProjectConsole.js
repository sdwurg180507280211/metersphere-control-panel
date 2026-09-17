import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { buildProjectViewModel } from '../projectModel'

const POLL_MS = 3000
const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000
const MANUAL_RUNNING_KEY = 'local-service-hub.manual-running'

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

function readManualRunning() {
  try {
    const value = JSON.parse(localStorage.getItem(MANUAL_RUNNING_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function useProjectConsole() {
  const [commandProjects, setCommandProjects] = useState([])
  const [meterSphereProject, setMeterSphereProject] = useState(null)
  const [commandStatus, setCommandStatus] = useState({})
  const [meterSphere, setMeterSphere] = useState({ catalog: [], status: {}, available: true })
  const [manualRunning, setManualRunning] = useState(readManualRunning)
  const [commandBusy, setCommandBusy] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const refreshInFlight = useRef(null)
  const actionInFlight = useRef(new Set())
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

  const refresh = useCallback((silent = false) => {
    if (refreshInFlight.current) return refreshInFlight.current
    refreshInFlight.current = (async () => {
    try {
      const commandProjectsRequest = Promise.all([
        requestJson('/api/projects/commands'),
        requestJson('/api/projects/commands/status')
      ])
      const meterSphereProjectRequest = requestJson('/api/projects/metersphere').catch(() => null)
      const meterSphereRequest = Promise.all([
        requestJson('/api/services/catalog'),
        requestJson('/api/services/status')
      ]).catch(() => null)

      const [[commandProjectsData, commandStatusData], meterSphereProjectData, meterSphereData] = await Promise.all([
        commandProjectsRequest,
        meterSphereProjectRequest,
        meterSphereRequest
      ])

      setLoadError('')
      setLoaded(true)
      setCommandProjects(Array.isArray(commandProjectsData) ? commandProjectsData : [])
      setCommandStatus(commandStatusData || {})
      setMeterSphereProject(meterSphereProjectData)
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
      setLoadError(error.message || '读取项目状态失败')
      if (!silent) toast.error(error.message || '读取项目状态失败')
    } finally {
      setLoading(false)
      refreshInFlight.current = null
    }
    })()
    return refreshInFlight.current
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
    refresh(false)
    const timer = setInterval(() => refresh(true), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    let startupTimer
    let interval
    requestJson('/api/services/desktop-update/info').then((data) => {
      if (cancelled) return
      setUpdate((current) => ({ ...current, ...data }))
      if (!data.installSupported) return
      startupTimer = setTimeout(() => checkUpdate(true), 1500)
      interval = setInterval(() => checkUpdate(true), UPDATE_CHECK_MS)
    }).catch(() => {})
    return () => {
      cancelled = true
      clearTimeout(startupTimer)
      clearInterval(interval)
    }
  }, [checkUpdate])

  useEffect(() => {
    if (commandProjects.length === 0) return
    const ids = new Set(commandProjects.map((project) => project.id))
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
  }, [commandProjects])

  const projects = useMemo(
    () => buildProjectViewModel(commandProjects, meterSphereProject),
    [commandProjects, meterSphereProject]
  )

  const commandSummary = useMemo(() => {
    const running = commandProjects.filter((project) => commandStatus[project.id]?.running === true).length
    const stopped = commandProjects.filter((project) => commandStatus[project.id]?.running === false).length
    const unknown = commandProjects.filter((project) => commandStatus[project.id]?.statusKnown !== true).length
    return { running, stopped, unknown, total: commandProjects.length }
  }, [commandProjects, commandStatus])

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

  const runCommandAction = useCallback(async (id, action) => {
    if (actionInFlight.current.has(id)) return
    actionInFlight.current.add(id)
    setCommandBusy((current) => ({ ...current, [id]: action === 'start' ? 'starting' : 'stopping' }))
    try {
      await requestJson(`/api/projects/commands/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
      if (commandStatus[id]?.statusKnown !== true) {
        rememberManualRunning(id, action === 'start')
      }
      toast.success(action === 'start' ? '启动命令已执行' : '关闭命令已执行')
      await refresh(true)
    } catch (error) {
      toast.error(error.message || (action === 'start' ? '启动失败' : '关闭失败'))
    } finally {
      actionInFlight.current.delete(id)
      setCommandBusy((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    }
  }, [commandStatus, refresh, rememberManualRunning])

  const visitCommandProject = useCallback(async (project) => {
    const projectStatus = commandStatus[project.id]
    const port = projectStatus?.port || project.statusPort
    if (!port || projectStatus?.statusKnown !== true || projectStatus?.running !== true) return

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
  }, [commandStatus])

  return { projects, commandStatus, commandBusy, manualRunning, loading, loaded, loadError, lastUpdated, meterSphereSummary, commandSummary, refresh, runCommandAction, visitCommandProject, update, checkUpdate, installUpdate }
}
