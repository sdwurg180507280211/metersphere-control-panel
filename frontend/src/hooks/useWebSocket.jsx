import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { useWebSocketStore } from '../store/useAppStore'
import { useWebSocketEvents } from './useWebSocketEvents'
import { createReconnectingSocket } from '../utils/reconnectingSocket'

const CHANNELS = ['logs:service', 'logs:build', 'logs:package', 'build:progress',
  'build:completed', 'build:batchCompleted', 'package:started', 'package:heartbeat',
  'package:cancelling', 'package:completed', 'package:failed', 'package:cancelled',
  'job:progress', 'job:completed', 'job:failed', 'infra:status', 'tunnel:status', 'service:status']

export function useWebSocket() {
  const scheduledRefreshesRef = useRef({})
  const clientRef = useRef(null)
  const { connected, clientId, reconnectAttempts, setConnected, setClientId, resetReconnect } = useWebSocketStore()
  const clearScheduledRefreshes = useCallback(() => {
    Object.values(scheduledRefreshesRef.current).forEach(({ timerId }) => clearTimeout(timerId))
    scheduledRefreshesRef.current = {}
  }, [])
  const scheduleRefresh = useCallback((key, callback, delay = 0) => {
    const existing = scheduledRefreshesRef.current[key]
    const runAt = Date.now() + delay
    if (existing && existing.runAt <= runAt) return
    if (existing) clearTimeout(existing.timerId)
    const timerId = setTimeout(() => {
      delete scheduledRefreshesRef.current[key]
      Promise.resolve().then(callback).catch(() => {})
    }, delay)
    scheduledRefreshesRef.current[key] = { timerId, runAt }
  }, [])
  const { handleChannelMessage, handleConnected } = useWebSocketEvents(scheduleRefresh)
  useEffect(() => {
    const client = createReconnectingSocket({
      url: () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const url = new URL(`${protocol}//${window.location.host}/ws`)
        const token = localStorage.getItem('msLocalToken')
        if (token) url.searchParams.set('token', token)
        return url.toString()
      },
      onState: ({ connected: online, attempts, authFailed }) => {
        setConnected(online)
        useWebSocketStore.setState({ reconnectAttempts: attempts })
        if (online) resetReconnect()
        else { setClientId(null); clearScheduledRefreshes() }
        if (authFailed) toast.error('WebSocket 访问令牌无效，请重新打开本地访问地址', { id: 'ws-auth' })
      },
      onOpen: (socket) => {
        socket.send(JSON.stringify({ type: 'subscribe', channels: CHANNELS }))
        handleConnected()
      },
      onMessage: (event) => {
        let data
        try { data = JSON.parse(event.data) } catch { return }
        if (data.type === 'connected') setClientId(data.clientId)
        else if (data.type === 'message') handleChannelMessage(data.channel, data.data)
        else if (data.type === 'stream:gap') {
          toast('日志流曾积压，部分实时日志未显示；正在重新同步状态', { id: 'ws-gap' })
          handleConnected()
        }
      }
    })
    clientRef.current = client
    const reconnect = () => client.reconnect()
    const onVisible = () => { if (document.visibilityState === 'visible' && !useWebSocketStore.getState().connected) reconnect() }
    window.addEventListener('online', reconnect)
    window.addEventListener('ms:reconnect', reconnect)
    document.addEventListener('visibilitychange', onVisible)
    client.start()
    return () => {
      window.removeEventListener('online', reconnect)
      window.removeEventListener('ms:reconnect', reconnect)
      document.removeEventListener('visibilitychange', onVisible)
      client.stop()
      clientRef.current = null
      clearScheduledRefreshes()
    }
  }, [clearScheduledRefreshes, handleChannelMessage, handleConnected, resetReconnect, setClientId, setConnected])
  const reconnect = useCallback(() => clientRef.current?.reconnect(), [])
  return { connected, clientId, reconnectAttempts, reconnect }
}
