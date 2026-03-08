import { create } from 'zustand'

const MAX_LOG_LINES = 1000

export const useServiceStore = create((set) => ({
  catalog: [],
  services: {},
  loading: {},

  setCatalog: (catalog) => set({ catalog }),
  setServices: (services) => set({ services: normalizeServiceStatuses(services) }),

  updateServiceStatus: (id, status) => set((state) => ({
    services: {
      ...state.services,
      [id]: normalizeServiceStatus(id, status, state.services[id])
    }
  })),

  setLoading: (id, isLoading) => set((state) => ({
    loading: { ...state.loading, [id]: isLoading }
  })),

  fetchCatalog: async () => {
    try {
      const res = await fetch('/api/services/catalog')
      const data = await res.json()
      if (data.success) {
        set({ catalog: data.data })
      }
    } catch (error) {
      console.error('获取服务目录失败:', error)
    }
  },

  fetchServices: async () => {
    try {
      const res = await fetch('/api/services/status')
      const data = await res.json()
      if (data.success) {
        set({ services: normalizeServiceStatuses(data.data) })
      }
    } catch (error) {
      console.error('获取服务状态失败:', error)
    }
  }
}))

export const useLogStore = create((set, get) => ({
  serviceLogLines: [],
  buildLogLines: [],
  logTails: {
    service: '',
    build: ''
  },
  filters: {
    service: { logLevel: 'all', searchTerm: '' },
    build: { logLevel: 'all', searchTerm: '' }
  },

  appendServiceLog: (message) => set((state) => appendLogChunk(state, 'service', message)),
  appendBuildLog: (message) => set((state) => appendLogChunk(state, 'build', message)),

  clearServiceLogs: () => set((state) => ({
    serviceLogLines: [],
    logTails: { ...state.logTails, service: '' }
  })),
  clearBuildLogs: () => set((state) => ({
    buildLogLines: [],
    logTails: { ...state.logTails, build: '' }
  })),

  setLogLevel: (type, level) => set((state) => ({
    filters: {
      ...state.filters,
      [type]: { ...state.filters[type], logLevel: level }
    }
  })),

  setSearchTerm: (type, term) => set((state) => ({
    filters: {
      ...state.filters,
      [type]: { ...state.filters[type], searchTerm: term }
    }
  })),

  getLogLines: (type) => getLogLinesForType(get(), type),

  getFilteredLogs: (type) => {
    const filters = get().filters[type]
    const lines = getLogLinesForType(get(), type)
    return filterLogLines(lines, filters.logLevel, filters.searchTerm)
  }
}))

