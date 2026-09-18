import type { App } from 'vue'

import { createPinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'

const pinia = createPinia()

/**
 * sessionStorage, or an in-memory stand-in when the browser refuses storage.
 *
 * Reading `sessionStorage` itself throws "Access to storage is not allowed from this
 * context" in a context that blocks it - a sandboxed frame, or storage disabled by policy -
 * and because this ran at module load it took the whole app down before anything rendered,
 * once per store. A per-tab object keeps the app usable: state simply does not survive a
 * reload there, which is exactly what "storage is unavailable" means.
 */
function safeStorage(): Storage {
  try {
    const probe = '__storage_probe__'
    sessionStorage.setItem(probe, '1')
    sessionStorage.removeItem(probe)
    return sessionStorage
  }
  catch {
    const memory = new Map<string, string>()
    return {
      get length() { return memory.size },
      clear: () => memory.clear(),
      getItem: (key: string) => memory.get(key) ?? null,
      key: (index: number) => [...memory.keys()][index] ?? null,
      removeItem: (key: string) => { memory.delete(key) },
      setItem: (key: string, value: string) => { memory.set(key, String(value)) },
    } as Storage
  }
}

const persistedState = createPersistedState({
  storage: safeStorage(),
})
pinia.use(persistedState)

export function setupPinia(app: App) {
  app.use(pinia)
}

export default pinia
