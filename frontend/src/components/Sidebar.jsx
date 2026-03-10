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
    </nav>
  )
}

export default Sidebar
