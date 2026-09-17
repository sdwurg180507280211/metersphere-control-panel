import { create } from 'zustand'
import { DEFAULT_ROUTE, normalizeRoute, parseProjectHash, projectHash } from '../projectNavigation'

const STORAGE_KEY = 'local-service-hub.navigation'
let saved = {}
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {} } catch { /* Use defaults. */ }
const initialRoute = parseProjectHash(window.location.hash, saved.route || DEFAULT_ROUTE)

export const useUiStore = create((set, get) => ({
  route: initialRoute,
  activeTab: initialRoute.projectId === 'metersphere' ? initialRoute.tab : normalizeRoute({ projectId: 'metersphere', tab: saved.meterSphereTab }).tab,
  navigate: (next, { replace = false } = {}) => {
    const route = normalizeRoute(next)
    const activeTab = route.projectId === 'metersphere' ? route.tab : get().activeTab
    set({ route, activeTab })
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ route, meterSphereTab: activeTab })) } catch { /* Session state still works. */ }
    const hash = projectHash(route)
    if (window.location.hash !== hash) window.history[replace ? 'replaceState' : 'pushState'](null, '', hash)
  }
}))