export const useBuildStore = create((set, get) => ({
  modules: [],
  activeBuilds: [],
  buildHistory: [],
  currentBuild: null,
  buildProgress: 0,
  dismissedBuildIds: [],

  setModules: (modules) => set({ modules }),
  setActiveBuilds: (builds) => set((state) => ({
    activeBuilds: builds.filter((build) => !state.dismissedBuildIds.includes(build.id))
  })),
  setBuildHistory: (history) => set({ buildHistory: history }),

  addActiveBuild: (build) => set((state) => {
    const dismissedBuildIds = state.dismissedBuildIds.filter((id) => id !== build.id)
    const exists = state.activeBuilds.some((item) => item.id === build.id)

    return exists
      ? { dismissedBuildIds }
      : {
          activeBuilds: [...state.activeBuilds, build],
          dismissedBuildIds
        }
  }),

  updateBuildProgress: (buildId, progress) => set((state) => {
    if (state.dismissedBuildIds.includes(buildId)) {
      return state
    }

    const exists = state.activeBuilds.some((item) => item.id === buildId)
    const nextBuilds = exists
      ? state.activeBuilds.map((item) => (item.id === buildId ? { ...item, ...progress } : item))
      : [...state.activeBuilds, { id: buildId, ...progress }]

    return {
      activeBuilds: nextBuilds,
      currentBuild: state.currentBuild?.id === buildId
        ? { ...state.currentBuild, ...progress }
        : state.currentBuild
    }
  }),

  removeActiveBuild: (buildId) => set((state) => ({
    activeBuilds: state.activeBuilds.filter((item) => item.id !== buildId),
    dismissedBuildIds: state.dismissedBuildIds.includes(buildId)
      ? state.dismissedBuildIds
      : [...state.dismissedBuildIds, buildId]
  })),

  setCurrentBuild: (build) => set({ currentBuild: build }),

  fetchModules: async () => {
    try {
      const res = await fetch('/api/build/modules')
      const data = await res.json()
      if (data.success) {
        set({ modules: data.data })
      }
    } catch (error) {
      console.error('获取模块目录失败:', error)
    }
  },

  fetchActiveBuilds: async () => {
    try {
      const res = await fetch('/api/progress/active')
      const data = await res.json()
      if (data.success) {
        set((state) => ({
          activeBuilds: data.data.filter((build) => !state.dismissedBuildIds.includes(build.id))
        }))
      }
    } catch (error) {
      console.error('获取构建任务失败:', error)
    }
  },

  fetchBuildHistory: async (limit = 10) => {
    try {
      const res = await fetch(`/api/progress/history/recent?limit=${limit}`)
      const data = await res.json()
      if (data.success) {
        set({ buildHistory: data.data })
      }
    } catch (error) {
      console.error('获取构建历史失败:', error)
    }
  },

  cancelBuild: async (buildId) => {
    try {
      const res = await fetch(`/api/progress/${buildId}/cancel`, { method: 'POST' })
      const data = await res.json()
      return data.success
    } catch (error) {
      console.error('取消构建失败:', error)
      return false
    }
  }
}))

export const useWebSocketStore = create((set) => ({
  connected: false,
  clientId: null,
  reconnectAttempts: 0,

  setConnected: (connected) => set({ connected }),
  setClientId: (clientId) => set({ clientId }),
  incrementReconnect: () => set((state) => ({
    reconnectAttempts: state.reconnectAttempts + 1
  })),
  resetReconnect: () => set({ reconnectAttempts: 0 })
}))

function appendLogChunk(state, type, logData) {
  const linesKey = getLinesKey(type)
  const existingLines = state[linesKey]
  
  // 解析新的日志数据格式
  const parsed = parseLogData(logData)
  
  let newLines
  if (parsed.lines) {
    // 使用后端解析好的带级别信息的行
    newLines = parsed.lines
  } else {
    // 回退到字符串处理（旧格式兼容）
    const previousTail = state.logTails[type] || ''
    const { lines, tail } = splitLogChunk(parsed.message, previousTail)
    newLines = lines.map(text => ({
      text,
      level: detectLogLevel(text),
      isStackTrace: false,
      isEmpty: !text || text.trim() === ''
    }))
    
    // 更新 tail（只有旧格式需要）
    if (tail) {
      return {
        [linesKey]: limitLogLines(existingLines, newLines),
        logTails: {
          ...state.logTails,
          [type]: tail
        }
      }
    }
  }
  
  const nextLines = limitLogLines(existingLines, newLines)

  return {
    [linesKey]: nextLines,
    logTails: {
      ...state.logTails,
      [type]: ''
    }
  }
}

// 从文本检测日志级别（前端回退处理）
function detectLogLevel(text) {
  if (!text) return 'info'
  const upper = text.toUpperCase()
  if (upper.includes('ERROR')) return 'error'
  if (upper.includes('WARN')) return 'warn'
  if (upper.includes('INFO')) return 'info'
  if (upper.includes('DEBUG')) return 'debug'
  if (upper.includes('TRACE')) return 'trace'
  return 'info'
}

function splitLogChunk(message = '', previousTail = '') {
  const normalized = String(message)
  if (!normalized) {
    return { lines: [], tail: previousTail }
  }

  const fragments = normalized.split('\n')
  fragments[0] = `${previousTail}${fragments[0]}`

  if (normalized.endsWith('\n')) {
    return {
      lines: fragments,
      tail: ''
    }
  }

  return {
    lines: fragments.slice(0, -1),
    tail: fragments[fragments.length - 1]
  }
}

