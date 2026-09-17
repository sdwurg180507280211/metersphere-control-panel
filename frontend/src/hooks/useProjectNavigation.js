import { useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useUiStore } from '../store/useUiStore'
import { useConfigStore } from '../store/useAppStore'
import { METERSPHERE_TABS, normalizeRoute, parseProjectHash, projectHash } from '../projectNavigation'

export function useProjectNavigation() {
  const { route, activeTab, navigate } = useUiStore()
  const dirty = useConfigStore((state) => state.dirtyFields.length > 0)

  const go = useCallback((next, options) => {
    const target = normalizeRoute(next)
    const current = useUiStore.getState().route
    if (projectHash(current) === projectHash(target)) return true
    const modal = [...document.querySelectorAll('dialog[open], .confirm-dialog-overlay, .panel-modal-overlay, .backend-prompt-overlay, .tunnel-dialog-overlay')].some((element) => element.getClientRects().length > 0)
    if (modal) {
      toast('请先完成或关闭当前对话框')
      return false
    }
    const config = useConfigStore.getState()
    if (current.projectId === 'metersphere' && current.tab === 'config') {
      if (config.saving || config.applying) {
        toast('配置正在保存或应用，请稍候')
        return false
      }
      if (config.dirtyFields.length && !window.confirm('MeterSphere 配置有未保存的修改。\n切换后草稿会保留，返回项目配置可继续编辑。\n\n确定切换吗？')) return false
    }
    navigate(target, options)
    return true
  }, [navigate])

  const selectProject = useCallback((projectId) => go({ projectId, tab: useUiStore.getState().activeTab }), [go])

  useEffect(() => {
    navigate(useUiStore.getState().route, { replace: true })
    const restore = () => {
      const current = useUiStore.getState().route
      if (!go(parseProjectHash(window.location.hash, current), { replace: true })) {
        window.history.replaceState(null, '', projectHash(current))
      }
    }
    const switchTab = (event) => {
      if (METERSPHERE_TABS.includes(event.detail)) go({ projectId: 'metersphere', tab: event.detail })
    }
    window.addEventListener('popstate', restore)
    window.addEventListener('hashchange', restore)
    window.addEventListener('switchTab', switchTab)
    const unsubscribe = window.desktopBridge?.onSelectProject?.((projectId) => selectProject(projectId))
    window.desktopBridge?.ready?.()
    return () => {
      window.removeEventListener('popstate', restore)
      window.removeEventListener('hashchange', restore)
      window.removeEventListener('switchTab', switchTab)
      unsubscribe?.()
    }
  }, [go, navigate, selectProject])

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  return { route, activeTab, go, selectProject, dirty }
}
