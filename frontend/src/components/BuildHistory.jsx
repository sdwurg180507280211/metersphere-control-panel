import { useState, useEffect } from 'react'
import { useBuildStore } from '../store/useAppStore'
import './BuildHistory.css'

function BuildHistory() {
  const { buildHistory, fetchBuildHistory } = useBuildStore()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetchBuildHistory(5)
    const interval = setInterval(() => fetchBuildHistory(5), 10000)
    return () => clearInterval(interval)
  }, [fetchBuildHistory])

  if (buildHistory.length === 0) return null

  const formatTime = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatDuration = (ms) => {
    if (!ms) return '-'
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remaining = seconds % 60
    return `${minutes}m${remaining}s`
  }

  const visibleHistory = expanded ? buildHistory : buildHistory.slice(0, 3)

  return (
    <div className="build-history">
      <div 
        className="build-history-header" 
        onClick={() => setExpanded(!expanded)}
      >
        <span className="build-history-title">📜 构建历史</span>
        <span className="build-history-toggle">
          {expanded ? '收起 ▲' : `展开 ▼ (${buildHistory.length})`}
        </span>
      </div>
      
      <div className={`build-history-list ${expanded ? 'expanded' : ''}`}>
        {visibleHistory.map((build) => (
          <div 
            key={build.id} 
            className={`build-history-item ${build.status}`}
            title={build.error || ''}
          >
            <span className="history-status-icon">
              {build.status === 'success' ? '✓' : build.status === 'failed' ? '✕' : '○'}
            </span>
            <span className="history-module">{build.module}</span>
            <span className="history-time">{formatTime(build.endTime || build.startTime)}</span>
            <span className="history-duration">{formatDuration(build.duration)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BuildHistory
