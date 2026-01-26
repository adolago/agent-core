import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"
import { Keybind } from "@/util/keybind"
import { pipe, mapValues } from "remeda"
import type { KeybindsConfig as SDKKeybindsConfig } from "@opencode-ai/sdk/v2"
import type { ParsedKey, Renderable } from "@opentui/core"
import { createStore } from "solid-js/store"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { createSimpleContext } from "./helper"

// Extended keybinds type with new keybinds not yet in SDK
export type KeybindsConfig = SDKKeybindsConfig & {
  model_fallback_toggle?: string
  model_provider_list?: string
  input_dictation_toggle?: string
  session_delegate?: string
  session_delete?: string
  stash_delete?: string
  messages_line_up?: string
  messages_line_down?: string
  grammar_quickfix?: string
}

export const { use: useKeybind, provider: KeybindProvider } = createSimpleContext({
  name: "Keybind",
  init: () => {
    const sync = useSync()
    const keybinds = createMemo(() => {
      return pipe(
        (sync.data.config.keybinds ?? {}) as KeybindsConfig,
        mapValues((value) => Keybind.parse(value)),
      ) as { [K in keyof KeybindsConfig]?: Keybind.Info[] }
    })
    const [store, setStore] = createStore({
      leader: false,
    })
    const renderer = useRenderer()

    let focus: Renderable | null
    function leader(active: boolean) {
      if (active) {
        setStore("leader", true)
        focus = renderer.currentFocusedRenderable
        focus?.blur()
        return
      }

      if (!active) {
        if (focus && !renderer.currentFocusedRenderable) {
          focus.focus()
        }
        setStore("leader", false)
      }
    }

    useKeyboard(async (evt) => {
      // Don't activate leader mode if an input/textarea is currently focused
      // This prevents Space (leader key) from interrupting typing
      const hasFocus = renderer.currentFocusedRenderable !== null
      if (!store.leader && !hasFocus && result.match("leader", evt)) {
        leader(true)
        return
      }

      // Only Escape dismisses the which-key popup without executing an action
      // Other keys are handled by individual components which call leader(false) explicitly
      if (store.leader && evt.name === "escape") {
        leader(false)
        return
      }
    })

    const result = {
      get all() {
        return keybinds()
      },
      get leader() {
        return store.leader
      },
      dismiss() {
        leader(false)
      },
      parse(evt: ParsedKey): Keybind.Info {
        // Handle special case for Ctrl+Underscore (represented as \x1F)
        if (evt.name === "\x1F") {
          return Keybind.fromParsedKey({ ...evt, name: "_", ctrl: true }, store.leader)
        }
        return Keybind.fromParsedKey(evt, store.leader)
      },
      match(key: keyof KeybindsConfig, evt: ParsedKey) {
        const keybind = keybinds()[key]
        if (!keybind) return false
        const parsed: Keybind.Info = result.parse(evt)
        for (const kb of keybind) {
          if (Keybind.match(kb, parsed)) {
            return true
          }
        }
      },
      print(key: keyof KeybindsConfig) {
        const first = keybinds()[key]?.at(0)
        if (!first) return ""
        const result = Keybind.toString(first)
        return result.replace("<leader>", Keybind.toString(keybinds().leader![0]!))
      },
    }
    return result
  },
})
