import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from './hooks/useWebSocket'
import Sidebar from './components/Sidebar'
import BuildTab from './components/BuildTab'
import ServicesTab from './components/ServicesTab'
import './styles/App.css'

function App() {
  const [activeTab, setActiveTab] = useState('build')
  
  // 初始化 WebSocket 连接
  useWebSocket()

  return (
    <div className="app">
      <Toaster position="top-right" />
      <div className="container">
        <h1 className="title">🚀 MeterSphere 控制面板</h1>
        <div className="layout">
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <main className="content">
            {activeTab === 'build' && <BuildTab />}
            {activeTab === 'services' && <ServicesTab />}
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
