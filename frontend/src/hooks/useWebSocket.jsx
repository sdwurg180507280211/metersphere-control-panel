import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useWebSocketStore, useLogStore, useBuildStore, useServiceStore } from '../store/useAppStore'

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL = `${WS_PROTOCOL}://${window.location.host}/ws`
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY = 3000

export function useWebSocket() {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const heartbeatTimerRef = useRef(null)
  const reconnectCountRef = useRef(0)
  const isConnectingRef = useRef(false)
  const isUnmountedRef = useRef(false)
  const intentionalCloseRef = useRef(false)

  const appendServiceLogRef = useRef(useLogStore.getState().appendServiceLog)
  const appendBuildLogRef = useRef(useLogStore.getState().appendBuildLog)
  const updateBuildProgressRef = useRef(useBuildStore.getState().updateBuildProgress)
  const updateServiceStatusRef = useRef(useServiceStore.getState().updateServiceStatus)
  const fetchServicesRef = useRef(useServiceStore.getState().fetchServices)

  const {
    setConnected,
    setClientId,
    incrementReconnect,
    resetReconnect
  } = useWebSocketStore()

  // 处理单个模块构建完成
  const handleBuildCompleted = useCallback((data) => {
    const { module, linkedService, autoRestart } = data

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
    setTimeout(() => fetchServicesRef.current(), 500)
  }, [])

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

    setTimeout(() => fetchServicesRef.current(), 500)
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
        toast.error(data.error || '重启失败')
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
        toast.error(data.error || '启动失败')
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

      const socket = new WebSocket(WS_URL)
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
          channels: ['logs:service', 'logs:build', 'build:progress', 'build:completed', 'build:batchCompleted', '*']
        }))

        fetchServicesRef.current()

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
                  // 支持新的增强格式（包含 lines 数组）和旧格式
                  appendBuildLogRef.current(data.data.lines ? data.data : data.data.message)
                  break
                case 'build:progress':
                  updateBuildProgressRef.current(data.data.buildId, data.data)
                  if (data.data.status === 'success' || data.data.status === 'failed' || data.data.status === 'cancelled') {
                    setTimeout(() => fetchServicesRef.current(), 1500)
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

      socket.onclose = () => {
        setConnected(false)
        isConnectingRef.current = false

        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current)
          heartbeatTimerRef.current = null
        }

        if (isUnmountedRef.current || intentionalCloseRef.current) return

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
  }, [setConnected, setClientId, incrementReconnect, resetReconnect])

  const { connected, clientId, reconnectAttempts } = useWebSocketStore()

  return { connected, clientId, reconnectAttempts }
}
