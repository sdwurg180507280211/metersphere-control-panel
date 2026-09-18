export const METERSPHERE_TABS = ['workspace', 'services', 'tasks', 'diagnosis', 'build', 'package', 'sql', 'config']
export const DEFAULT_ROUTE = { projectId: 'metersphere', tab: 'workspace' }

export function normalizeRoute(route = {}) {
  route = route || {}
  if (route.projectId === null) return { projectId: null, tab: 'overview' }
  const projectId = typeof route.projectId === 'string' && route.projectId ? route.projectId : 'metersphere'
  return {
    projectId,
    tab: projectId === 'metersphere' && METERSPHERE_TABS.includes(route.tab)
      ? route.tab
      : projectId === 'metersphere'
        ? 'workspace'
        : 'overview'
  }
}

export function parseProjectHash(hash, fallback = DEFAULT_ROUTE) {
  const value = hash.replace(/^#/, '')
  if (!value) return normalizeRoute(fallback)
  if (value === 'projects') return normalizeRoute({ projectId: null })
  if (METERSPHERE_TABS.includes(value)) return { projectId: 'metersphere', tab: value }
  const params = new URLSearchParams(value)
  if (!params.get('project')) return normalizeRoute(fallback)
  return normalizeRoute({ projectId: params.get('project'), tab: params.get('tab') })
}

export function projectHash(route) {
  const normalized = normalizeRoute(route)
  if (normalized.projectId === null) return '#projects'
  return `#${new URLSearchParams({ project: normalized.projectId, tab: normalized.tab })}`
}
