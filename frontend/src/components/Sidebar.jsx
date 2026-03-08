import './Sidebar.css'

function Sidebar({ activeTab, onTabChange, collapsed, onToggleCollapse }) {
  const navItems = [
    { 
      id: 'build', 
      label: '前端构建', 
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      ),
      shortcut: '1'
    },
    { 
      id: 'services', 
      label: '服务管理', 
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      ),
      shortcut: '2'
    }
  ]

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo 区域 */}
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">🚀</span>
          {!collapsed && <span className="logo-text">MS Control</span>}
        </div>
        <button 
          className="collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? (
              <path d="M9 18l6-6-6-6"/>
            ) : (
              <path d="M15 18l-6-6 6-6"/>
            )}
          </svg>
        </button>
      </div>

      {/* 导航菜单 */}
      <nav className="sidebar-nav">
        <div className="nav-section">
          {!collapsed && <div className="nav-section-title">主菜单</div>}
          <div className="nav-items">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => onTabChange(item.id)}
                title={collapsed ? item.label : ''}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && (
                  <>
                    <span className="nav-label">{item.label}</span>
                    <span className="nav-shortcut">{item.shortcut}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* 底部信息 */}
      <div className="sidebar-footer">
        {!collapsed && (
          <div className="footer-info">
            <span className="version">v2.0.0</span>
            <span className="divider">·</span>
            <span className="help" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', {key: '?'}))}>
              快捷键 ?
            </span>
          </div>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
