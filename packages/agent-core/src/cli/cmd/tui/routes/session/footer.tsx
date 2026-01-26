import { createMemo, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useDirectory } from "../../context/directory"
import { useConnected } from "../../component/dialog-model"
import { createStore } from "solid-js/store"
import { useRoute } from "../../context/route"
import { useLocal } from "../../context/local"

export function Footer() {
  const { theme } = useTheme()
  const sync = useSync()
  const route = useRoute()
  const local = useLocal()
  const mcp = createMemo(() => Object.values(sync.data.mcp).filter((x) => x.status === "connected").length)
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some((x) => x.status === "failed"))
  const lsp = createMemo(() => Object.keys(sync.data.lsp))
  const internet = createMemo(() => sync.data.health.internet)
  const connectedProviders = createMemo(() => sync.data.health.providers.filter((p) => p.status === "ok").length)
  const permissions = createMemo(() => {
    if (route.data.type !== "session") return []
    return sync.data.permission[route.data.sessionID] ?? []
  })
  // Stream health indicator for current session
  const streamHealth = createMemo(() => {
    if (route.data.type !== "session") return undefined
    const status = sync.data.session_status?.[route.data.sessionID]
    if (!status || status.type !== "busy") return undefined
    return status.streamHealth
  })
  const directory = useDirectory()
  const connected = useConnected()

  const [store, setStore] = createStore({
    welcome: false,
  })

  onMount(() => {
    // Track all timeouts to ensure proper cleanup
    const timeouts: ReturnType<typeof setTimeout>[] = []

    function tick() {
      if (connected()) return
      if (!store.welcome) {
        setStore("welcome", true)
        timeouts.push(setTimeout(() => tick(), 5000))
        return
      }

      if (store.welcome) {
        setStore("welcome", false)
        timeouts.push(setTimeout(() => tick(), 10_000))
        return
      }
    }
    timeouts.push(setTimeout(() => tick(), 10_000))

    onCleanup(() => {
      timeouts.forEach(clearTimeout)
    })
  })

  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
      <text fg={theme.textMuted}>{directory()}</text>
      <box gap={2} flexDirection="row" flexShrink={0}>
        <Switch>
          <Match when={store.welcome}>
            <text fg={theme.text}>
              Get started <span style={{ fg: theme.textMuted }}>:connect</span>
            </text>
          </Match>
          <Match when={connected()}>
            <text fg={local.mode.isHold() ? theme.warning : theme.success}>
              {local.mode.isHold() ? "HOLD" : "RELEASE"}
            </text>
            <Show when={permissions().length > 0}>
              <text fg={theme.warning}>
                <span style={{ fg: theme.warning }}>△</span> {permissions().length} Permission
                {permissions().length > 1 ? "s" : ""}
              </text>
            </Show>
            <Show when={streamHealth()}>
              {(() => {
                const health = streamHealth()!
                const elapsed = health.timeSinceLastEventMs ?? 0
                const elapsedSeconds = Math.round(elapsed / 1000)

                // Progressive timeout indicators
                if (health.isStalled) {
                  // 60s+ = Hard stall
                  return (
                    <text fg={theme.error}>
                      <span style={{ fg: theme.error }}>⛔</span> Stream stalled ({elapsedSeconds}s)
                    </text>
                  )
                }

                if (health.isThinking) {
                  // Extended thinking mode - show time since meaningful content
                  const thinkingSeconds = Math.round((health.timeSinceContentMs ?? 0) / 1000)
                  return (
                    <text fg={theme.warning}>
                      <span style={{ fg: theme.warning }}>🧠</span> Thinking... ({thinkingSeconds}s without output)
                    </text>
                  )
                }

                // Progressive warnings based on elapsed time
                if (elapsed >= 45_000) {
                  // 45s+ = Critical warning
                  return (
                    <text fg={theme.error}>
                      <span style={{ fg: theme.error }}>⚠</span> Response delayed ({elapsedSeconds}s)
                    </text>
                  )
                }

                if (elapsed >= 30_000) {
                  // 30s+ = Warning
                  return (
                    <text fg={theme.warning}>
                      <span style={{ fg: theme.warning }}>⏳</span> Waiting for response ({elapsedSeconds}s)
                    </text>
                  )
                }

                // No indicator for < 30s (normal streaming)
                return null
              })()}
            </Show>
            <text fg={theme.text}>
              <Switch>
                <Match when={internet() === "ok"}>
                  <span style={{ fg: theme.success }}>◉</span>
                </Match>
                <Match when={internet() === "fail"}>
                  <span style={{ fg: theme.error }}>◉</span>
                </Match>
                <Match when={internet() === "checking"}>
                  <span style={{ fg: theme.textMuted }}>◉</span>
                </Match>
              </Switch>
              {" "}NET
            </text>
            <Show when={connectedProviders() > 0}>
              <text fg={theme.text}>
                <span style={{ fg: theme.success }}>◈</span> {connectedProviders()} LLM
              </text>
            </Show>
            <text fg={theme.text}>
              <span style={{ fg: lsp().length > 0 ? theme.success : theme.textMuted }}>•</span> {lsp().length} LSP
            </text>
            <Show when={route.data.type === "session" && local.parameters.hasOverrides(route.data.sessionID)}>
              <text fg={theme.accent}>⚙ params</text>
            </Show>
            <Show when={mcp()}>
              <text fg={theme.text}>
                <Switch>
                  <Match when={mcpError()}>
                    <span style={{ fg: theme.error }}>⊙ </span>
                  </Match>
                  <Match when={true}>
                    <span style={{ fg: theme.success }}>⊙ </span>
                  </Match>
                </Switch>
                {mcp()} MCP
              </text>
            </Show>
            <text fg={theme.textMuted}>:status</text>
          </Match>
        </Switch>
      </box>
    </box>
  )
}
