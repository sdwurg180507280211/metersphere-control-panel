import { create } from 'zustand'

const MAX_LOG_LINES = 1000

export const useServiceStore = create((set) => ({
  catalog: [],
  services: {},
  loading: {},

  setCatalog: (catalog) => set({ catalog }),
  setServices: (services) => set({ services }),

  updateServiceStatus: (id, status) => set((state) => ({
    services: { ...state.services, [id]: status }
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
        set({ services: data.data })
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

  setModules: (modules) => set({ modules }),
  setActiveBuilds: (builds) => set({ activeBuilds: builds }),
  setBuildHistory: (history) => set({ buildHistory: history }),

  addActiveBuild: (build) => set((state) => {
    const exists = state.activeBuilds.some((item) => item.id === build.id)
    return exists
      ? state
      : { activeBuilds: [...state.activeBuilds, build] }
  }),

  updateBuildProgress: (buildId, progress) => set((state) => {
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
    activeBuilds: state.activeBuilds.filter((item) => item.id !== buildId)
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
        set({ activeBuilds: data.data })
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

function appendLogChunk(state, type, message) {
  const linesKey = getLinesKey(type)
  const existingLines = state[linesKey]
  const previousTail = state.logTails[type] || ''
  const { lines, tail } = splitLogChunk(message, previousTail)
  const nextLines = limitLogLines(existingLines, lines)

  return {
    [linesKey]: nextLines,
    logTails: {
      ...state.logTails,
      [type]: tail
    }
  }
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

function filterLogLines(lines, level, searchTerm) {
  let nextLines = lines

  if (level !== 'all') {
    nextLines = nextLines.filter((line) => {
      if (level === 'error') return line.includes('ERROR') || line.includes('✗') || line.includes('失败')
      if (level === 'warn') return line.includes('WARN') || line.includes('warning')
      if (level === 'info') return line.includes('INFO') || line.includes('[系统]')
      return true
    })
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    nextLines = nextLines.filter((line) => line.toLowerCase().includes(term))
  }

  return nextLines
}
