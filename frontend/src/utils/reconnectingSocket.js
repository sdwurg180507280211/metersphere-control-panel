// No React state is owned here. Each generation owns its timers and callbacks.
export function createReconnectingSocket({
  url, onOpen = () => {}, onMessage = () => {}, onState = () => {},
  WebSocketClass = WebSocket, timers = globalThis, random = Math.random
}) {
  let socket = null
  let reconnectTimer = null
  let heartbeatTimer = null
  let deadlineTimer = null
  let attempts = 0
  let generation = 0
  let stopped = true
  let lastMessage = 0
  let authFailed = false
  const clearTimers = () => {
    timers.clearTimeout(reconnectTimer)
    timers.clearTimeout(deadlineTimer)
    timers.clearInterval(heartbeatTimer)
    reconnectTimer = heartbeatTimer = deadlineTimer = null
  }
  function schedule() {
    if (stopped || authFailed) return
    attempts += 1
    onState({ connected: false, attempts, authFailed: false })
    const base = Math.min(60000, 1000 * 2 ** Math.min(attempts - 1, 6))
    reconnectTimer = timers.setTimeout(connect, Math.round(base * (0.8 + random() * 0.4)))
  }
  function connect() {
    if (stopped || authFailed) return
    clearTimers()
    const currentGeneration = ++generation
    let current
    try { current = new WebSocketClass(url()) } catch { schedule(); return }
    socket = current
    const owns = () => !stopped && generation === currentGeneration && socket === current
    deadlineTimer = timers.setTimeout(() => {
      if (!owns()) return
      // Closing a CONNECTING browser socket is allowed and triggers onclose.
      generation += 1
      current.onclose = current.onerror = current.onopen = current.onmessage = null
      socket = null
      try { current.close() } catch {}
      schedule()
    }, 10000)
    current.onopen = () => {
      if (!owns()) { current.close(); return }
      timers.clearTimeout(deadlineTimer)
      attempts = 0
      lastMessage = Date.now()
      onState({ connected: true, attempts: 0, authFailed: false })
      onOpen(current)
      heartbeatTimer = timers.setInterval(() => {
        if (!owns()) return
        if (Date.now() - lastMessage > 90000) { reconnect(); return }
        if (current.readyState === 1) current.send(JSON.stringify({ type: 'ping' }))
      }, 30000)
    }
    current.onmessage = (event) => {
      if (!owns()) return
      lastMessage = Date.now()
      onMessage(event, current)
    }
    current.onclose = (event) => {
      if (!owns()) return
      clearTimers()
      socket = null
      authFailed = event.code === 1008 && event.reason === 'UNAUTHORIZED'
      onState({ connected: false, attempts, authFailed })
      schedule()
    }
    current.onerror = () => {} // onclose or the connect deadline owns recovery.
  }
  function disconnect() {
    stopped = true
    generation += 1
    clearTimers()
    const old = socket
    socket = null
    if (old) {
      old.onclose = old.onerror = old.onopen = old.onmessage = null
      try { old.close() } catch {}
    }
    onState({ connected: false, attempts, authFailed })
  }
  function reconnect() {
    disconnect()
    attempts = 0
    authFailed = false
    stopped = false
    connect()
  }
  return { start: reconnect, reconnect, stop: disconnect }
}
