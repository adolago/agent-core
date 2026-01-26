import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useSync } from "@tui/context/sync"
import { createSimpleContext } from "./helper"

export type VimMode = "normal" | "insert"

export const { use: useVim, provider: VimProvider } = createSimpleContext({
  name: "Vim",
  init: () => {
    const sync = useSync()

    // Check if vim mode is enabled from config (default: true)
    const enabled = createMemo(() => {
      const tui = sync.data.config.tui as { vim?: { enabled?: boolean; start_in_insert?: boolean } } | undefined
      return tui?.vim?.enabled !== false
    })

    // Check if we should start in insert mode (default: false)
    const startInInsert = createMemo(() => {
      const tui = sync.data.config.tui as { vim?: { enabled?: boolean; start_in_insert?: boolean } } | undefined
      return tui?.vim?.start_in_insert === true
    })

    // Initialize mode: if vim disabled or start_in_insert, use insert; otherwise normal
    const [store, setStore] = createStore<{ mode: VimMode }>({
      mode: startInInsert() ? "insert" : "normal",
    })

    return {
      get enabled() {
        return enabled()
      },
      get mode() {
        return enabled() ? store.mode : ("insert" as VimMode)
      },
      get isNormal() {
        return enabled() && store.mode === "normal"
      },
      get isInsert() {
        return !enabled() || store.mode === "insert"
      },
      setMode(mode: VimMode) {
        if (!enabled()) return
        setStore("mode", mode)
      },
      enterNormal() {
        if (!enabled()) return
        setStore("mode", "normal")
      },
      enterInsert() {
        setStore("mode", "insert")
      },
    }
  },
})
