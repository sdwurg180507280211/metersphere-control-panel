import { create } from 'zustand'

const MAX_LOG_LINES = 1000
const inFlightRequests = new Map()

function runInFlightRequest(key, runner) {
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key)
  }

  const request = Promise.resolve()
    .then(runner)
    .finally(() => {
      if (inFlightRequests.get(key) === request) {
        inFlightRequests.delete(key)
      }
    })

  inFlightRequests.set(key, request)
  return request
}

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

  fetchCatalog: async () => runInFlightRequest('services:catalog', async () => {
    try {
      const res = await fetch('/api/services/catalog')
      const data = await res.json()
      if (data.success) {
        set({ catalog: data.data })
      }
    } catch (error) {
      console.error('获取服务目录失败:', error)
    }
  }),

  fetchServices: async () => runInFlightRequest('services:status', async () => {
    try {
      const res = await fetch('/api/services/status')
      const data = await res.json()
      if (data.success) {
        set({ services: normalizeServiceStatuses(data.data) })
      }
    } catch (error) {
      console.error('获取服务状态失败:', error)
    }
  })
}))

export const useLogStore = create((set, get) => ({
  serviceLogLines: [],
  buildLogLines: [],
  packageLogLines: [],
  logTails: {
    service: '',
    build: '',
    package: ''
  },
  filters: {
    service: { logLevel: 'all', searchTerm: '' },
    build: { logLevel: 'all', searchTerm: '' },
    package: { logLevel: 'all', searchTerm: '' }
  },
  nativeServiceLogs: {
    serviceId: '',
    file: 'info.log',
    lines: [],
    meta: null,
    loading: false,
    error: ''
  },

  appendServiceLog: (message) => set((state) => appendLogChunk(state, 'service', message)),
  appendBuildLog: (message) => set((state) => appendLogChunk(state, 'build', message)),
  appendPackageLog: (message) => set((state) => appendLogChunk(state, 'package', message)),

  loadCommandHistory: async () => {
    try {
      const res = await fetch('/api/logs/commands')
      const data = await res.json()
      if (data.success && data.data?.length > 0) {
        const cmdLines = data.data.map(line => ({
          text: line,
          level: 'cmd',
          isStackTrace: false,
          isEmpty: false
        }))
        set((state) => {
          // 将历史命令合并到各日志类型中（去重）
          const mergeCmdHistory = (existingLines) => {
            const existingCmdTexts = new Set(
              existingLines.filter(l => typeof l === 'object' && l.level === 'cmd').map(l => l.text)
            )
            const newCmds = cmdLines.filter(l => !existingCmdTexts.has(l.text))
            if (newCmds.length === 0) return existingLines
            // 将历史命令按时间顺序插入（历史在前，实时在后）
            return [...newCmds, ...existingLines]
          }
          return {
            serviceLogLines: mergeCmdHistory(state.serviceLogLines),
            buildLogLines: mergeCmdHistory(state.buildLogLines),
            packageLogLines: mergeCmdHistory(state.packageLogLines)
          }
        })
      }
    } catch (e) {
      console.error('加载命令历史失败:', e)
    }
  },

  clearServiceLogs: () => set((state) => ({
    serviceLogLines: [],
    logTails: { ...state.logTails, service: '' }
  })),
  clearNativeServiceLogs: () => set((state) => ({
    nativeServiceLogs: {
      ...state.nativeServiceLogs,
      lines: [],
      meta: null,
      error: ''
    }
  })),
  clearBuildLogs: () => set((state) => ({
    buildLogLines: [],
    logTails: { ...state.logTails, build: '' }
  })),
  clearPackageLogs: () => set((state) => ({
    packageLogLines: [],
    logTails: { ...state.logTails, package: '' }
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

  loadNativeServiceLogs: async ({ serviceId, file = 'info.log', lines = 500 }) => {
    if (!serviceId) return null
    set((state) => ({
      nativeServiceLogs: {
        ...state.nativeServiceLogs,
        serviceId,
        file,
        loading: true,
        error: ''
      }
    }))

    try {
      const params = new URLSearchParams({ serviceId, file, lines: String(lines) })
      const res = await fetch(`/api/logs/native/service?${params.toString()}`)
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error?.message || data.error || '读取 MeterSphere 原生日志失败')
      }

      const logLines = (data.data || []).map((text) => ({
        text,
        level: detectLogLevel(text),
        isStackTrace: /^\s*(at\s+\w+\.|Caused by:|\w+Exception:|\w+Error:)/i.test(text),
        isEmpty: !text || !text.trim()
      }))
      set({
        nativeServiceLogs: {
          serviceId,
          file,
          lines: logLines,
          meta: data.meta || null,
          loading: false,
          error: ''
        }
      })
      return data
    } catch (error) {
      set((state) => ({
        nativeServiceLogs: {
          ...state.nativeServiceLogs,
          loading: false,
          error: error.message || '读取 MeterSphere 原生日志失败'
        }
      }))
      throw error
    }
  },

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

  fetchModules: async () => runInFlightRequest('build:modules', async () => {
    try {
      const res = await fetch('/api/build/modules')
      const data = await res.json()
      if (data.success) {
        set({ modules: data.data })
      }
    } catch (error) {
      console.error('获取模块目录失败:', error)
    }
  }),

  fetchActiveBuilds: async () => runInFlightRequest('build:active', async () => {
    try {
      const res = await fetch('/api/progress/active')
      const data = await res.json()
      if (data.success) {
        set({ activeBuilds: data.data })
      }
    } catch (error) {
      console.error('获取构建任务失败:', error)
    }
  }),

  fetchBuildHistory: async (limit = 10) => runInFlightRequest(`build:history:${limit}`, async () => {
    try {
      const res = await fetch(`/api/progress/history/recent?limit=${limit}`)
      const data = await res.json()
      if (data.success) {
        set({ buildHistory: data.data })
      }
    } catch (error) {
      console.error('获取构建历史失败:', error)
    }
  }),

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

export const usePackageStore = create((set, get) => ({
  options: null,
  optionsLoading: false,
  currentTask: null,
  activeLoading: false,

  setOptions: (options) => set({ options }),
  updateCurrentTask: (task) => set((state) => ({
    currentTask: mergePackageTask(state.currentTask, task),
    activeLoading: false
  })),
  clearCurrentTask: () => set({ currentTask: null, activeLoading: false }),

  fetchOptions: async () => runInFlightRequest('package:options', async () => {
    set({ optionsLoading: true })
    try {
      const res = await fetch('/api/package/options')
      const data = await res.json()
      if (data.success) {
        set({ options: data.data })
      }
    } catch (error) {
      console.error('获取打包选项失败:', error)
    } finally {
      set({ optionsLoading: false })
    }
  }),

  fetchActiveTask: async () => runInFlightRequest('package:active', async () => {
    set({ activeLoading: true })
    try {
      const res = await fetch('/api/package/active')
      const data = await res.json()
      if (data.success) {
        set({ currentTask: normalizePackageTask(data.data), activeLoading: false })
        return data.data
      }
    } catch (error) {
      console.error('获取活动打包任务失败:', error)
    }

    set({ activeLoading: false })
    return null
  }),

  startPackage: async (payload) => {
    const res = await fetch('/api/package/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const data = await res.json()
    if (!data.success) {
      const error = data.error || { message: '启动打包任务失败' }
      throw new Error(error.message)
    }

    const nextTask = normalizePackageTask(data.data)
    set({ currentTask: nextTask })
    return nextTask
  },

  isRunning: () => ['pending', 'running'].includes(get().currentTask?.status)
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

export const useInfraStore = create((set) => ({
  status: {
    mysql: { name: 'MySQL', reachable: null, host: 'localhost', port: 3306, error: null },
    redis: { name: 'Redis', reachable: null, host: 'localhost', port: 6379, error: null },
    kafka: { name: 'Kafka', reachable: null, host: 'localhost', port: 9092, error: null },
    allReachable: null,
    checkedAt: null
  },

  setStatus: (status) => set({ status }),

  fetchInfraStatus: async () => {
    try {
      const res = await fetch('/api/services/infra/status')
      const data = await res.json()
      if (data.success) {
        set({ status: data.data })
      }
    } catch (error) {
      console.error('获取基础设施状态失败:', error)
    }
  }
}))

export const useConfigStore = create((set, get) => ({
  snapshot: null,
  draft: null,
  resolved: null,
  snapshotResolved: null,
  runtime: null,
  diagnostics: null,
  snapshotDiagnostics: null,
  validation: {
    valid: true,
    errors: [],
    warnings: []
  },
  snapshotValidation: {
    valid: true,
    errors: [],
    warnings: []
  },
  meta: null,
  applyImpact: {
    changedPaths: [],
    hotApply: [],
    requiresRestart: []
  },
  snapshotApplyImpact: {
    changedPaths: [],
    hotApply: [],
    requiresRestart: []
  },
  dirtyFields: [],
  loading: false,
  validating: false,
  saving: false,
  applying: false,
  diagnosticsLoading: false,
  scanning: false,
  nodeVersions: [],
  scanningNodeVersions: false,

  fetchConfig: async () => runInFlightRequest('config:fetch', async () => {
    set({ loading: true })
    try {
      const res = await fetch('/api/config')
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error?.message || '加载配置失败')
      }

      const configData = data.data;
      set({
        snapshot: cloneValue(configData.editable),
        draft: cloneValue(configData.editable),
        resolved: configData.resolved,
        snapshotResolved: cloneValue(configData.resolved),
        runtime: configData.runtime,
        diagnostics: configData.diagnostics,
        snapshotDiagnostics: cloneValue(configData.diagnostics),
        validation: configData.validation || { valid: true, errors: [], warnings: [] },
        snapshotValidation: cloneValue(configData.validation || { valid: true, errors: [], warnings: [] }),
        meta: configData.meta,
        applyImpact: configData.applyImpact || { changedPaths: [], hotApply: [], requiresRestart: [] },
        snapshotApplyImpact: cloneValue(configData.applyImpact || { changedPaths: [], hotApply: [], requiresRestart: [] }),
        dirtyFields: []
      })

      return configData
    } finally {
      set({ loading: false })
    }
  }),

  scanProject: async (projectRoot) => {
    set({ scanning: true })
    try {
      const res = await fetch('/api/config/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot })
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error?.message || '项目扫描失败')
      }

      // 扫描完成后，更新 draft 中的 services
      const nextDraft = cloneValue(get().draft || get().snapshot || {})
      nextDraft.services = data.data.services
      
      set({
        draft: nextDraft,
        dirtyFields: collectDirtyPaths(get().snapshot || {}, nextDraft)
      })

      return data.data
    } finally {
      set({ scanning: false })
    }
  },

  scanNodeVersions: async () => {
    set({ scanningNodeVersions: true })
    try {
      const res = await fetch('/api/config/node-versions')
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error?.message || '扫描 Node 版本失败')
      }
      set({ nodeVersions: data.data.versions || [] })
      return data.data
    } finally {
      set({ scanningNodeVersions: false })
    }
  },

  updateDraft: (fieldPath, value) => set((state) => {
    const currentDraft = cloneValue(state.draft || state.snapshot || {})
    setByPath(currentDraft, fieldPath, value)
    return {
      draft: currentDraft,
      dirtyFields: collectDirtyPaths(state.snapshot || {}, currentDraft)
    }
  }),

  addService: (serviceId) => set((state) => {
    const nextDraft = cloneValue(state.draft || state.snapshot || {})
    const services = nextDraft.services || {}
    const nextServiceId = serviceId || createServiceId(services)
    services[nextServiceId] = {
      name: '',
      pom: '',
      port: '',
      healthCheckPort: '',
      healthCheck: '/actuator/health',
      startOrder: 99,
      enabled: true
    }
    nextDraft.services = services

    return {
      draft: nextDraft,
      dirtyFields: collectDirtyPaths(state.snapshot || {}, nextDraft)
    }
  }),

  updateService: (serviceId, patch) => set((state) => {
    const nextDraft = cloneValue(state.draft || state.snapshot || {})
    nextDraft.services = nextDraft.services || {}
    nextDraft.services[serviceId] = {
      ...(nextDraft.services[serviceId] || {}),
      ...patch
    }

    return {
      draft: nextDraft,
      dirtyFields: collectDirtyPaths(state.snapshot || {}, nextDraft)
    }
  }),

  removeService: (serviceId) => set((state) => {
    const nextDraft = cloneValue(state.draft || state.snapshot || {})
    if (nextDraft.services) {
      delete nextDraft.services[serviceId]
    }
    return {
      draft: nextDraft,
      dirtyFields: collectDirtyPaths(state.snapshot || {}, nextDraft)
    }
  }),

  validateDraft: async () => {
    const draft = get().draft || get().snapshot || {}
    set({ validating: true })
    try {
      const res = await fetch('/api/config/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft })
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error?.message || '校验配置失败')
      }

      set({
        draft: cloneValue(data.data.normalizedDraft || draft),
        resolved: cloneValue(data.data.resolved || get().resolved),
        diagnostics: data.data.diagnostics,
        validation: {
          valid: data.data.valid,
          errors: data.data.errors || [],
          warnings: data.data.warnings || []
        },
        applyImpact: data.data.applyImpact || { changedPaths: [], hotApply: [], requiresRestart: [] },
        dirtyFields: collectDirtyPaths(get().snapshot || {}, data.data.normalizedDraft || draft)
      })

      return data.data
    } finally {
      set({ validating: false })
    }
  },

  saveConfig: async () => {
    const draft = get().draft || get().snapshot || {}
    set({ saving: true })
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft })
      })
      const data = await res.json()
      if (!data.success) {
        const error = new Error(data.error?.message || '保存配置失败')
        error.details = data.error?.details || {}
        throw error
      }

      set({
        snapshot: cloneValue(data.data.editable),
        draft: cloneValue(data.data.editable),
        resolved: data.data.resolved,
        snapshotResolved: cloneValue(data.data.resolved),
        runtime: data.data.runtime,
        diagnostics: data.data.diagnostics,
        snapshotDiagnostics: cloneValue(data.data.diagnostics),
        validation: data.data.validation || { valid: true, errors: [], warnings: [] },
        snapshotValidation: cloneValue(data.data.validation || { valid: true, errors: [], warnings: [] }),
        meta: data.data.meta,
        applyImpact: data.data.applyImpact || { changedPaths: [], hotApply: [], requiresRestart: [] },
        snapshotApplyImpact: cloneValue(data.data.applyImpact || { changedPaths: [], hotApply: [], requiresRestart: [] }),
        dirtyFields: []
      })

      return data.data
    } catch (error) {
      if (error.details) {
        set({
          resolved: cloneValue(error.details.resolved || get().resolved),
          diagnostics: error.details.diagnostics || get().diagnostics,
          validation: {
            valid: false,
            errors: error.details.errors || [],
            warnings: error.details.warnings || []
          },
          applyImpact: error.details.applyImpact || get().applyImpact
        })
      }
      throw error
    } finally {
      set({ saving: false })
    }
  },

  applyConfig: async () => {
    set({ applying: true })
    try {
      const res = await fetch('/api/config/apply', {
        method: 'POST'
      })
      const data = await res.json()
      if (!data.success) {
        const error = new Error(data.error?.message || '应用配置失败')
        error.details = data.error?.details || {}
        throw error
      }

      set((state) => ({
        meta: {
          ...(state.meta || {}),
          ...(data.data.meta || {})
        },
        applyImpact: {
          ...state.applyImpact,
          requiresRestart: data.data.requiresRestart || []
        }
      }))

      return data.data
    } finally {
      set({ applying: false })
    }
  },

  resetDraft: () => set((state) => ({
    draft: cloneValue(state.snapshot),
    resolved: cloneValue(state.snapshotResolved),
    diagnostics: cloneValue(state.snapshotDiagnostics),
    validation: cloneValue(state.snapshotValidation || { valid: true, errors: [], warnings: [] }),
    applyImpact: cloneValue(state.snapshotApplyImpact || { changedPaths: [], hotApply: [], requiresRestart: [] }),
    dirtyFields: []
  })),

  refreshDiagnostics: async () => runInFlightRequest('config:diagnostics', async () => {
    set({ diagnosticsLoading: true })
    try {
      const res = await fetch('/api/config/diagnostics')
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error?.message || '刷新诊断失败')
      }

      set((state) => ({
        resolved: cloneValue(data.data.resolved || state.resolved),
        diagnostics: data.data.diagnostics,
        validation: data.data.validation || state.validation,
        applyImpact: data.data.applyImpact || state.applyImpact,
        meta: {
          ...(state.meta || {}),
          ...(data.data.meta || {})
        }
      }))

      return data.data
    } finally {
      set({ diagnosticsLoading: false })
    }
  })
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
  if (text.match(/^\[?\d{2}:\d{2}:\d{2}\]?\s*\$\s/) || text.startsWith('$ ') || text.startsWith('▶ ')) return 'cmd'
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
  if (type === 'build') {
    return 'buildLogLines'
  }

  if (type === 'package') {
    return 'packageLogLines'
  }

  return 'serviceLogLines'
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

