import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useWebSocketStore, useLogStore, useBuildStore, useServiceStore, usePackageStore, useInfraStore } from '../store/useAppStore'

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws'
const LOCAL_TOKEN_KEY = 'msLocalToken'
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY = 3000

// 从 API 响应中提取错误消息（处理 error 是对象 {code, message, details} 的情况）
function extractError(data, defaultMessage) {
  const { error } = data
  if (typeof error === 'object' && error !== null) {
    return error.message || error
  }
  return error || defaultMessage
}

export function useWebSocket() {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const heartbeatTimerRef = useRef(null)
  const scheduledRefreshesRef = useRef({})
  const reconnectCountRef = useRef(0)
  const isConnectingRef = useRef(false)
  const isUnmountedRef = useRef(false)
  const intentionalCloseRef = useRef(false)

  const appendServiceLogRef = useRef(useLogStore.getState().appendServiceLog)
  const appendBuildLogRef = useRef(useLogStore.getState().appendBuildLog)
  const appendPackageLogRef = useRef(useLogStore.getState().appendPackageLog)
  const updateBuildProgressRef = useRef(useBuildStore.getState().updateBuildProgress)
  const fetchActiveBuildsRef = useRef(useBuildStore.getState().fetchActiveBuilds)
  const fetchBuildHistoryRef = useRef(useBuildStore.getState().fetchBuildHistory)
  const updateServiceStatusRef = useRef(useServiceStore.getState().updateServiceStatus)
  const fetchServicesRef = useRef(useServiceStore.getState().fetchServices)
  const updatePackageTaskRef = useRef(usePackageStore.getState().updateCurrentTask)
  const fetchPackageActiveTaskRef = useRef(usePackageStore.getState().fetchActiveTask)
  const fetchPackageOptionsRef = useRef(usePackageStore.getState().fetchOptions)
  const fetchPackageHistoryRef = useRef(usePackageStore.getState().fetchHistory)
  const setInfraStatusRef = useRef(useInfraStore.getState().setStatus)
  const fetchInfraStatusRef = useRef(useInfraStore.getState().fetchInfraStatus)

  const {
    setConnected,
    setClientId,
    incrementReconnect,
    resetReconnect
  } = useWebSocketStore()

  const clearScheduledRefreshes = useCallback(() => {
    Object.values(scheduledRefreshesRef.current).forEach(({ timerId }) => {
      clearTimeout(timerId)
    })
    scheduledRefreshesRef.current = {}
  }, [])

  const scheduleRefresh = useCallback((key, callback, delay = 0) => {
    const existing = scheduledRefreshesRef.current[key]
    const nextRunAt = Date.now() + delay

    if (existing) {
      if (existing.runAt <= nextRunAt) {
        return
      }

      clearTimeout(existing.timerId)
    }

    const timerId = setTimeout(() => {
      delete scheduledRefreshesRef.current[key]
      callback()
    }, delay)

    scheduledRefreshesRef.current[key] = {
      timerId,
      runAt: nextRunAt
    }
  }, [])

  // 处理单个模块构建完成
  const handleBuildCompleted = useCallback((data) => {
    const { module, linkedService, autoRestart } = data

    // 触发构建完成事件供 BuildTab 监听
    window.dispatchEvent(new CustomEvent('buildComplete', {
      detail: { status: 'success', module, linkedService, autoRestart }
    }))

    // 如果设置了自动重启，不需要提示
    if (autoRestart) {
      toast.success(`${module.name} 构建完成，正在自动重启关联服务...`)
      return
    }

    // 如果没有关联服务，只显示构建完成
    if (!linkedService) {
      toast.success(`${module.name} 构建完成`)
      return
    }

    // 显示提示，让用户选择是否重启
    const serviceStatus = linkedService.running ? '运行中' : '已停止'
    toast.success(
      (t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <strong>{module.name}</strong> 构建完成！
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            关联服务 <strong>{linkedService.name}</strong> ({serviceStatus})
          </div>
          {linkedService.running && (
            <button
              onClick={() => {
                toast.dismiss(t.id)
                restartService(linkedService.id, linkedService.name)
              }}
              style={{
                padding: '6px 12px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🔄 重启服务
            </button>
          )}
          {!linkedService.running && (
            <button
              onClick={() => {
                toast.dismiss(t.id)
                startService(linkedService.id, linkedService.name)
              }}
              style={{
                padding: '6px 12px',
                background: '#52c41a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ▶️ 启动服务
            </button>
          )}
        </div>
      ),
      { duration: 10000 }
    )

    // 刷新服务状态
    scheduleRefresh('services', () => fetchServicesRef.current(), 500)
  }, [scheduleRefresh])

  // 处理批量构建完成
  const handleBatchBuildCompleted = useCallback((data) => {
    const { results, servicesToRestart, autoRestart } = data
    const successCount = results.filter(r => r.success).length
    const failedCount = results.filter(r => !r.success && !r.cancelled).length

    if (autoRestart) {
      toast.success(
        <div>
          批量构建完成：{successCount} 成功，{failedCount} 失败
          <br />
          <span style={{ fontSize: '12px', color: '#666' }}>
            正在自动重启关联服务...
          </span>
        </div>,
        { duration: 5000 }
      )
      return
    }

    if (servicesToRestart.length > 0) {
      toast.success(
        (t) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              批量构建完成：{successCount} 成功，{failedCount} 失败
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {servicesToRestart.length} 个关联服务待重启
            </div>
            <button
              onClick={() => {
                toast.dismiss(t.id)
                // 切换到服务管理页签，让用户手动重启
                window.dispatchEvent(new CustomEvent('switchTab', { detail: 'services' }))
              }}
              style={{
                padding: '6px 12px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              前往服务管理
            </button>
          </div>
        ),
        { duration: 10000 }
      )
    } else {
      toast.success(`批量构建完成：${successCount} 成功，${failedCount} 失败`)
    }

    scheduleRefresh('services', () => fetchServicesRef.current(), 500)
  }, [scheduleRefresh])

  const handleJobEvent = useCallback((channel, job) => {
    if (!job) return

    const isServiceJob = typeof job.type === 'string' && job.type.startsWith('service.')
    const isBuildJob = typeof job.type === 'string' && job.type.startsWith('frontend.build')
    const isPackageJob = job.type === 'package.run'
    const isTerminal = channel === 'job:completed' || channel === 'job:failed'

    if (isBuildJob) {
      const buildId = job.buildId || job.metadata?.buildId || job.result?.buildId || job.jobId
      if (channel === 'job:progress' && buildId) {
        updateBuildProgressRef.current(buildId, {
          jobId: job.jobId,
          buildId,
          status: job.status,
          overallProgress: job.progress,
          stepName: job.message,
          stage: job.stage,
          moduleId: job.targetId,
          module: job.metadata?.moduleName || job.metadata?.moduleId || job.targetId,
          error: job.error?.message || null
        })
      }

      if (isTerminal) {
        scheduleRefresh('activeBuilds', () => fetchActiveBuildsRef.current(), 300)
        scheduleRefresh('buildHistory', () => fetchBuildHistoryRef.current(), 300)
        scheduleRefresh('services', () => fetchServicesRef.current(), 500)
      }
    }

    if (isServiceJob) {
      if (channel === 'job:progress' && job.targetId) {
        const phaseMap = {
          infra_check: 'starting',
          prepare: 'starting',
          compile: 'starting',
          stop_old_process: job.type === 'service.stop' ? 'stopping' : 'restarting',
          start_new_process: job.type === 'service.start' ? 'starting' : 'restarting',
          health_check: 'checking_health',
          compensation_start: 'restarting',
          running_children: 'running_children'
        }
        updateServiceStatusRef.current(job.targetId, {
          phase: phaseMap[job.stage] || 'processing'
        })
      }

      if (isTerminal) {
        scheduleRefresh('services', () => fetchServicesRef.current(), 300)
      }
    }

    if (job.type === 'service.batch.start' || job.type === 'service.batch.stop' || job.type === 'service.batch.restart') {
      if (isTerminal) {
        scheduleRefresh('services', () => fetchServicesRef.current(), 300)
      }
    }

    if (isPackageJob) {
      updatePackageTaskRef.current(job)

      if (channel === 'job:completed') {
        toast.success('打包任务已完成')
        // 刷新打包选项以获取最新版本号
        scheduleRefresh('packageOptions', () => fetchPackageOptionsRef.current(), 500)
      }

      if (channel === 'job:failed') {
        toast.error(job.error?.message || '打包任务失败')
      }
    }
  }, [scheduleRefresh])

  const handlePackageEvent = useCallback((channel, payload) => {
    if (!payload) return

    const nextTask = {
      jobId: payload.jobId,
      status: payload.status || (channel === 'package:failed' ? 'failed' : channel === 'package:completed' ? 'success' : 'running'),
      message: payload.message,
      result: payload.result || null,
      error: payload.error || null,
      metadata: {
        services: payload.services,
        serviceImageVersions: payload.serviceImageVersions,
        parallelBuild: payload.parallelBuild,
        maxJobs: payload.maxJobs,
        heartbeatAt: payload.heartbeatAt
      }
    }

    updatePackageTaskRef.current(nextTask)

    // 打包完成后刷新 options 以获取最新版本号
    if (channel === 'package:completed') {
      scheduleRefresh('packageOptions', () => fetchPackageOptionsRef.current(), 500)
      // 刷新打包历史列表
      scheduleRefresh('packageHistory', () => fetchPackageHistoryRef.current({ page: 1, pageSize: 20 }), 500)
    }

    // 打包失败也刷新历史列表
    if (channel === 'package:failed') {
      scheduleRefresh('packageHistory', () => fetchPackageHistoryRef.current({ page: 1, pageSize: 20 }), 500)
    }
  }, [scheduleRefresh])

  // SSH 隧道事件处理
  const handleTunnelEvent = useCallback((data) => {
    if (!data) return
    const { event } = data
    if (event === 'connected') {
      if (data.reconnected) {
        toast.success('SSH 隧道已自动重连')
      }
      window.dispatchEvent(new CustomEvent('tunnelStatusChange', { detail: 'RUNNING' }))
    } else if (event === 'reconnecting') {
      toast.loading(`SSH 隧道已断开，正在重连 (${data.attempt}/${data.maxRetries})...`, {
        id: 'tunnel-reconnect',
        duration: Math.min(data.delay + 1000, 30000)
      })
      window.dispatchEvent(new CustomEvent('tunnelStatusChange', { detail: 'RECONNECTING' }))
    } else if (event === 'disconnected') {
      toast.dismiss('tunnel-reconnect')
      toast.error('SSH 隧道已断开，自动重连失败，请手动重连')
      window.dispatchEvent(new CustomEvent('tunnelStatusChange', { detail: 'STOPPED' }))
    }
  }, [])

  // 重启服务
  const restartService = async (serviceId, serviceName) => {
    try {
      const res = await fetch(`/api/services/${serviceId}/restart`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`${serviceName} 重启命令已发送`)
        updateServiceStatusRef.current(serviceId, { phase: 'restarting', running: false })
      } else {
        toast.error(extractError(data, '重启失败'))
      }
    } catch (error) {
      toast.error(`重启失败: ${error.message}`)
    }
  }

  // 启动服务
  const startService = async (serviceId, serviceName) => {
    try {
      const res = await fetch(`/api/services/${serviceId}/start`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(`${serviceName} 启动命令已发送`)
        updateServiceStatusRef.current(serviceId, { phase: 'starting', running: false })
      } else {
        toast.error(extractError(data, '启动失败'))
      }
    } catch (error) {
      toast.error(`启动失败: ${error.message}`)
    }
  }

  useEffect(() => {
    isUnmountedRef.current = false
    intentionalCloseRef.current = false

    const connect = () => {
      if (isConnectingRef.current) return
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      if (wsRef.current?.readyState === WebSocket.CONNECTING) return

      isConnectingRef.current = true

      const token = localStorage.getItem(LOCAL_TOKEN_KEY) || ''
      const wsUrl = `${WS_PROTOCOL}://${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`
      const socket = new WebSocket(wsUrl)
      wsRef.current = socket

      socket.onopen = () => {
        if (isUnmountedRef.current || intentionalCloseRef.current) {
          socket.close()
          return
        }

        isConnectingRef.current = false
        setConnected(true)
        reconnectCountRef.current = 0
        resetReconnect()

        socket.send(JSON.stringify({
          type: 'subscribe',
          channels: ['logs:service', 'logs:build', 'logs:package', 'build:progress', 'build:completed', 'build:batchCompleted', 'package:started', 'package:heartbeat', 'package:completed', 'package:failed', 'job:progress', 'job:completed', 'job:failed', 'infra:status', 'tunnel:status', '*']
        }))

        fetchServicesRef.current()
        fetchPackageActiveTaskRef.current()
        fetchInfraStatusRef.current()
        useLogStore.getState().loadCommandHistory()

        heartbeatTimerRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000)
      }

      socket.onmessage = (event) => {
        if (isUnmountedRef.current) return

        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'connected':
              setClientId(data.clientId)
              break
            case 'message':
              switch (data.channel) {
                case 'logs:service':
                  // 支持新的增强格式（包含 lines 数组）和旧格式
                  appendServiceLogRef.current(data.data.lines ? data.data : data.data.message)
                  break
                case 'logs:build':
                case 'logs:devserver':
                  // 支持新的增强格式（包含 lines 数组）和旧格式
                  // 开发服务器日志也显示在构建日志区域
                  appendBuildLogRef.current(data.data.lines ? data.data : data.data.message)
                  break
                case 'logs:package':
                  appendPackageLogRef.current(data.data.lines ? data.data : data.data.message)
                  break
                case 'build:progress':
                  updateBuildProgressRef.current(data.data.buildId, data.data)
                  if (data.data.status === 'success' || data.data.status === 'failed' || data.data.status === 'cancelled') {
                    scheduleRefresh('services', () => fetchServicesRef.current(), 1500)
                  }
                  break
                case 'service:status':
                  updateServiceStatusRef.current(data.data.serviceId, data.data)
                  break
                case 'build:completed':
                  handleBuildCompleted(data.data)
                  break
                case 'build:batchCompleted':
                  handleBatchBuildCompleted(data.data)
                  break
                case 'job:progress':
                case 'job:completed':
                case 'job:failed':
                  handleJobEvent(data.channel, data.data)
                  break
                case 'infra:status':
                  setInfraStatusRef.current(data.data)
                  break
                case 'tunnel:status':
                  handleTunnelEvent(data.data)
                  break
                case 'package:started':
                case 'package:heartbeat':
                case 'package:completed':
                case 'package:failed':
                  handlePackageEvent(data.channel, data.data)
                  break
                default:
                  break
              }
              break
            default:
              break
          }
        } catch (error) {
          // ignore malformed frames
        }
      }

      socket.onclose = (event) => {
        setConnected(false)
        isConnectingRef.current = false

        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current)
          heartbeatTimerRef.current = null
        }

        clearScheduledRefreshes()

        if (isUnmountedRef.current || intentionalCloseRef.current) return

        if (event.code === 1008 || event.reason === 'UNAUTHORIZED') {
          toast.error('WebSocket 访问令牌无效，请使用启动日志中的本地访问地址重新打开')
          return
        }

        if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectCountRef.current += 1
          incrementReconnect()
          reconnectTimerRef.current = setTimeout(() => {
            if (!isUnmountedRef.current && !intentionalCloseRef.current) {
              connect()
            }
          }, RECONNECT_DELAY)
        }
      }

      socket.onerror = () => {
        isConnectingRef.current = false
      }
    }

    const disconnect = () => {
      isUnmountedRef.current = true
      intentionalCloseRef.current = true

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current)
        heartbeatTimerRef.current = null
      }
      clearScheduledRefreshes()
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.close()
        wsRef.current = null
      }
      isConnectingRef.current = false
    }

    const timer = setTimeout(connect, 100)

    return () => {
      clearTimeout(timer)
      disconnect()
    }
  }, [setConnected, setClientId, incrementReconnect, resetReconnect, clearScheduledRefreshes, handleBatchBuildCompleted, handleBuildCompleted, handleJobEvent, handlePackageEvent, scheduleRefresh])

  const { connected, clientId, reconnectAttempts } = useWebSocketStore()

  return { connected, clientId, reconnectAttempts }
}
