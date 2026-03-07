import { useRef, useEffect, useMemo, useState } from 'react'
import { useLogStore } from '../store/useAppStore'
import './LogViewer.css'

const LOG_LINE_HEIGHT = 20
const LOG_OVERSCAN = 20

// 日志级别配置
const LOG_LEVEL_CONFIG = {
  error: { label: 'ERROR', color: '#ff4d4f', bgColor: '#fff1f0', borderColor: '#ffccc7' },
  warn: { label: 'WARN', color: '#faad14', bgColor: '#fffbe6', borderColor: '#ffe58f' },
  info: { label: 'INFO', color: '#52c41a', bgColor: 'transparent', borderColor: 'transparent' },
  debug: { label: 'DEBUG', color: '#8c8c8c', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
  trace: { label: 'TRACE', color: '#bfbfbf', bgColor: 'transparent', borderColor: 'transparent' },
  separator: { label: '', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' },
  stacktrace: { label: '', color: '#ff4d4f', bgColor: 'transparent', borderColor: 'transparent' }
}

function LogViewer({ type }) {
  const logRef = useRef(null)
  const shouldAutoScroll = useRef(true)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [expandedStackTraces, setExpandedStackTraces] = useState(new Set())

  const {
    filters,
    setLogLevel,
    setSearchTerm,
    getLogLines,
    getFilteredLogs,
    clearServiceLogs,
    clearBuildLogs
  } = useLogStore()

  const { logLevel, searchTerm } = filters[type]
  const originalLines = getLogLines(type)

  const lines = useMemo(() => getFilteredLogs(type), [getFilteredLogs, type, logLevel, searchTerm, originalLines])
  const originalLogs = useMemo(() => {
    return originalLines.map(line => typeof line === 'object' ? line.text : line).join('\n')
  }, [originalLines])

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
    if (logRef.current && shouldAutoScroll.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
      setScrollTop(logRef.current.scrollTop)
    }
  }, [lines])

  const totalHeight = lines.length * LOG_LINE_HEIGHT
  const visibleCount = Math.max(Math.ceil(viewportHeight / LOG_LINE_HEIGHT), 1)
  const startIndex = Math.max(Math.floor(scrollTop / LOG_LINE_HEIGHT) - LOG_OVERSCAN, 0)
  const endIndex = Math.min(startIndex + visibleCount + LOG_OVERSCAN * 2, lines.length)
  const visibleLines = lines.slice(startIndex, endIndex)

  const handleScroll = () => {
    if (logRef.current) {
      const { scrollTop: nextScrollTop, scrollHeight, clientHeight } = logRef.current
      shouldAutoScroll.current = scrollHeight - nextScrollTop - clientHeight < 50
      setScrollTop(nextScrollTop)
    }
  }

  const handleClear = () => {
    if (type === 'build') {
      clearBuildLogs()
    } else {
      clearServiceLogs()
    }
    setScrollTop(0)
  }

  const handleDownload = () => {
    const blob = new Blob([originalLogs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${type}-logs-${new Date().toISOString().slice(0, 10)}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

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
        <span className="log-line-content">{text}</span>
      </div>
    )
  }

  return (
    <div className={`log-container ${getThemeClass(type)}`}>
      <div className="log-toolbar">
        <div className="log-filters">
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(type, e.target.value)}
            className="log-select"
          >
            <option value="all">全部级别</option>
            <option value="error">错误 (ERROR)</option>
            <option value="warn">警告 (WARN)</option>
            <option value="info">信息 (INFO)</option>
            <option value="debug">调试 (DEBUG)</option>
          </select>

          <div className="log-search">
            <input
              type="text"
              placeholder="搜索日志..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(type, e.target.value)}
              className="log-search-input"
            />
            {searchTerm && <span className="match-count">{matchCount} 条匹配</span>}
          </div>
        </div>

        <div className="log-actions">
          <button className="btn-icon" onClick={handleDownload} title="下载日志">
            💾
          </button>
          <button className="btn-icon" onClick={handleClear} title="清空日志">
            🗑️
          </button>
        </div>
      </div>

      <div ref={logRef} className="log" onScroll={handleScroll}>
        {lines.length > 0 ? (
          <div className="log-viewport" style={{ height: `${totalHeight}px` }}>
            <div className="log-visible" style={{ transform: `translateY(${startIndex * LOG_LINE_HEIGHT}px)` }}>
              {visibleLines.map((line, index) => renderLogLine(line, index))}
            </div>
          </div>
        ) : (
          <span className="log-placeholder">等待日志输出...</span>
        )}
      </div>
    </div>
  )
}

function getThemeClass(type) {
  switch (type) {
    case 'build':
      return 'log-theme-build'
    case 'service':
    default:
      return 'log-theme-service'
  }
}

export default LogViewer
