import { type Accessor, createMemo, Match, Show, Switch } from "solid-js"
import { useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { pipe, sumBy } from "remeda"
import { useTheme } from "@tui/context/theme"
import { SplitBorder, EmptyBorder } from "@tui/component/border"
import type { AssistantMessage, Session } from "@opencode-ai/sdk"
import { Global } from "@/global"

const Title = (props: { session: Accessor<Session> }) => {
  const { theme } = useTheme()
  return (
    <text fg={theme.text}>
      <span style={{ bold: true }}>#</span> <span style={{ bold: true }}>{props.session().title}</span>
    </text>
  )
}

const ContextInfo = (props: { context: Accessor<string | undefined>; cost: Accessor<string> }) => {
  const { theme } = useTheme()
  return (
    <Show when={props.context()}>
      <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
        {props.context()} ({props.cost()})
      </text>
    </Show>
  )
}

export function Header() {
  const route = useRouteData("session")
  const sync = useSync()
  const session = createMemo(() => sync.session.get(route.sessionID)!)
  const messages = createMemo(() => sync.data.message[route.sessionID] ?? [])
  const shareEnabled = createMemo(() => sync.data.config.share !== "disabled")

  const cost = createMemo(() => {
    const total = pipe(
      messages(),
      sumBy((x) => (x.role === "assistant" ? x.cost : 0)),
    )
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(total)
  })

  const context = createMemo(() => {
    const last = messages().findLast((x) => x.role === "assistant" && x.tokens.output > 0) as AssistantMessage
    if (!last) return
    const total =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = sync.data.provider.find((x) => x.id === last.providerID)?.models[last.modelID]
    let result = total.toLocaleString()
    if (model?.limit.context) {
      result += "  " + Math.round((total / model.limit.context) * 100) + "%"
    }
    return result
  })

  const { theme } = useTheme()

  const mcp = createMemo(() => Object.keys(sync.data.mcp))
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some((x) => x.status === "failed"))
  const lsp = createMemo(() => Object.keys(sync.data.lsp))

  return (
    <box flexShrink={0}>
      <box flexDirection="row" justifyContent="space-between" gap={1}>
        <text fg={theme.textMuted}>{process.cwd().replace(Global.Path.home, "~")}</text>
        <box gap={2} flexDirection="row" flexShrink={0}>
          <text fg={theme.text}>
            <span style={{ fg: theme.success }}>•</span> {lsp().length} LSP
          </text>
          <Show when={mcp().length}>
            <text fg={theme.text}>
              <Switch>
                <Match when={mcpError()}>
                  <span style={{ fg: theme.error }}>⊙ </span>
                </Match>
                <Match when={true}>
                  <span style={{ fg: theme.success }}>⊙ </span>
                </Match>
              </Switch>
              {mcp().length} MCP
            </text>
          </Show>
          <text fg={theme.textMuted}>/status</text>
        </box>
      </box>
      <box
        height={1}
        border={["bottom"]}
        borderColor={theme.backgroundElement}
        customBorderChars={
          theme.background.a != 0
            ? {
                ...EmptyBorder,
                horizontal: "▄",
              }
            : {
                ...EmptyBorder,
                horizontal: " ",
              }
        }
      />
      <box
        paddingLeft={2}
        paddingRight={1}
        {...SplitBorder}
        borderColor={theme.backgroundElement}
        flexShrink={0}
        backgroundColor={theme.backgroundElement}
      >
        <Show
          when={shareEnabled()}
          fallback={
            <box flexDirection="row" justifyContent="space-between" gap={1}>
              <Title session={session} />
              <ContextInfo context={context} cost={cost} />
            </box>
          }
        >
          <Title session={session} />
          <box flexDirection="row" justifyContent="space-between" gap={1}>
            <box flexGrow={1} flexShrink={1}>
              <Switch>
                <Match when={session().share?.url}>
                  <text fg={theme.textMuted} wrapMode="word">
                    {session().share!.url}
                  </text>
                </Match>
                <Match when={true}>
                  <text fg={theme.text} wrapMode="word">
                    /share <span style={{ fg: theme.textMuted }}>to create a shareable link</span>
                  </text>
                </Match>
              </Switch>
            </box>
            <ContextInfo context={context} cost={cost} />
          </box>
        </Show>
      </box>
      <box
        height={1}
        border={["bottom"]}
        borderColor={theme.backgroundElement}
        customBorderChars={
          theme.background.a != 0
            ? {
                ...EmptyBorder,
                horizontal: "▀",
              }
            : {
                ...EmptyBorder,
                horizontal: " ",
              }
        }
      />
    </box>
  )
}
