let cachedPassword = null
let expiryTime = null
const CACHE_DURATION = 30 * 60 * 1000 // 30分钟

export const passwordCache = {
  set(password) {
    cachedPassword = password
    expiryTime = Date.now() + CACHE_DURATION
  },

  get() {
    if (!cachedPassword || !expiryTime || Date.now() > expiryTime) {
      this.clear()
      return null
    }
    return cachedPassword
  },

  clear() {
    cachedPassword = null
    expiryTime = null
  },

  isValid() {
    return !!this.get()
  }
}
