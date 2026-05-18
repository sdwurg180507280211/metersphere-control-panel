import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useLogStore } from '../store/useAppStore'
import EmptyState from './EmptyState'
import Tooltip from './Tooltip'
import './LogViewer.css'

const LOG_LINE_HEIGHT = 20
const LOG_OVERSCAN = 20
function createDefaultFilter() {
  return { logLevel: 'all', searchTerm: '' }
}
const NATIVE_LOG_FILE_LABELS = {
  'info.log': '信息日志',
  'warn.log': '警告日志',
  'error.log': '错误日志',
  'debug.log': '调试日志'
}

const LOG_VIEW_STATE_KEY = 'msLogViewState'

function loadLogViewState() {
  try {
    const raw = localStorage.getItem(LOG_VIEW_STATE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLogViewState(nextState) {
  try {
    localStorage.setItem(LOG_VIEW_STATE_KEY, JSON.stringify(nextState))
  } catch {
    // ignore persistence failures
  }
}

// 日志级别优先级（用于过滤）
const LOG_LEVEL_PRIORITY = {
  'error': 0,
  'warn': 1,
  'info': 2,
  'cmd': 3,
  'debug': 4,
  'trace': 5
}

// 本地过滤函数
function filterLogLines(lines, level, searchTerm) {
  let nextLines = lines

  // 处理带级别信息的日志行对象
  if (level !== 'all') {
    // CMD 级别只显示命令行，不按优先级累积
    if (level === 'cmd') {
      nextLines = nextLines.filter((line) => {
        if (typeof line === 'object' && line.level) return line.level === 'cmd'
        const lineStr = String(line)
        return lineStr.startsWith('$ ') || lineStr.startsWith('▶ ')
      })
    } else {
      const targetPriority = LOG_LEVEL_PRIORITY[level]
      nextLines = nextLines.filter((line) => {
        if (typeof line === 'object' && line.level) {
          const linePriority = LOG_LEVEL_PRIORITY[line.level] ?? 2
          return linePriority <= targetPriority
        }
        const lineStr = String(line)
        if (level === 'error') return lineStr.includes('ERROR') || lineStr.includes('✗') || lineStr.includes('失败')
        if (level === 'warn') return lineStr.includes('WARN') || lineStr.includes('warning')
        if (level === 'info') return !lineStr.includes('ERROR') && !lineStr.includes('WARN') && !lineStr.startsWith('$ ')
        return true
      })
    }
  }

  if (searchTerm) {
    const term = String(searchTerm).toLowerCase()
    nextLines = nextLines.filter((line) => {
      const text = typeof line === 'object' ? line.text : line
      return String(text ?? '').toLowerCase().includes(term)
    })
  }

  return nextLines
}

// 日志级别配置
const LOG_LEVEL_CONFIG = {
  error: { label: 'ERROR', color: '#ff4d4f', bgColor: '#fff1f0', borderColor: '#ffccc7' },
  warn: { label: 'WARN', color: '#faad14', bgColor: '#fffbe6', borderColor: '#ffe58f' },
  info: { label: 'INFO', color: '#52c41a', bgColor: 'transparent', borderColor: 'transparent' },
  cmd: { label: 'CMD', color: '#36cfc9', bgColor: '#e6fffb', borderColor: '#87e8de' },
  debug: { label: 'DEBUG', color: '#8c8c8c', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
  trace: { label: 'TRACE', color: '#bfbfbf', bgColor: 'transparent', borderColor: 'transparent' },
  separator: { label: '', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' },
  stacktrace: { label: '', color: '#ff4d4f', bgColor: 'transparent', borderColor: 'transparent' }
}

// 直接订阅日志状态
function useLogLines(type, source) {
  return useLogStore((state) => {
    if (type === 'service' && source === 'native') return state.nativeServiceLogs.lines
    if (type === 'service') return state.serviceLogLines
    if (type === 'build') return state.buildLogLines
    if (type === 'package') return state.packageLogLines
    return []
  })
}

function getNativeFileForLevel(level) {
  if (level === 'error') return 'error.log'
  if (level === 'warn') return 'warn.log'
  if (level === 'debug') return 'debug.log'
  return 'info.log'
}

function LogViewer({ type, searchInputRef, services = [] }) {
  const logRef = useRef(null)
  const searchInputRefLocal = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [viewportHeight, setViewportHeight] = useState(0)
  const scrollTopRef = useRef(0)
  const rafIdRef = useRef(null)
  const [, setRenderTick] = useState(0)
  const [expandedStackTraces, setExpandedStackTraces] = useState(new Set())
  const [copied, setCopied] = useState(false)
  const [copiedSelection, setCopiedSelection] = useState(false)
  const savedViewState = useMemo(() => loadLogViewState(), [])
  const [logSource, setLogSource] = useState(() => savedViewState.source || 'control')
  const [selectedServiceId, setSelectedServiceId] = useState(() => savedViewState.serviceId || services[0]?.id || 'api-test')
  const [sourceFilters, setSourceFilters] = useState(() => ({
    control: savedViewState.filters?.control || createDefaultFilter(),
    native: savedViewState.filters?.native || createDefaultFilter()
  }))

  const {
    filters,
    nativeServiceLogs,
    setLogLevel,
    setSearchTerm,
    clearServiceLogs,
    clearBuildLogs,
    clearPackageLogs,
    clearNativeServiceLogs,
    loadNativeServiceLogs
  } = useLogStore()

  const storeFilters = filters[type] || createDefaultFilter()
  const currentSource = type === 'service' ? logSource : 'control'
  const isNativeSource = type === 'service' && currentSource === 'native'
  const activeFilter = type === 'service' ? sourceFilters[currentSource] || createDefaultFilter() : storeFilters
  const logLevel = activeFilter.logLevel || 'all'
  const searchTerm = activeFilter.searchTerm || ''
  const nativeFile = isNativeSource ? getNativeFileForLevel(logLevel) : null
  const selectedService = services.find((service) => service.id === selectedServiceId)
  const nativeFileLabel = NATIVE_LOG_FILE_LABELS[nativeFile] || '信息日志'
  const nativeLogLabel = isNativeSource
    ? `${selectedService?.name || selectedServiceId || '未选择服务'} / ${nativeFileLabel}`
    : ''
  // 直接订阅状态，确保响应式更新
  const originalLines = useLogLines(type, currentSource)

  // 本地过滤逻辑，确保响应式
  const lines = useMemo(() => {
    return filterLogLines(originalLines, logLevel, searchTerm)
  }, [originalLines, logLevel, searchTerm])
  const originalLogs = useMemo(() => {
    return originalLines.map(line => typeof line === 'object' ? line.text : line).join('\n')
  }, [originalLines])

  const updateLogLevel = useCallback((nextLevel) => {
    if (type === 'service') {
      setSourceFilters((state) => ({
        ...state,
        [currentSource]: { ...state[currentSource], logLevel: nextLevel }
      }))
      return
    }
    setLogLevel(type, nextLevel)
  }, [currentSource, setLogLevel, type])

  const updateSearchTerm = useCallback((nextTerm) => {
    if (type === 'service') {
      setSourceFilters((state) => ({
        ...state,
        [currentSource]: { ...state[currentSource], searchTerm: nextTerm }
      }))
      return
    }
    setSearchTerm(type, nextTerm)
  }, [currentSource, setSearchTerm, type])

  useEffect(() => {
    saveLogViewState({
      source: logSource,
      serviceId: selectedServiceId,
      filters: sourceFilters
    })
  }, [logSource, selectedServiceId, sourceFilters])

  // 监听全局搜索聚焦事件
  useEffect(() => {
    const handleFocusSearch = (event) => {
      if (event.detail === type && searchInputRefLocal.current) {
        searchInputRefLocal.current.focus()
        searchInputRefLocal.current.select()
      }
    }
    window.addEventListener('focusSearch', handleFocusSearch)
    return () => window.removeEventListener('focusSearch', handleFocusSearch)
  }, [type])

  useEffect(() => {
    if (!logRef.current) {
      return undefined
    }

    const updateHeight = () => {
      if (logRef.current) {
        setViewportHeight(logRef.current.clientHeight)
      }
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(logRef.current)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (type === 'service' && services.length > 0 && !services.some((service) => service.id === selectedServiceId)) {
      setSelectedServiceId(services[0].id)
    }
  }, [type, services, selectedServiceId])

  useEffect(() => {
    if (type !== 'service' || currentSource !== 'native') {
      return
    }

    setSourceFilters((state) => {
      if (state.native.logLevel !== 'cmd') {
        return state
      }
      return {
        ...state,
        native: { ...state.native, logLevel: 'all' }
      }
    })
  }, [currentSource, type])

  useEffect(() => {
    if (type !== 'service' || currentSource !== 'native') {
      return
    }

    if (!selectedServiceId) {
      clearNativeServiceLogs()
      return
    }

    loadNativeServiceLogs({ serviceId: selectedServiceId, file: nativeFile, lines: 500 }).catch(() => {})
  }, [type, currentSource, selectedServiceId, nativeFile, loadNativeServiceLogs, clearNativeServiceLogs])

  useEffect(() => {
    if (logRef.current && autoScroll) {
      requestAnimationFrame(() => {
        if (logRef.current) {
          logRef.current.scrollTop = logRef.current.scrollHeight
          scrollTopRef.current = logRef.current.scrollTop
          setRenderTick((t) => t + 1)
        }
      })
    }
  }, [lines, autoScroll])

  const totalHeight = lines.length * LOG_LINE_HEIGHT
  const visibleCount = Math.max(Math.ceil(viewportHeight / LOG_LINE_HEIGHT), 1)
  const startIndex = Math.max(Math.floor(scrollTopRef.current / LOG_LINE_HEIGHT) - LOG_OVERSCAN, 0)
  const endIndex = Math.min(startIndex + visibleCount + LOG_OVERSCAN * 2, lines.length)
  const visibleLines = lines.slice(startIndex, endIndex)

  const handleScroll = useCallback(() => {
    if (!logRef.current) return
    const { scrollTop: nextScrollTop, scrollHeight, clientHeight } = logRef.current
    const atBottom = scrollHeight - nextScrollTop - clientHeight < 50
    scrollTopRef.current = nextScrollTop
    setAutoScroll(atBottom)
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(() => {
      setRenderTick((t) => t + 1)
    })
  }, [])

  const handleClear = () => {
    if (type === 'build') {
      clearBuildLogs()
    } else if (type === 'package') {
      clearPackageLogs()
    } else if (isNativeSource) {
      clearNativeServiceLogs()
    } else {
      clearServiceLogs()
    }
    scrollTopRef.current = 0
    setRenderTick((t) => t + 1)
  }

  const refreshNativeLogs = useCallback(() => {
    if (type !== 'service' || currentSource !== 'native' || !selectedServiceId) return
    loadNativeServiceLogs({ serviceId: selectedServiceId, file: nativeFile, lines: 500 }).catch(() => {})
  }, [type, currentSource, selectedServiceId, nativeFile, loadNativeServiceLogs])

  const handleDownload = () => {
    if (!originalLogs) return
    const blob = new Blob([originalLogs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    const sourcePart = isNativeSource ? `native-${selectedServiceId || 'service'}-${nativeFile?.replace('.log', '') || 'info'}` : `${type}-control`
    anchor.href = url
    anchor.download = `${sourcePart}-logs-${date}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(originalLogs)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }, [originalLogs])

  const handleTextSelect = useCallback(async () => {
    const selection = window.getSelection()
    const selectedText = selection?.toString()
    if (selectedText && selectedText.trim()) {
      try {
        await navigator.clipboard.writeText(selectedText)
        setCopiedSelection(true)
        setTimeout(() => setCopiedSelection(false), 1500)
      } catch (err) {
        console.error('复制选中文本失败:', err)
      }
    }
  }, [])

  const toggleStackTrace = (index) => {
    setExpandedStackTraces(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const matchCount = useMemo(() => (searchTerm ? lines.length : 0), [lines, searchTerm])
  const sourceLabel = currentSource === 'native' ? 'MeterSphere 原生日志' : '控制面板日志'
  const activeLogLabel = isNativeSource ? `${sourceLabel} / ${nativeLogLabel}` : sourceLabel
  const emptyState = (() => {
    if (isNativeSource && nativeServiceLogs.error) {
      return {
        type: 'error',
        title: '原生日志读取失败',
        description: nativeServiceLogs.error,
        action: { label: '重新读取', onClick: refreshNativeLogs }
      }
    }

    if (searchTerm) {
      return {
        type: 'search',
        title: '当前日志中没有匹配内容',
        description: `搜索范围：${activeLogLabel}`,
        action: { label: '清除搜索', onClick: () => updateSearchTerm('') }
      }
    }

    if (isNativeSource) {
      return {
        type: 'logs',
        title: '当前服务暂无日志',
        description: `读取范围：${nativeLogLabel}`,
        action: { label: '重新读取', onClick: refreshNativeLogs }
      }
    }

    return {
      type: 'logs',
      title: '暂无控制面板日志',
      description: '启动、停止、构建或打包后将在此显示控制面板日志'
    }
  })()

  // 渲染单行日志
  const renderLogLine = (line, index) => {
    const isObject = typeof line === 'object'
    const text = isObject ? line.text : line
    const level = isObject ? line.level : 'info'
    const isStackTrace = isObject ? line.isStackTrace : false
    const isEmpty = isObject ? line.isEmpty : !text || text.trim() === ''

    if (isEmpty) {
      return <div key={`${startIndex + index}-empty`} className="log-line log-line-empty"> </div>
    }

    // 分隔线特殊处理
    if (text.startsWith('=====')) {
      return (
        <div key={`${startIndex + index}-sep`} className="log-line log-line-separator">
          {text}
        </div>
      )
    }

    // 堆栈跟踪行处理
    if (isStackTrace) {
      const isExpanded = expandedStackTraces.has(startIndex + index)
      // 检测是否是堆栈跟踪的开头（Caused by 或异常类名）
      const isStackStart = text.match(/^\s*(Caused by:|\w+Exception:|\w+Error:)/)
      
      return (
        <div 
          key={`${startIndex + index}-${text.slice(0, 50)}`} 
          className={`log-line log-line-stacktrace ${isExpanded ? 'expanded' : 'collapsed'}`}
          style={{ paddingLeft: '20px' }}
          onClick={() => isStackStart && toggleStackTrace(startIndex + index)}
        >
          {isStackStart && (
            <span className="stacktrace-toggle">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          <span className="log-line-content">{text}</span>
        </div>
      )
    }

    // CMD 行特殊处理：显示 $ 前缀
    if (level === 'cmd') {
      const cmdConfig = LOG_LEVEL_CONFIG.cmd;
      const cmdText = text.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*\$\s*/, '$ ');
      return (
        <div
          key={`${startIndex + index}-${text.slice(0, 50)}`}
          className="log-line log-line-cmd"
          style={{
            color: cmdConfig.color,
            backgroundColor: cmdConfig.bgColor,
            borderLeft: `3px solid ${cmdConfig.borderColor}`,
            paddingLeft: '8px'
          }}
        >
          <span className="log-level-badge" style={{
            backgroundColor: cmdConfig.borderColor,
            color: cmdConfig.color
          }}>
            {cmdConfig.label}
          </span>
          <span className="log-line-content" style={{ fontFamily: 'monospace' }}>{highlightSearchTerm(cmdText, searchTerm)}</span>
        </div>
      );
    }

    // 普通日志行
    const levelConfig = LOG_LEVEL_CONFIG[level] || LOG_LEVEL_CONFIG.info
    
    return (
      <div 
        key={`${startIndex + index}-${text.slice(0, 50)}`} 
        className={`log-line log-line-${level}`}
        style={{
          color: levelConfig.color,
          backgroundColor: levelConfig.bgColor,
          borderLeft: level !== 'info' && level !== 'trace' ? `3px solid ${levelConfig.borderColor}` : 'none',
          paddingLeft: level !== 'info' && level !== 'trace' ? '8px' : '12px'
        }}
      >
        {level !== 'info' && level !== 'trace' && (
          <span className="log-level-badge" style={{ 
            backgroundColor: levelConfig.borderColor,
            color: levelConfig.color
          }}>
            {levelConfig.label}
          </span>
        )}
        <span className="log-line-content">{highlightSearchTerm(text, searchTerm)}</span>
      </div>
    )
  }

  // 高亮搜索词
  const highlightSearchTerm = (text, term) => {
    if (!term) return text
    const escapedTerm = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const parts = String(text ?? '').split(new RegExp(`(${escapedTerm})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === String(term).toLowerCase()
        ? <mark key={i} className="highlight">{part}</mark>
        : part
    )
  }

  return (
    <div className={`log-container ${getThemeClass(type)}`}>
      <div className="log-toolbar">
        <div className="log-filters">
          {type === 'service' && (
            <div className="log-source-tabs">
              <button className={currentSource === 'control' ? 'active' : ''} onClick={() => setLogSource('control')}>控制面板日志</button>
              <button className={currentSource === 'native' ? 'active' : ''} onClick={() => setLogSource('native')}>MeterSphere 原生日志</button>
            </div>
          )}
          {type === 'service' && currentSource === 'native' && (
            <>
              <select className="log-select native-service-select" value={selectedServiceId} onChange={(e) => setSelectedServiceId(e.target.value)}>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.name || service.id}</option>
                ))}
              </select>
              <div className="log-source-label">当前：{activeLogLabel}</div>
            </>
          )}
          {type === 'service' && currentSource === 'control' && (
            <div className="log-source-label">当前：{activeLogLabel}</div>
          )}
          <select
            value={logLevel}
            onChange={(e) => updateLogLevel(e.target.value)}
            className="log-select"
          >
            <option value="all">全部级别</option>
            <option value="error">错误 (ERROR)</option>
            <option value="warn">警告 (WARN)</option>
            <option value="info">信息 (INFO)</option>
            {currentSource !== 'native' && <option value="cmd">命令 (CMD)</option>}
            <option value="debug">调试 (DEBUG)</option>
          </select>

          <div className="log-search">
            <input
              ref={searchInputRefLocal}
              type="text"
              placeholder="搜索日志... (快捷键: S)"
              value={searchTerm}
              onChange={(e) => updateSearchTerm(e.target.value)}
              className="log-search-input"
            />
            {searchTerm && (
              <span className={`match-count ${matchCount === 0 ? 'no-match' : ''}`}>
                {matchCount} 条匹配
              </span>
            )}
          </div>
        </div>

        <div className="log-actions">
          <Tooltip content={copied ? '已复制!' : '复制全部'} position="bottom">
            <button 
              className={`btn-icon ${copied ? 'copied' : ''}`} 
              onClick={handleCopy}
            >
              {copied ? '✓' : '📋'}
            </button>
          </Tooltip>
          <Tooltip content="下载日志" position="bottom">
            <button className="btn-icon" onClick={handleDownload} disabled={!originalLogs}>
              💾
            </button>
          </Tooltip>
          <Tooltip content="清空日志 (快捷键: C)" position="bottom">
            <button className="btn-icon" onClick={handleClear}>
              🗑️
            </button>
          </Tooltip>
        </div>
      </div>

      <div ref={logRef} className="log" onScroll={handleScroll} onMouseUp={handleTextSelect}>
        {lines.length > 0 ? (
          <div className="log-viewport" style={{ height: `${totalHeight}px` }}>
            <div className="log-visible" style={{ transform: `translateY(${startIndex * LOG_LINE_HEIGHT}px)` }}>
              {visibleLines.map((line, index) => renderLogLine(line, index))}
            </div>
          </div>
        ) : (
          <EmptyState
            type={emptyState.type}
            title={emptyState.title}
            description={emptyState.description}
            action={emptyState.action}
          />
        )}
      </div>
      
      {/* 回到底部按钮 */}
      {!autoScroll && lines.length > 0 && (
        <button
          className="scroll-to-bottom"
          onClick={() => {
            if (logRef.current) {
              logRef.current.scrollTop = logRef.current.scrollHeight
              setAutoScroll(true)
            }
          }}
        >
          ↓ 回到底部
        </button>
      )}

      {/* 选中复制提示 */}
      {copiedSelection && (
        <div className="copy-toast">
          ✓ 已复制选中内容
        </div>
      )}
    </div>
  )
}

function getThemeClass(type) {
  switch (type) {
    case 'build':
      return 'log-theme-build'
    case 'package':
      return 'log-theme-build'
    case 'service':
    default:
      return 'log-theme-service'
  }
}

export default LogViewer
