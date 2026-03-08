import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useLogStore } from '../store/useAppStore'
import './LogViewer.css'

const LOG_LINE_HEIGHT = 18
const LOG_OVERSCAN = 10

const LOG_LEVEL_CONFIG = {
  error: { color: '#ff4d4f', bgColor: 'rgba(255, 77, 79, 0.1)' },
  warn: { color: '#faad14', bgColor: 'rgba(250, 173, 20, 0.1)' },
  info: { color: '#d4d4d4', bgColor: 'transparent' },
  debug: { color: '#8c8c8c', bgColor: 'transparent' }
}

function LogViewer({ type }) {
  const logRef = useRef(null)
  const shouldAutoScroll = useRef(true)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

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

  useEffect(() => {
    if (!logRef.current) return
    const updateHeight = () => {
      if (logRef.current) setViewportHeight(logRef.current.clientHeight)
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
      const { scrollTop: st, scrollHeight, clientHeight } = logRef.current
      const isBottom = scrollHeight - st - clientHeight < 50
      shouldAutoScroll.current = isBottom
      setShowScrollBtn(!isBottom && lines.length > 0)
      setScrollTop(st)
    }
  }

  const handleClear = () => {
    if (type === 'build') clearBuildLogs()
    else clearServiceLogs()
  }

  const scrollToBottom = () => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
      shouldAutoScroll.current = true
      setShowScrollBtn(false)
    }
  }

  const renderLine = (line, index) => {
    const isObj = typeof line === 'object'
    const text = isObj ? line.text : line
    const level = isObj ? line.level : 'info'
    const cfg = LOG_LEVEL_CONFIG[level] || LOG_LEVEL_CONFIG.info

    if (!text || text.trim() === '') {
      return <div key={index} className="log-line empty" style={{ height: LOG_LINE_HEIGHT }} />
    }

    return (
      <div
        key={`${startIndex}-${index}`}
        className={`log-line level-${level}`}
        style={{
          height: LOG_LINE_HEIGHT,
          lineHeight: `${LOG_LINE_HEIGHT}px`,
          color: cfg.color,
          backgroundColor: cfg.bgColor
        }}
      >
        {text}
      </div>
    )
  }

  return (
    <>
      <div className="log-toolbar">
        <div className="log-filters">
          <select value={logLevel} onChange={(e) => setLogLevel(type, e.target.value)} className="log-select">
            <option value="all">全部</option>
            <option value="error">错误</option>
            <option value="warn">警告</option>
            <option value="info">信息</option>
          </select>
          <input
            type="text"
            placeholder="搜索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(type, e.target.value)}
            className="log-search-input"
          />
        </div>
        <div className="log-actions">
          <button className="log-btn" onClick={handleClear}>清空</button>
        </div>
      </div>

      <div ref={logRef} className="log-content" onScroll={handleScroll}>
        {lines.length > 0 ? (
          <div className="log-viewport" style={{ height: totalHeight }}>
            <div className="log-visible" style={{ transform: `translateY(${startIndex * LOG_LINE_HEIGHT}px)` }}>
              {visibleLines.map((line, i) => renderLine(line, i))}
            </div>
          </div>
        ) : (
          <div className="log-empty">等待日志输出...</div>
        )}
      </div>

      {showScrollBtn && (
        <button className="scroll-bottom-btn" onClick={scrollToBottom}>↓ 底部</button>
      )}
    </>
  )
}

export default LogViewer
