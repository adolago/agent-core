import { createMemo, For, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useKeybind, type KeybindsConfig } from "@tui/context/keybind"
import { useTerminalDimensions } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import { Keybind } from "@/util/keybind"

type KeybindEntry = {
  key: string
  action: string
  description: string
}

type KeybindCategory = {
  name: string
  entries: KeybindEntry[]
}

// Map keybind names to human-readable descriptions and categories
const KEYBIND_META: Record<string, { category: string; description: string }> = {
  // Session
  session_new: { category: "Session", description: "New session" },
  session_list: { category: "Session", description: "List sessions" },
  session_timeline: { category: "Session", description: "Timeline" },
  session_export: { category: "Session", description: "Export" },
  session_delete: { category: "Session", description: "Delete" },
  session_delegate: { category: "Session", description: "Delegate" },
  session_compact: { category: "Session", description: "Compact" },
  session_parent: { category: "Session", description: "Parent" },
  session_child_cycle: { category: "Session", description: "Next child" },
  session_child_cycle_reverse: { category: "Session", description: "Prev child" },

  // Messages
  messages_copy: { category: "Messages", description: "Copy" },
  messages_undo: { category: "Messages", description: "Undo" },
  messages_redo: { category: "Messages", description: "Redo" },
  messages_toggle_conceal: { category: "Messages", description: "Toggle code" },

  // Model
  model_list: { category: "Model", description: "List models" },
  model_provider_list: { category: "Model", description: "Providers" },
  variant_cycle: { category: "Model", description: "Cycle variant" },

  // Agent
  agent_list: { category: "Agent", description: "List agents" },

  // UI
  editor_open: { category: "UI", description: "External editor" },
  theme_list: { category: "UI", description: "Themes" },
  sidebar_toggle: { category: "UI", description: "Sidebar" },
  status_view: { category: "UI", description: "Status" },
  mode_toggle: { category: "UI", description: "Hold/Release" },
  tips_toggle: { category: "UI", description: "Tips" },

  // App
  app_exit: { category: "App", description: "Quit" },
}

// Category display order
const CATEGORY_ORDER = ["Session", "Messages", "Model", "Agent", "UI", "App"]

export function WhichKey() {
  const { theme } = useTheme()
  const keybind = useKeybind()
  const dimensions = useTerminalDimensions()

  // Get all leader-based keybindings grouped by category
  const categories = createMemo(() => {
    const all = keybind.all as Record<string, Keybind.Info[] | undefined>
    const result: Map<string, KeybindEntry[]> = new Map()

    for (const [name, bindings] of Object.entries(all)) {
      if (!bindings || bindings.length === 0) continue

      // Find bindings that use leader key
      const leaderBinding = bindings.find((b) => b.leader)
      if (!leaderBinding) continue

      const meta = KEYBIND_META[name]
      if (!meta) continue

      const keyStr = leaderBinding.name || ""
      if (!keyStr) continue

      // Format the key display (add modifiers if any)
      let display = keyStr.toUpperCase()
      if (leaderBinding.shift) display = "⇧" + display
      if (leaderBinding.ctrl) display = "^" + display
      if (leaderBinding.meta) display = "⌥" + display

      const entries = result.get(meta.category) || []
      entries.push({
        key: display,
        action: name,
        description: meta.description,
      })
      result.set(meta.category, entries)
    }

    // Sort entries within each category by key
    for (const entries of result.values()) {
      entries.sort((a, b) => a.key.localeCompare(b.key))
    }

    // Convert to array and sort by category order
    const categorized: KeybindCategory[] = []
    for (const categoryName of CATEGORY_ORDER) {
      const entries = result.get(categoryName)
      if (entries && entries.length > 0) {
        categorized.push({ name: categoryName, entries })
      }
    }

    return categorized
  })

  // Calculate layout - try to fit in available width
  const columnWidth = 20
  const maxColumns = createMemo(() => Math.max(1, Math.floor((dimensions().width - 4) / columnWidth)))

  return (
    <Show when={keybind.leader}>
      <box
        position="absolute"
        bottom={4}
        left={0}
        width={dimensions().width}
        justifyContent="center"
        alignItems="center"
      >
        <box
          backgroundColor={theme.backgroundPanel}
          border={["top", "bottom", "left", "right"]}
          borderColor={theme.border}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={0}
          paddingBottom={0}
          maxWidth={Math.min(dimensions().width - 4, maxColumns() * columnWidth + 4)}
        >
          <box flexDirection="column" gap={0}>
            {/* Header */}
            <box paddingBottom={0}>
              <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                Which Key?
              </text>
              <text fg={theme.textMuted}> (press key to execute)</text>
            </box>

            {/* Categories in columns */}
            <box flexDirection="row" flexWrap="wrap" gap={2}>
              <For each={categories()}>
                {(category) => (
                  <box flexDirection="column" minWidth={columnWidth - 2}>
                    <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                      {category.name}
                    </text>
                    <For each={category.entries}>
                      {(entry) => (
                        <box flexDirection="row" gap={1}>
                          <text fg={theme.warning} attributes={TextAttributes.BOLD}>
                            {entry.key.padEnd(3)}
                          </text>
                          <text fg={theme.text}>{entry.description}</text>
                        </box>
                      )}
                    </For>
                  </box>
                )}
              </For>
            </box>
          </box>
        </box>
      </box>
    </Show>
  )
}
