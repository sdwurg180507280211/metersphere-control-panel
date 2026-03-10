import './Sidebar.css'

function Sidebar({ activeTab, onTabChange, items = [] }) {
  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-hidden="true">MS</div>
        <div className="sidebar-brand-copy">
          <strong className="sidebar-brand-title">MeterSphere</strong>
          <span className="sidebar-brand-subtitle">Control Panel</span>
        </div>
      </div>

      <div className="sidebar-overview">
        <span className="sidebar-overview-label">Workspace Shell</span>
        <strong className="sidebar-overview-title">整屏工作台</strong>
        <p className="sidebar-overview-description">
          统一进入构建、服务、打包与配置四个高频操作区域。
        </p>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Workspaces</div>
        <div className="sidebar-nav">
          {items.map((item) => {
            const isActive = activeTab === item.id

            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => onTabChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={`${item.label} (${item.shortcut})`}
              >
                <span className="nav-item-icon" aria-hidden="true">{item.navCode}</span>
                <span className="nav-item-copy">
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-description">{item.title}</span>
                </span>
                <span className="nav-shortcut">{item.shortcut}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <span className="sidebar-footer-label">Quick Tips</span>
        <p className="sidebar-footer-text">按 1-4 快速切换工作区，按 R 触发全局刷新。</p>
      </div>
    </nav>
  )
}

export default Sidebar
