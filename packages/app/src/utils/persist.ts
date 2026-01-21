import { usePlatform } from "@/context/platform"
import { makePersisted, type AsyncStorage, type SyncStorage } from "@solid-primitives/storage"
import { checksum } from "@opencode-ai/util/encode"
import { createResource, type Accessor } from "solid-js"
import type { SetStoreFunction, Store } from "solid-js/store"

type InitType = Promise<string> | string | null
type PersistedWithReady<T> = [Store<T>, SetStoreFunction<T>, InitType, Accessor<boolean>]

type PersistTarget = {
  storage?: string
  key: string
  legacy?: string[]
  legacyStorage?: string[]
  migrate?: (value: unknown) => unknown
}

const LEGACY_STORAGE = "default.dat"
const LEGACY_GLOBAL_STORAGE = "opencode.global.dat"
const GLOBAL_STORAGE = "agent-core.global.dat"
const LEGACY_WORKSPACE_PREFIX = "opencode.workspace"
const WORKSPACE_PREFIX = "agent-core.workspace"

function snapshot(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function merge(defaults: unknown, value: unknown): unknown {
  if (value === undefined) return defaults
  if (value === null) return value

  if (Array.isArray(defaults)) {
    if (Array.isArray(value)) return value
    return defaults
  }

  if (isRecord(defaults)) {
    if (!isRecord(value)) return defaults

    const result: Record<string, unknown> = { ...defaults }
    for (const key of Object.keys(value)) {
      if (key in defaults) {
        result[key] = merge((defaults as Record<string, unknown>)[key], (value as Record<string, unknown>)[key])
      } else {
        result[key] = (value as Record<string, unknown>)[key]
      }
    }
    return result
  }

  return value
}

function parse(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function workspaceStorage(dir: string) {
  const head = dir.slice(0, 12) || "workspace"
  const sum = checksum(dir) ?? "0"
  return `${WORKSPACE_PREFIX}.${head}.${sum}.dat`
}

function legacyWorkspaceStorage(dir: string) {
  const head = dir.slice(0, 12) || "workspace"
  const sum = checksum(dir) ?? "0"
  return `${LEGACY_WORKSPACE_PREFIX}.${head}.${sum}.dat`
}

function localStorageWithPrefix(prefix: string): SyncStorage {
  const base = `${prefix}:`
  return {
    getItem: (key) => localStorage.getItem(base + key),
    setItem: (key, value) => localStorage.setItem(base + key, value),
    removeItem: (key) => localStorage.removeItem(base + key),
  }
}

export const Persist = {
  global(key: string, legacy?: string[]): PersistTarget {
    return { storage: GLOBAL_STORAGE, key, legacy, legacyStorage: [LEGACY_GLOBAL_STORAGE] }
  },
  workspace(dir: string, key: string, legacy?: string[]): PersistTarget {
    return {
      storage: workspaceStorage(dir),
      key: `workspace:${key}`,
      legacy,
      legacyStorage: [legacyWorkspaceStorage(dir)],
    }
  },
  session(dir: string, session: string, key: string, legacy?: string[]): PersistTarget {
    return {
      storage: workspaceStorage(dir),
      key: `session:${session}:${key}`,
      legacy,
      legacyStorage: [legacyWorkspaceStorage(dir)],
    }
  },
  scoped(dir: string, session: string | undefined, key: string, legacy?: string[]): PersistTarget {
    if (session) return Persist.session(dir, session, key, legacy)
    return Persist.workspace(dir, key, legacy)
  },
}

export function removePersisted(target: { storage?: string; key: string }) {
  const platform = usePlatform()
  const isDesktop = platform.platform === "desktop" && !!platform.storage

  if (isDesktop) {
    return platform.storage?.(target.storage)?.removeItem(target.key)
  }

  if (!target.storage) {
    localStorage.removeItem(target.key)
    return
  }

  localStorageWithPrefix(target.storage).removeItem(target.key)
}

export function persisted<T>(
  target: string | PersistTarget,
  store: [Store<T>, SetStoreFunction<T>],
): PersistedWithReady<T> {
  const platform = usePlatform()
  const config: PersistTarget = typeof target === "string" ? { key: target } : target

  const defaults = snapshot(store[0])
  const legacyKeys = config.legacy ?? []
  const legacyStorageNames = config.legacyStorage ?? []

  const isDesktop = platform.platform === "desktop" && !!platform.storage

  const currentStorage = (() => {
    if (isDesktop) return platform.storage?.(config.storage)
    if (!config.storage) return localStorage
    return localStorageWithPrefix(config.storage)
  })()

  const storage = (() => {
    if (!isDesktop) {
      const current = currentStorage as SyncStorage
      const legacyStores: Array<{ store: SyncStorage; includeKey: boolean }> = []
      legacyStores.push({ store: localStorage, includeKey: localStorage !== current })
      for (const legacyStorageName of legacyStorageNames) {
        legacyStores.push({ store: localStorageWithPrefix(legacyStorageName), includeKey: true })
      }

      const api: SyncStorage = {
        getItem: (key) => {
          const raw = current.getItem(key)
          if (raw !== null) {
            const parsed = parse(raw)
            if (parsed === undefined) return raw

            const migrated = config.migrate ? config.migrate(parsed) : parsed
            const merged = merge(defaults, migrated)
            const next = JSON.stringify(merged)
            if (raw !== next) current.setItem(key, next)
            return next
          }

          for (const { store: legacyStore, includeKey } of legacyStores) {
            const keysToCheck = includeKey ? [key, ...legacyKeys] : legacyKeys
            for (const legacyKey of keysToCheck) {
              const legacyRaw = legacyStore.getItem(legacyKey)
              if (legacyRaw === null) continue

              current.setItem(key, legacyRaw)
              legacyStore.removeItem(legacyKey)

              const parsed = parse(legacyRaw)
              if (parsed === undefined) return legacyRaw

              const migrated = config.migrate ? config.migrate(parsed) : parsed
              const merged = merge(defaults, migrated)
              const next = JSON.stringify(merged)
              if (legacyRaw !== next) current.setItem(key, next)
              return next
            }
          }

          return null
        },
        setItem: (key, value) => {
          current.setItem(key, value)
        },
        removeItem: (key) => {
          current.removeItem(key)
        },
      }

      return api
    }

    const current = currentStorage as AsyncStorage
    const legacyStores: Array<{ store: AsyncStorage; includeKey: boolean }> = []
    const desktopStorage = platform.storage as ((name?: string) => AsyncStorage | undefined) | undefined
    const baseLegacy = !config.storage ? desktopStorage?.() : desktopStorage?.(LEGACY_STORAGE)
    if (baseLegacy) legacyStores.push({ store: baseLegacy, includeKey: baseLegacy !== current })
    for (const legacyStorageName of legacyStorageNames) {
      const store = desktopStorage?.(legacyStorageName)
      if (store) legacyStores.push({ store, includeKey: store !== current })
    }

    const api: AsyncStorage = {
      getItem: async (key) => {
        const raw = await current.getItem(key)
        if (raw !== null) {
          const parsed = parse(raw)
          if (parsed === undefined) return raw

          const migrated = config.migrate ? config.migrate(parsed) : parsed
          const merged = merge(defaults, migrated)
          const next = JSON.stringify(merged)
          if (raw !== next) await current.setItem(key, next)
          return next
        }

        for (const { store: legacyStore, includeKey } of legacyStores) {
          const keysToCheck = includeKey ? [key, ...legacyKeys] : legacyKeys
          for (const legacyKey of keysToCheck) {
            const legacyRaw = await legacyStore.getItem(legacyKey)
            if (legacyRaw === null) continue

            await current.setItem(key, legacyRaw)
            await legacyStore.removeItem(legacyKey)

            const parsed = parse(legacyRaw)
            if (parsed === undefined) return legacyRaw

            const migrated = config.migrate ? config.migrate(parsed) : parsed
            const merged = merge(defaults, migrated)
            const next = JSON.stringify(merged)
            if (legacyRaw !== next) await current.setItem(key, next)
            return next
          }
        }

        return null
      },
      setItem: async (key, value) => {
        await current.setItem(key, value)
      },
      removeItem: async (key) => {
        await current.removeItem(key)
      },
    }

    return api
  })()

  const [state, setState, init] = makePersisted(store, { name: config.key, storage })

  const isAsync = init instanceof Promise
  const [ready] = createResource(
    () => init,
    async (initValue) => {
      if (initValue instanceof Promise) await initValue
      return true
    },
    { initialValue: !isAsync },
  )

  return [state, setState, init, () => ready() === true]
}
