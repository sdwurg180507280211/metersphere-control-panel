import { useState, useEffect, useCallback } from 'react'
import './KeyboardShortcuts.css'

const SHORTCUTS = [
  { key: '?', description: '显示/隐藏快捷键帮助' },
  { key: '1', description: '切换到构建页面' },
  { key: '2', description: '切换到服务管理页面' },
  { key: '3', description: '切换到打包页面' },
  { key: '4', description: '切换到配置页面' },
  { key: 'b', description: '开始构建（在构建页面）' },
  { key: 'r', description: '刷新数据' },
  { key: 'c', description: '清除当前日志' },
  { key: 's', description: '聚焦搜索框' },
  { key: 'Esc', description: '关闭弹窗/取消操作' }
]

function KeyboardShortcuts({ onSwitchTab, onRefresh, onClearLogs, onFocusSearch }) {
  const [visible, setVisible] = useState(false)

  const handleKeyDown = useCallback((e) => {
    // 忽略在输入框中的快捷键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') {
        e.target.blur()
      }
      return
    }

    switch (e.key) {
      case '?':
        e.preventDefault()
        setVisible(prev => !prev)
        break
      case '1':
        e.preventDefault()
        onSwitchTab?.('build')
        break
      case '2':
        e.preventDefault()
        onSwitchTab?.('services')
        break
      case '3':
        e.preventDefault()
        onSwitchTab?.('package')
        break
      case '4':
        e.preventDefault()
        onSwitchTab?.('config')
        break
      case 'r':
      case 'R':
        e.preventDefault()
        onRefresh?.()
        break
      case 'c':
      case 'C':
        e.preventDefault()
        onClearLogs?.()
        break
      case 's':
      case 'S':
        e.preventDefault()
        onFocusSearch?.()
        break
      case 'Escape':
        setVisible(false)
        break
    }
  }, [onSwitchTab, onRefresh, onClearLogs, onFocusSearch])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!visible) {
    return (
      <button 
        className="keyboard-shortcuts-trigger" 
        onClick={() => setVisible(true)}
        title="快捷键帮助 (?)"
      >
        ⌨️
      </button>
    )
  }

  return (
    <div className="keyboard-shortcuts-overlay" onClick={() => setVisible(false)}>
      <div className="keyboard-shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="keyboard-shortcuts-header">
          <h3>⌨️ 键盘快捷键</h3>
          <button className="keyboard-shortcuts-close" onClick={() => setVisible(false)}>
            ✕
          </button>
        </div>
        <div className="keyboard-shortcuts-list">
          {SHORTCUTS.map(({ key, description }) => (
            <div key={key} className="keyboard-shortcut-item">
              <kbd className="keyboard-shortcut-key">{key}</kbd>
              <span className="keyboard-shortcut-desc">{description}</span>
            </div>
          ))}
        </div>
        <div className="keyboard-shortcuts-footer">
          按 <kbd>Esc</kbd> 或点击外部关闭
        </div>
      </div>
    </div>
  )
}

export default KeyboardShortcuts
