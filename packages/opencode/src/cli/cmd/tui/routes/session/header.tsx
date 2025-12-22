import { type Accessor, createMemo, Match, Show, Switch } from "solid-js"
import { useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import { SplitBorder } from "@tui/component/border"
import type { Session } from "@opencode-ai/sdk/v2"
import { useKeybind } from "../../context/keybind"

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
  const session = createMemo(() => sync.session.get(route.sessionID)!)
  const shareEnabled = createMemo(() => sync.data.config.share !== "disabled")
  const showShare = createMemo(() => shareEnabled() && !session()?.share?.url)

  const { theme } = useTheme()
  const keybind = useKeybind()

  return (
    <box flexShrink={0}>
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={1}
        {...SplitBorder}
        border={["left"]}
        borderColor={theme.border}
        flexShrink={0}
        backgroundColor={theme.backgroundPanel}
      >
        <Switch>
          <Match when={session()?.parentID}>
            <box flexDirection="row" gap={2}>
              <text fg={theme.text}>
                <b>Subagent session</b>
              </text>
              <text fg={theme.text}>
                Prev <span style={{ fg: theme.textMuted }}>{keybind.print("session_child_cycle_reverse")}</span>
              </text>
              <text fg={theme.text}>
                Next <span style={{ fg: theme.textMuted }}>{keybind.print("session_child_cycle")}</span>
              </text>
              <box flexGrow={1} flexShrink={1} />
              <Show when={showShare()}>
                <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
                  /share
                </text>
              </Show>
            </box>
          </Match>
          <Match when={true}>
            <box flexDirection="row" justifyContent="space-between" gap={1}>
              <Title session={session} />
              <Show when={showShare()}>
                <text fg={theme.textMuted} wrapMode="none" flexShrink={0}>
                  /share
                </text>
              </Show>
            </box>
          </Match>
        </Switch>
      </box>
    </box>
  )
}