function normalizePackageTask(task) {
  if (!task) {
    return null
  }

  const metadata = {
    ...(task.metadata || {}),
    services: task.metadata?.services || task.services || [],
    serviceImageVersions: task.metadata?.serviceImageVersions || task.serviceImageVersions || {},
    parallelBuild: task.metadata?.parallelBuild ?? task.parallelBuild ?? false,
    maxJobs: task.metadata?.maxJobs ?? task.maxJobs ?? null,
    buildOnly: task.metadata?.buildOnly ?? task.buildOnly ?? false,
    packagePath: task.metadata?.packagePath || task.packagePath || null,
    scriptPath: task.metadata?.scriptPath || task.scriptPath || null
  }

  return {
    ...task,
    jobId: task.jobId || null,
    type: task.type || 'package.run',
    status: task.status || 'running',
    stage: task.stage || 'running',
    message: task.message || '打包任务已启动',
    metadata,
    result: task.result || null,
    error: task.error || null
  }
}

function mergePackageTask(previousTask, incomingTask) {
  const nextTask = normalizePackageTask(incomingTask)
  if (!nextTask) {
    return previousTask
  }

  if (!previousTask || previousTask.jobId !== nextTask.jobId) {
    return nextTask
  }

  return {
    ...previousTask,
    ...nextTask,
    metadata: {
      ...(previousTask.metadata || {}),
      ...(nextTask.metadata || {})
    },
    result: nextTask.result || previousTask.result,
    error: nextTask.error || previousTask.error
  }
}

