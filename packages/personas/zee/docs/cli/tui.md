---
summary: "CLI reference for `zee tui` (terminal UI connected to the Gateway)"
read_when:
  - You want a terminal UI for the Gateway (remote-friendly)
  - You want to pass url/token/session from scripts
---

# `zee tui`

Open the terminal UI (agent-core TUI). `zee tui` delegates to agent-core.

Related:
- TUI guide: [TUI](/tui)

## Examples

```bash
agent-core
AGENT_CORE_URL=http://127.0.0.1:3210 agent-core
zee tui --session main
```