function limitLogLines(existingLines, newLines, maxLines = MAX_LOG_LINES) {
  if (!newLines.length) {
    return existingLines
  }

  const mergedLines = [...existingLines, ...newLines]
  if (mergedLines.length <= maxLines) {
    return mergedLines
  }

  return mergedLines.slice(-maxLines)
}

function getLinesKey(type) {
  return type === 'build' ? 'buildLogLines' : 'serviceLogLines'
}

function getLogLinesForType(state, type) {
  const lines = state[getLinesKey(type)] || []
  const tail = state.logTails[type] || ''
  return tail ? [...lines, tail] : lines
}

// 日志级别优先级（用于过滤）
const LOG_LEVEL_PRIORITY = {
  'error': 0,
  'warn': 1,
  'info': 2,
  'debug': 3,
  'trace': 4
}

function parseLogData(logData) {
  // 支持新的增强格式和旧格式
  if (typeof logData === 'string') {
    // 旧格式：纯字符串
    return { message: logData, lines: null }
  }
  
  if (logData && typeof logData === 'object') {
    // 新格式：{ message, type, timestamp, lines }
    if (logData.lines && Array.isArray(logData.lines)) {
      return { 
        message: logData.message, 
        lines: logData.lines.map(item => ({
          text: item.text || item,
          level: item.level || 'info',
          isStackTrace: item.isStackTrace || false,
          isEmpty: item.isEmpty || false
        }))
      }
    }
    return { message: logData.message || String(logData), lines: null }
  }
  
  return { message: String(logData), lines: null }
}

function filterLogLines(lines, level, searchTerm) {
  let nextLines = lines

  // 处理带级别信息的日志行对象
  if (level !== 'all') {
    const targetPriority = LOG_LEVEL_PRIORITY[level]
    nextLines = nextLines.filter((line) => {
      // 如果是对象格式（新格式）
      if (typeof line === 'object' && line.level) {
        const linePriority = LOG_LEVEL_PRIORITY[line.level] ?? 2
        return linePriority <= targetPriority
      }
      // 如果是字符串格式（旧格式），回退到字符串匹配
      const lineStr = String(line)
      if (level === 'error') return lineStr.includes('ERROR') || lineStr.includes('✗') || lineStr.includes('失败')
      if (level === 'warn') return lineStr.includes('WARN') || lineStr.includes('warning')
      if (level === 'info') return !lineStr.includes('ERROR') && !lineStr.includes('WARN')
      return true
    })
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    nextLines = nextLines.filter((line) => {
      const text = typeof line === 'object' ? line.text : String(line)
      return text.toLowerCase().includes(term)
    })
  }

  return nextLines
}


function normalizeServiceStatuses(services = {}) {
  return Object.fromEntries(
    Object.entries(services).map(([serviceId, status]) => [serviceId, normalizeServiceStatus(serviceId, status)])
  )
}

function normalizeServiceStatus(serviceId, status, previous = null) {
  if (typeof status === 'boolean') {
    return {
      serviceId,
      phase: status ? 'running' : 'stopped',
      running: status,
      pid: previous?.pid || null,
      error: null,
      updatedAt: previous?.updatedAt || new Date().toISOString()
    }
  }

  if (!status || typeof status !== 'object') {
    return previous || {
      serviceId,
      phase: 'stopped',
      running: false,
      pid: null,
      error: null,
      updatedAt: new Date().toISOString()
    }
  }

  return {
    serviceId,
    phase: status.phase || (status.running ? 'running' : 'stopped'),
    running: Boolean(status.running),
    pid: status.pid ?? previous?.pid ?? null,
    error: status.error ?? null,
    updatedAt: status.updatedAt || new Date().toISOString(),
    name: status.name || previous?.name || serviceId
  }
}

