import { TextAttributes } from "@opentui/core"
import { For, createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useTheme } from "@tui/context/theme"

// Persona ASCII art banners
const PERSONA_ART: Record<string, string[]> = {
  zee: [
    "███████╗███████╗███████╗",
    "╚══███╔╝██╔════╝██╔════╝",
    "  ███╔╝ █████╗  █████╗  ",
    " ███╔╝  ██╔══╝  ██╔══╝  ",
    "███████╗███████╗███████╗",
    "╚══════╝╚══════╝╚══════╝",
  ],
  stanley: [
    "███████╗████████╗ █████╗ ███╗   ██╗██╗     ███████╗██╗   ██╗",
    "██╔════╝╚══██╔══╝██╔══██╗████╗  ██║██║     ██╔════╝╚██╗ ██╔╝",
    "███████╗   ██║   ███████║██╔██╗ ██║██║     █████╗   ╚████╔╝ ",
    "╚════██║   ██║   ██╔══██║██║╚██╗██║██║     ██╔══╝    ╚██╔╝  ",
    "███████║   ██║   ██║  ██║██║ ╚████║███████╗███████╗   ██║   ",
    "╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝   ╚═╝   ",
  ],
  johny: [
    "     ██╗ ██████╗ ██╗  ██╗███╗   ██╗██╗   ██╗",
    "     ██║██╔═══██╗██║  ██║████╗  ██║╚██╗ ██╔╝",
    "     ██║██║   ██║███████║██╔██╗ ██║ ╚████╔╝ ",
    "██   ██║██║   ██║██╔══██║██║╚██╗██║  ╚██╔╝  ",
    "╚█████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ",
    " ╚════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ",
  ],
}

export function Logo() {
  const local = useLocal()
  const { theme } = useTheme()

  const agent = createMemo(() => local.agent.current())
  const art = createMemo(() => PERSONA_ART[agent().name.toLowerCase()] || PERSONA_ART.zee)

  return (
    <box flexDirection="column" alignItems="center">
      <For each={art()}>
        {(line) => (
          <text fg={theme.primary} attributes={TextAttributes.BOLD} selectable={false}>
            {line}
          </text>
        )}
      </For>
    </box>
  )
}
