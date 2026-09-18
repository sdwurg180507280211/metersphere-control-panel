import { create } from 'zustand'

let activeRequest = null

function apiError(data, fallback) {
  const error = data?.error
  if (typeof error === 'string') return error
  return error?.message || fallback
}

export const useWorkspaceStore = create((set, get) => ({
  snapshot: null,
  loading: false,
  error: null,
  lastLoadedAt: null,

  fetchSnapshot: async ({ deep = true, force = false } = {}) => {
    if (activeRequest && !force) return activeRequest

    const request = (async () => {
      set({ loading: true, error: null })
      try {
        const res = await fetch(`/api/projects/metersphere/workspace?deep=${deep ? '1' : '0'}`)
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(apiError(data, '加载开发工作区失败'))
        }

        set({
          snapshot: data.data,
          error: null,
          lastLoadedAt: new Date().toISOString()
        })
        return data.data
      } catch (error) {
        set({ error: error.message || '加载开发工作区失败' })
        throw error
      } finally {
        if (activeRequest === request) activeRequest = null
        set({ loading: false })
      }
    })()

    activeRequest = request
    return request
  },

  refresh: (options = {}) => get().fetchSnapshot({ ...options, force: true })
}))
