import { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from './hooks/useWebSocket'
import { useServiceStore, useBuildStore, useLogStore, usePackageStore, useConfigStore } from './store/useAppStore'
import Sidebar from './components/Sidebar'
import BuildTab from './components/BuildTab'
import ServicesTab from './components/ServicesTab'
import PackageTab from './components/PackageTab'
import ConfigTab from './components/ConfigTab'
import ConnectionStatus from './components/ConnectionStatus'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import TabTransition from './components/TabTransition'
import './styles/App.css'

const TAB_ITEMS = [
  {
    id: 'build',
    label: '前端构建',
    title: 'Build Workspace',
    description: '统一查看模块构建、当前进度、历史记录与构建日志。',
    navCode: 'BL',
    shortcut: '1'
  },
  {
    id: 'services',
    label: '服务管理',
    title: 'Services Workspace',
    description: '集中管理服务运行状态、批量操作、健康检查与服务日志。',
    navCode: 'SV',
    shortcut: '2'
  },
  {
    id: 'package',
    label: '整体验证打包',
    title: 'Package Workspace',
    description: '在整屏工作区内完成参数确认、任务跟踪与打包输出查看。',
    navCode: 'PK',
    shortcut: '3'
  },
  {
    id: 'config',
    label: '配置管理',
    title: 'Configuration Workspace',
    description: '编辑控制面板配置、运行时诊断、保存与应用动作统一呈现。',
    navCode: 'CF',
    shortcut: '4'
  }
]

function App() {
  const [activeTab, setActiveTab] = useState('build')
  const searchInputRef = useRef(null)

  const { fetchServices, fetchCatalog } = useServiceStore()
  const { fetchModules, fetchActiveBuilds } = useBuildStore()
  const { fetchOptions: fetchPackageOptions, fetchActiveTask: fetchActivePackageTask } = usePackageStore()
  const { clearServiceLogs, clearBuildLogs, clearPackageLogs } = useLogStore()
  const { fetchConfig, dirtyFields, saving, applying } = useConfigStore()
  const hasUnsavedConfigChanges = dirtyFields.length > 0 && !saving && !applying
  const activeTabMeta = TAB_ITEMS.find((item) => item.id === activeTab) || TAB_ITEMS[0]

  useWebSocket()

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedConfigChanges) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedConfigChanges])

  const handleTabChange = useCallback((nextTab) => {
    if (!nextTab || nextTab === activeTab) {
      return
    }

    if (activeTab === 'config' && hasUnsavedConfigChanges) {
      const shouldLeave = window.confirm('配置页有未保存变更，确定离开当前页面吗？')
      if (!shouldLeave) {
        return
      }
    }

    setActiveTab(nextTab)
  }, [activeTab, hasUnsavedConfigChanges])

  useEffect(() => {
    const handleSwitchTab = (event) => {
      if (event.detail && TAB_ITEMS.some((item) => item.id === event.detail)) {
        handleTabChange(event.detail)
      }
    }

    window.addEventListener('switchTab', handleSwitchTab)
    return () => window.removeEventListener('switchTab', handleSwitchTab)
  }, [handleTabChange])

  const handleRefresh = useCallback(() => {
    fetchCatalog()
    fetchServices()
    fetchModules()
    fetchActiveBuilds()
    fetchPackageOptions()
    fetchActivePackageTask()
    fetchConfig()
  }, [fetchCatalog, fetchServices, fetchModules, fetchActiveBuilds, fetchPackageOptions, fetchActivePackageTask, fetchConfig])

  const handleClearLogs = useCallback(() => {
    if (activeTab === 'build') {
      clearBuildLogs()
    } else if (activeTab === 'package') {
      clearPackageLogs()
    } else {
      clearServiceLogs()
    }
  }, [activeTab, clearBuildLogs, clearPackageLogs, clearServiceLogs])

  const handleFocusSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent('focusSearch', { detail: activeTab }))
  }, [activeTab])

  const shellStatusItems = [
    { label: '当前工作区', value: activeTabMeta.label },
    { label: '快捷键', value: activeTabMeta.shortcut },
    {
      label: activeTab === 'config' ? '配置状态' : '页面状态',
      value: activeTab === 'config'
        ? (hasUnsavedConfigChanges ? '未保存变更' : '已同步')
        : 'Ready'
    }
  ]

  return (
    <div className="app">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#0f1a3a',
            color: '#f8fafc',
            borderRadius: '14px',
            padding: '12px 16px',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            boxShadow: '0 18px 40px rgba(2, 6, 23, 0.45)',
          },
          success: {
            iconTheme: {
              primary: '#22c55e',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
            duration: 5000,
          },
        }}
      />

      <ConnectionStatus />

      <div className="app-shell">
        <Sidebar items={TAB_ITEMS} activeTab={activeTab} onTabChange={handleTabChange} />

        <div className="app-main">
          <header className="shell-header">
            <div className="shell-header-top">
              <div className="shell-breadcrumbs" aria-label="当前工作区路径">
                <span className="shell-breadcrumb-item">MeterSphere Control Panel</span>
                <span className="shell-breadcrumb-separator">/</span>
                <span className="shell-breadcrumb-item active">{activeTabMeta.label}</span>
              </div>

              <div className="header-actions">
                {activeTab !== 'config' && (
                  <button
                    type="button"
                    className="header-btn secondary"
                    onClick={handleFocusSearch}
                    title="聚焦日志搜索"
                    aria-label="聚焦日志搜索"
                  >
                    搜索日志
                  </button>
                )}

                {activeTab !== 'config' && (
                  <button
                    type="button"
                    className="header-btn secondary"
                    onClick={handleClearLogs}
                    title="清除当前页日志"
                    aria-label="清除当前页日志"
                  >
                    清空日志
                  </button>
                )}

                <button
                  type="button"
                  className="header-btn primary"
                  onClick={handleRefresh}
                  title="刷新数据 (R)"
                  aria-label="刷新数据"
                >
                  刷新数据
                </button>
              </div>
            </div>

            <div className="shell-header-body">
              <div className="shell-header-copy">
                <p className="shell-overline">Full Workspace Layout</p>
                <h1 className="shell-title">{activeTabMeta.title}</h1>
                <p className="shell-description">{activeTabMeta.description}</p>
              </div>

              <div className="shell-status-grid" aria-label="当前工作区摘要">
                {shellStatusItems.map((item) => (
                  <div key={item.label} className="shell-status-card">
                    <span className="shell-status-label">{item.label}</span>
                    <strong className="shell-status-value">{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </header>

          <main className="app-workspace">
            <section className="workspace-surface" aria-label={`${activeTabMeta.label} 工作区`}>
              <div className="content">
                <TabTransition activeTab={activeTab} tabId="build">
                  <BuildTab searchInputRef={searchInputRef} />
                </TabTransition>
                <TabTransition activeTab={activeTab} tabId="services">
                  <ServicesTab searchInputRef={searchInputRef} />
                </TabTransition>
                <TabTransition activeTab={activeTab} tabId="package">
                  <PackageTab searchInputRef={searchInputRef} />
                </TabTransition>
                <TabTransition activeTab={activeTab} tabId="config">
                  <ConfigTab />
                </TabTransition>
              </div>
            </section>
          </main>
        </div>
      </div>

      <KeyboardShortcuts
        onSwitchTab={handleTabChange}
        onRefresh={handleRefresh}
        onClearLogs={handleClearLogs}
        onFocusSearch={handleFocusSearch}
      />
    </div>
  )
}

export default App
