import { useRef, useEffect, useMemo, useState } from 'react'
import { useLogStore } from '../store/useAppStore'
import './LogViewer.css'

const LOG_LINE_HEIGHT = 20
const LOG_OVERSCAN = 20

function LogViewer({ type }) {
  const logRef = useRef(null)
  const shouldAutoScroll = useRef(true)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)

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
  const originalLogs = useMemo(() => originalLines.join('\n'), [originalLines])

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

  const matchCount = useMemo(() => (searchTerm ? lines.length : 0), [lines, searchTerm])

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
            <option value="error">错误</option>
            <option value="warn">警告</option>
            <option value="info">信息</option>
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
              {visibleLines.map((line, index) => (
                <div key={`${startIndex + index}-${line}`} className="log-line">
                  {line || ' '}
                </div>
              ))}
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
