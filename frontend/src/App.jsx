import { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from './hooks/useWebSocket'
import { useServiceStore, useBuildStore, useLogStore, usePackageStore } from './store/useAppStore'
import Sidebar from './components/Sidebar'
import BuildTab from './components/BuildTab'
import ServicesTab from './components/ServicesTab'
import PackageTab from './components/PackageTab'
import ConnectionStatus from './components/ConnectionStatus'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import TabTransition from './components/TabTransition'
import './styles/App.css'

function App() {
  const [activeTab, setActiveTab] = useState('build')
  const searchInputRef = useRef(null)
  
  const { fetchServices, fetchCatalog } = useServiceStore()
  const { fetchModules, fetchActiveBuilds } = useBuildStore()
  const { fetchOptions: fetchPackageOptions, fetchActiveTask: fetchActivePackageTask } = usePackageStore()
  const { clearServiceLogs, clearBuildLogs, clearPackageLogs } = useLogStore()

  // 初始化 WebSocket 连接
  useWebSocket()

  // 监听切换页签事件（从 WebSocket 处理器触发）
  useEffect(() => {
    const handleSwitchTab = (event) => {
      if (event.detail && (event.detail === 'build' || event.detail === 'services')) {
        setActiveTab(event.detail)
      }
      if (event.detail === 'package') {
        setActiveTab(event.detail)
      }
    }
    window.addEventListener('switchTab', handleSwitchTab)
    return () => window.removeEventListener('switchTab', handleSwitchTab)
  }, [])

  // 刷新数据
  const handleRefresh = useCallback(() => {
    fetchCatalog()
    fetchServices()
    fetchModules()
    fetchActiveBuilds()
    fetchPackageOptions()
    fetchActivePackageTask()
  }, [fetchCatalog, fetchServices, fetchModules, fetchActiveBuilds, fetchPackageOptions, fetchActivePackageTask])

  // 清除当前页签的日志
  const handleClearLogs = useCallback(() => {
    if (activeTab === 'build') {
      clearBuildLogs()
    } else if (activeTab === 'package') {
      clearPackageLogs()
    } else {
      clearServiceLogs()
    }
  }, [activeTab, clearBuildLogs, clearPackageLogs, clearServiceLogs])

  // 聚焦搜索框
  const handleFocusSearch = useCallback(() => {
    // 发送自定义事件通知当前活动的日志查看器聚焦搜索框
    window.dispatchEvent(new CustomEvent('focusSearch', { detail: activeTab }))
  }, [activeTab])

  return (
    <div className="app">
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '10px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: {
              primary: '#34c759',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ff3b30',
              secondary: '#fff',
            },
            duration: 5000,
          },
        }}
      />
      
      {/* 连接状态指示器 */}
      <ConnectionStatus />
      
      <div className="container">
        <header className="app-header">
          <h1 className="title">
            <span className="title-icon">🚀</span>
            MeterSphere 控制面板
          </h1>
          <div className="header-actions">
            <button 
              className="header-btn" 
              onClick={handleRefresh}
              title="刷新数据 (R)"
            >
              🔄
            </button>
          </div>
        </header>
        
        <div className="layout">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="content">
            <TabTransition activeTab={activeTab} tabId="build">
              <BuildTab searchInputRef={searchInputRef} />
            </TabTransition>
            <TabTransition activeTab={activeTab} tabId="services">
              <ServicesTab searchInputRef={searchInputRef} />
            </TabTransition>
            <TabTransition activeTab={activeTab} tabId="package">
              <PackageTab searchInputRef={searchInputRef} />
            </TabTransition>
          </main>
        </div>
      </div>
      
      {/* 快捷键帮助 */}
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
