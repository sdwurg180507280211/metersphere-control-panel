import './Sidebar.css'

function Sidebar({ activeTab, onTabChange }) {
  const navItems = [
    { id: 'build', label: '前端构建', icon: '🔨' },
    { id: 'services', label: '服务管理', icon: '⚙️' }
  ]

  return (
    <nav className="sidebar">
      {navItems.map(item => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => onTabChange(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default Sidebar
