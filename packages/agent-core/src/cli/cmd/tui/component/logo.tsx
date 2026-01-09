import { TextAttributes } from "@opentui/core"
import { For, createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"

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

  const agent = createMemo(() => local.agent.current())
  const color = createMemo(() => local.agent.color(agent().name))
  const art = createMemo(() => PERSONA_ART[agent().name.toLowerCase()] || PERSONA_ART.zee)

  return (
    <box flexDirection="column" alignItems="center">
      <For each={art()}>
        {(line) => (
          <text fg={color()} attributes={TextAttributes.BOLD} selectable={false}>
            {line}
          </text>
        )}
      </For>
    </box>
  )
}
