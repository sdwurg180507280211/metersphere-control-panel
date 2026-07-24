import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { useWebSocketStore } from '../store/useAppStore'
import { useWebSocketEvents } from './useWebSocketEvents'

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws'
const LOCAL_TOKEN_KEY = 'msLocalToken'
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY = 3000
const HEARTBEAT_INTERVAL = 30000
const SUBSCRIPTION_CHANNELS = [
  'logs:service',
  'logs:build',
  'logs:package',
  'build:progress',
  'build:completed',
  'build:batchCompleted',
  'package:started',
  'package:heartbeat',
  'package:completed',
  'package:failed',
  'job:progress',
  'job:completed',
  'job:failed',
  'infra:status',
  'tunnel:status',
  '*'
]

export function useWebSocket() {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const heartbeatTimerRef = useRef(null)
  const scheduledRefreshesRef = useRef({})
  const reconnectCountRef = useRef(0)
  const isConnectingRef = useRef(false)
  const isUnmountedRef = useRef(false)
  const intentionalCloseRef = useRef(false)

  const {
    connected,
    clientId,
    reconnectAttempts,
    setConnected,
    setClientId,
    incrementReconnect,
    resetReconnect
  } = useWebSocketStore()

  const clearScheduledRefreshes = useCallback(() => {
    Object.values(scheduledRefreshesRef.current).forEach(({ timerId }) => clearTimeout(timerId))
    scheduledRefreshesRef.current = {}
  }, [])

  const scheduleRefresh = useCallback((key, callback, delay = 0) => {
    const existing = scheduledRefreshesRef.current[key]
    const nextRunAt = Date.now() + delay

    if (existing) {
      if (existing.runAt <= nextRunAt) return
      clearTimeout(existing.timerId)
    }

    const timerId = setTimeout(() => {
      delete scheduledRefreshesRef.current[key]
      callback()
    }, delay)

    scheduledRefreshesRef.current[key] = { timerId, runAt: nextRunAt }
  }, [])

  const { handleChannelMessage, handleConnected } = useWebSocketEvents(scheduleRefresh)

  useEffect(() => {
    isUnmountedRef.current = false
    intentionalCloseRef.current = false

    const clearHeartbeat = () => {
      if (!heartbeatTimerRef.current) return
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }

    const connect = () => {
      if (isConnectingRef.current) return
      if ([WebSocket.OPEN, WebSocket.CONNECTING].includes(wsRef.current?.readyState)) return

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
        reconnectCountRef.current = 0
        setConnected(true)
        resetReconnect()

        socket.send(JSON.stringify({
          type: 'subscribe',
          channels: SUBSCRIPTION_CHANNELS
        }))
        handleConnected()

        clearHeartbeat()
        heartbeatTimerRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }))
          }
        }, HEARTBEAT_INTERVAL)
      }

      socket.onmessage = (event) => {
        if (isUnmountedRef.current) return

        try {
          const data = JSON.parse(event.data)
          if (data.type === 'connected') {
            setClientId(data.clientId)
          } else if (data.type === 'message') {
            handleChannelMessage(data.channel, data.data)
          }
        } catch {
          // Ignore malformed frames from incompatible or interrupted senders.
        }
      }

      socket.onclose = (event) => {
        setConnected(false)
        isConnectingRef.current = false
        clearHeartbeat()
        clearScheduledRefreshes()

        if (isUnmountedRef.current || intentionalCloseRef.current) return
        if (event.code === 1008 || event.reason === 'UNAUTHORIZED') {
          toast.error('WebSocket 访问令牌无效，请使用启动日志中的本地访问地址重新打开')
          return
        }

        if (reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) return
        reconnectCountRef.current += 1
        incrementReconnect()
        reconnectTimerRef.current = setTimeout(() => {
          if (!isUnmountedRef.current && !intentionalCloseRef.current) connect()
        }, RECONNECT_DELAY)
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
      clearHeartbeat()
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
  }, [
    clearScheduledRefreshes,
    handleChannelMessage,
    handleConnected,
    incrementReconnect,
    resetReconnect,
    setClientId,
    setConnected
  ])

  return { connected, clientId, reconnectAttempts }
}
