import { useRef } from 'react'
import WorkspaceHome from './components/WorkspaceHome'
import ServicesTab from './components/ServicesTab'
import TasksTab from './components/TasksTab'
import DiagnosisTab from './components/DiagnosisTab'
import BuildTab from './components/BuildTab'
import PackageTab from './components/PackageTab'
import ConfigTab from './components/ConfigTab'
import SqlTab from './components/SqlTab'
import TabTransition from './components/TabTransition'
import './styles/App.css'

export const TAB_ITEMS = [
  { id: 'workspace', label: '开发工作台', icon: '⌂' },
  { id: 'services', label: '服务管理', icon: '◉' },
  { id: 'tasks', label: '任务中心', icon: '◎' },
  { id: 'diagnosis', label: '诊断中心', icon: '◇' },
  { id: 'build', label: '前端构建', icon: '▦' },
  { id: 'package', label: '整体打包', icon: '▣' },
  { id: 'sql', label: 'SQL 查询', icon: '≡' },
  { id: 'config', label: '项目配置', icon: '⚙' }
]

// Navigation and realtime connections belong to the console, not this panel.
export default function App({ activeTab = 'workspace', isActive = true }) {
  const searchInputRef = useRef(null)

  return (
    <div className="app console-ms-workspace">
      <section className="workspace-surface" aria-label="MeterSphere 工作区">
        <div className="content">
          <TabTransition activeTab={activeTab} tabId="workspace"><WorkspaceHome isActive={isActive && activeTab === 'workspace'} /></TabTransition>
          <TabTransition activeTab={activeTab} tabId="services"><ServicesTab searchInputRef={searchInputRef} /></TabTransition>
          <TabTransition activeTab={activeTab} tabId="tasks"><TasksTab isActive={isActive && activeTab === 'tasks'} /></TabTransition>
          <TabTransition activeTab={activeTab} tabId="diagnosis"><DiagnosisTab isActive={isActive && activeTab === 'diagnosis'} /></TabTransition>
          <TabTransition activeTab={activeTab} tabId="build"><BuildTab searchInputRef={searchInputRef} isActive={isActive && activeTab === 'build'} /></TabTransition>
          <TabTransition activeTab={activeTab} tabId="package"><PackageTab searchInputRef={searchInputRef} /></TabTransition>
          <TabTransition activeTab={activeTab} tabId="sql"><SqlTab /></TabTransition>
          <TabTransition activeTab={activeTab} tabId="config"><ConfigTab /></TabTransition>
        </div>
      </section>
    </div>
  )
}
