import { TextAttributes } from "@opentui/core"
import { Theme } from "../context/theme"
import { useSDK } from "../context/sdk"
import { createResource, For, Match, onMount, Switch } from "solid-js"
import { useDialog } from "../ui/dialog"

export type DialogStatusProps = {}

export function DialogStatus() {
  const sdk = useSDK()
  const dialog = useDialog()

  const [mcp] = createResource(async () => {
    const result = await sdk.mcp.status()
    return result.data
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD}>Status</text>
        <text fg={Theme.textMuted}>esc</text>
      </box>
      <box>
        <text>{Object.values(mcp() ?? {}).length} MCP Servers</text>
        <For each={Object.entries(mcp() ?? {})}>
          {([key, item]) => (
            <box flexDirection="row" gap={1}>
              <text
                flexShrink={0}
                style={{
                  fg: {
                    connected: Theme.success,
                    failed: Theme.error,
                    disabled: Theme.textMuted,
                  }[item.status],
                }}
              >
                •
              </text>
              <text wrapMode="word">
                <b>{key}</b>{" "}
                <span style={{ fg: Theme.textMuted }}>
                  <Switch>
                    <Match when={item.status === "connected"}>Connected</Match>
                    <Match when={item.status === "failed" && item}>{(val) => val().error}</Match>
                    <Match when={item.status === "disabled"}>Disabled in configuration</Match>
                  </Switch>
                </span>
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
