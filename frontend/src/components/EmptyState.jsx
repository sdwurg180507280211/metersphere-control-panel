import './EmptyState.css'

const EMPTY_STATE_CONFIG = {
  logs: {
    icon: '📋',
    title: '暂无日志',
    description: '等待日志输出，执行操作后将在此显示'
  },
  services: {
    icon: '🔌',
    title: '服务未配置',
    description: '请在 config.json 中配置服务信息'
  },
  modules: {
    icon: '📦',
    title: '模块未配置',
    description: '请在 config.json 中配置前端模块'
  },
  builds: {
    icon: '🔨',
    title: '暂无构建任务',
    description: '点击上方模块按钮开始构建'
  },
  search: {
    icon: '🔍',
    title: '未找到匹配结果',
    description: '尝试使用其他关键词搜索'
  },
  error: {
    icon: '⚠️',
    title: '出错了',
    description: '加载数据时发生错误，请刷新页面重试'
  }
}

function EmptyState({ type = 'default', icon, title, description, action }) {
  const config = EMPTY_STATE_CONFIG[type] || {}
  const displayIcon = icon || config.icon || '📭'
  const displayTitle = title || config.title || '暂无数据'
  const displayDescription = description || config.description || ''

  return (
    <div className="empty-state">
      <div className="empty-state-icon">{displayIcon}</div>
      <h3 className="empty-state-title">{displayTitle}</h3>
      {displayDescription && (
        <p className="empty-state-description">{displayDescription}</p>
      )}
      {action && (
        <button className="empty-state-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

export default EmptyState
