import { type Accessor, createMemo, For, Match, Switch } from "solid-js"
import { useRouteData, useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { SplitBorder } from "@tui/component/border"
import type { Session } from "@opencode-ai/sdk/v2"
import { useKeybind } from "../../context/keybind"
import { Locale } from "@/util/locale"

const Title = (props: { session: Accessor<Session> }) => {
  const { theme } = useTheme()
  return (
    <text fg={theme.text}>
      <span style={{ bold: true }}>#</span> <span style={{ bold: true }}>{props.session().title}</span>
    </text>
  )
}


export function Header() {
  const route = useRouteData("session")
  const sync = useSync()
  const { navigate } = useRoute()
  const session = createMemo(() => sync.session.get(route.sessionID)!)
  // Build ancestry chain for breadcrumbs
  const ancestry = createMemo(() => {
    const chain: Session[] = []
    let current = session()
    while (current?.parentID) {
      const parent = sync.data.session.find((s) => s.id === current!.parentID)
      if (!parent) break
      chain.unshift(parent)
      current = parent
    }
    return chain
  })


  const { theme } = useTheme()
  const keybind = useKeybind()

  return (
    <box flexShrink={0}>
      <box
        paddingTop={0}
        paddingBottom={0}
        paddingLeft={1}
        paddingRight={1}
        {...SplitBorder}
        border={["left"]}
        borderColor={theme.border}
        flexShrink={0}
        backgroundColor={theme.backgroundPanel}
      >
        <Switch>
          <Match when={session()?.parentID}>
            <box flexDirection="column" gap={0}>
              <box flexDirection="row" gap={1} alignItems="center">
                <For each={ancestry()}>
                  {(ancestor) => (
                    <>
                      <text fg={theme.accent} onMouseDown={() => navigate({ type: "session", sessionID: ancestor.id })}>
                        {Locale.truncateMiddle(ancestor.title ?? "Session", 20)}
                      </text>
                      <text fg={theme.textMuted}>&gt;</text>
                    </>
                  )}
                </For>
                <text fg={theme.text}>
                  <b>{Locale.truncateMiddle(session()?.title ?? "Current", 20)}</b>
                </text>
                <box flexGrow={1} flexShrink={1} />
              </box>
              <box flexDirection="row" gap={2}>
                <text fg={theme.textMuted}>
                  Parent <span style={{ fg: theme.border }}>{keybind.print("session_parent")}</span>
                </text>
                <text fg={theme.textMuted}>
                  Prev <span style={{ fg: theme.border }}>{keybind.print("session_child_cycle_reverse")}</span>
                </text>
                <text fg={theme.textMuted}>
                  Next <span style={{ fg: theme.border }}>{keybind.print("session_child_cycle")}</span>
                </text>
              </box>
            </box>
          </Match>
          <Match when={true}>
            <box flexDirection="row" justifyContent="space-between" gap={1}>
              <Title session={session} />
            </box>
          </Match>
        </Switch>
      </box>
    </box>
  )
}
