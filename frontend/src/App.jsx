import { useEffect, useCallback, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { useWebSocket } from './hooks/useWebSocket'
import { useServiceStore, useBuildStore, useLogStore, usePackageStore, useConfigStore } from './store/useAppStore'
import { useUiStore } from './store/useUiStore'
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
  const { activeTab, setActiveTab, syncHash } = useUiStore()
  const searchInputRef = useRef(null)

  const { fetchServices, fetchCatalog } = useServiceStore()
  const { fetchModules, fetchActiveBuilds } = useBuildStore()
  const { fetchOptions: fetchPackageOptions, fetchActiveTask: fetchActivePackageTask } = usePackageStore()
  const { clearServiceLogs, clearBuildLogs, clearPackageLogs } = useLogStore()
  const { fetchConfig, dirtyFields, saving, applying } = useConfigStore()
  const hasUnsavedConfigChanges = dirtyFields.length > 0 && !saving && !applying
  const activeTabMeta = TAB_ITEMS.find((item) => item.id === activeTab) || TAB_ITEMS[0]

  useWebSocket()

  // 处理浏览器 Hash 变化 (前进/后退)
  useEffect(() => {
    const handlePopState = () => {
      const nextTab = window.location.hash.slice(1)
      if (nextTab && nextTab !== activeTab) {
        // 如果是 config 页有未保存变更，需要特殊处理
        if (activeTab === 'config' && hasUnsavedConfigChanges) {
          const shouldLeave = window.confirm('配置页有未保存变更，确定离开当前页面吗？')
          if (!shouldLeave) {
            // 回滚 Hash 到当前页
            window.history.pushState(null, '', `#${activeTab}`)
            return
          }
        }
        syncHash()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [activeTab, hasUnsavedConfigChanges, syncHash])

  // 初始化设置 Hash
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#${activeTab}`)
    }
  }, [activeTab])

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
  }, [activeTab, hasUnsavedConfigChanges, setActiveTab])

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