function cloneValue(value) {
  if (value === undefined || value === null) {
    return value
  }

  return JSON.parse(JSON.stringify(value))
}

function setByPath(target, fieldPath, value) {
  const segments = Array.isArray(fieldPath) ? fieldPath : String(fieldPath).split('.')
  let cursor = target

  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {}
    }
    cursor = cursor[key]
  }

  cursor[segments[segments.length - 1]] = value
}

function collectDirtyPaths(snapshot, draft, currentPath = '') {
  if (JSON.stringify(snapshot) === JSON.stringify(draft)) {
    return []
  }

  const snapshotIsObject = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
  const draftIsObject = draft && typeof draft === 'object' && !Array.isArray(draft)

  if (!snapshotIsObject || !draftIsObject) {
    return currentPath ? [currentPath] : []
  }

  const keys = new Set([...Object.keys(snapshot || {}), ...Object.keys(draft || {})])
  const dirty = []

  keys.forEach((key) => {
    dirty.push(...collectDirtyPaths(snapshot?.[key], draft?.[key], currentPath ? `${currentPath}.${key}` : key))
  })

  return [...new Set(dirty)]
}

function createServiceId(services = {}) {
  let index = Object.keys(services).length + 1
  let candidate = `custom-service-${index}`
  while (services[candidate]) {
    index += 1
    candidate = `custom-service-${index}`
  }
  return candidate
}
