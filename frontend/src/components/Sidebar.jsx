import './Sidebar.css'

function Sidebar({ activeTab, onTabChange }) {
  const navItems = [
    { id: 'build', label: '前端构建', icon: '🔨', shortcut: '1' },
    { id: 'services', label: '服务管理', icon: '⚙️', shortcut: '2' },
    { id: 'package', label: '整体验证打包', icon: '📦', shortcut: '3' }
  ]

  return (
    <nav className="sidebar">
      {navItems.map((item, index) => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => onTabChange(item.id)}
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
          <span className="nav-shortcut">{item.shortcut}</span>
        </button>
      ))}
    </nav>
  )
}

export default Sidebar
