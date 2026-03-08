import { useState, useEffect, useCallback } from 'react'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from './hooks/useWebSocket'
import { useServiceStore, useBuildStore, useLogStore } from './store/useAppStore'
import Sidebar from './components/Sidebar'
import BuildTab from './components/BuildTab'
import ServicesTab from './components/ServicesTab'
import ConnectionStatus from './components/ConnectionStatus'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import './styles/App.css'

function App() {
  const [activeTab, setActiveTab] = useState('build')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  const { fetchServices, fetchCatalog } = useServiceStore()
  const { fetchModules, fetchActiveBuilds } = useBuildStore()
  const { clearServiceLogs, clearBuildLogs } = useLogStore()

  useWebSocket()

  useEffect(() => {
    const handleSwitchTab = (event) => {
      if (event.detail && (event.detail === 'build' || event.detail === 'services')) {
        setActiveTab(event.detail)
      }
    }
    window.addEventListener('switchTab', handleSwitchTab)
    return () => window.removeEventListener('switchTab', handleSwitchTab)
  }, [])

  const handleRefresh = useCallback(() => {
    fetchCatalog()
    fetchServices()
    fetchModules()
    fetchActiveBuilds()
  }, [fetchCatalog, fetchServices, fetchModules, fetchActiveBuilds])

  const handleClearLogs = useCallback(() => {
    if (activeTab === 'build') {
      clearBuildLogs()
    } else {
      clearServiceLogs()
    }
  }, [activeTab, clearBuildLogs, clearServiceLogs])

  const handleFocusSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent('focusSearch', { detail: activeTab }))
  }, [activeTab])

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '8px',
            padding: '12px 16px',
          },
        }}
      />
      
      <ConnectionStatus />
      
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      <main className="main-content">
        {activeTab === 'build' && <BuildTab />}
        {activeTab === 'services' && <ServicesTab />}
      </main>
      
      <KeyboardShortcuts 
        onSwitchTab={setActiveTab}
        onRefresh={handleRefresh}
        onClearLogs={handleClearLogs}
        onFocusSearch={handleFocusSearch}
      />
    </div>
  )
}

export default App
