import { create } from 'zustand'

const TAB_IDS = ['build', 'services', 'package', 'config', 'sql']

const getInitialTab = () => {
  const hash = window.location.hash.slice(1)
  if (TAB_IDS.includes(hash)) return hash

  const saved = localStorage.getItem('activeTab')
  if (saved && TAB_IDS.includes(saved)) return saved

  return 'build'
}

export const useUiStore = create((set, get) => ({
  activeTab: getInitialTab(),
  
  setActiveTab: (tabId) => {
    if (!TAB_IDS.includes(tabId) || tabId === get().activeTab) return

    set({ activeTab: tabId })
    localStorage.setItem('activeTab', tabId)
    
    // 同步到 URL Hash，但不触发额外的 hashchange 事件处理
    if (window.location.hash.slice(1) !== tabId) {
      window.history.pushState(null, '', `#${tabId}`)
    }
  },

  syncHash: () => {
    const hash = window.location.hash.slice(1)
    if (TAB_IDS.includes(hash) && hash !== get().activeTab) {
      set({ activeTab: hash })
      localStorage.setItem('activeTab', hash)
    }
  }
}))
