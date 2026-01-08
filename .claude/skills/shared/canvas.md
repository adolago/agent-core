# Canvas TUI Integration (Shared)

WezTerm-native canvas rendering available to all personas (Zee, Stanley, Johny).

## Overview

Canvas provides TUI (Terminal UI) displays in WezTerm panes. The sidecar daemon manages canvas lifecycle - spawning, updating, and closing canvases via IPC.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ WezTerm                                             │
│ ┌──────────────────┐  ┌──────────────────────────┐ │
│ │ OpenCode TUI     │  │ Canvas Pane              │ │
│ │                  │  │ (67% width)              │ │
│ │                  │  │                          │ │
│ │ Use canvas tools │  │  ╭─────── Notes ───────╮ │ │
│ │ to display here →│  │  │ Your content here   │ │ │
│ │                  │  │  ╰─────────────────────╯ │ │
│ └────────┬─────────┘  └──────────────────────────┘ │
│          │                        ↑                │
│          │ IPC                    │ Render         │
│          ▼                        │                │
│ ┌─────────────────────────────────┴──────────────┐ │
│ │           Sidecar Daemon                        │ │
│ │  • Canvas Manager                              │ │
│ │  • LSP Server                                  │ │
│ │  • Tiara Orchestrator                          │ │
│ └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Tools

| Tool | Description |
|------|-------------|
| `shared:canvas-show` | Display/focus a canvas in WezTerm pane |
| `shared:canvas-spawn` | Spawn canvas with initial configuration |
| `shared:canvas-update` | Update canvas content/config |
| `shared:canvas-close` | Close a canvas |
| `shared:canvas-selection` | Get user selection from interactive canvas |
| `shared:canvas-list` | List all active canvases |

## Canvas Types

### Text
Simple text display with title and bordered content.

```json
{
  "tool": "shared:canvas-spawn",
  "arguments": {
    "kind": "text",
    "id": "notes",
    "config": "{\"title\": \"My Notes\", \"content\": \"Hello world!\"}"
  }
}
```

### Calendar
Monthly calendar view with event highlighting.

```json
{
  "tool": "shared:canvas-spawn",
  "arguments": {
    "kind": "calendar",
    "id": "cal-1",
    "config": "{\"date\": \"2024-01-15\", \"events\": [{\"date\": \"2024-01-20\", \"title\": \"Meeting\"}]}"
  }
}
```

### Document
Markdown-like document rendering with headers, lists, and code blocks.

```json
{
  "tool": "shared:canvas-spawn",
  "arguments": {
    "kind": "document",
    "id": "doc-1",
    "config": "{\"title\": \"README\", \"content\": \"# Hello\\n\\nThis is markdown.\"}"
  }
}
```

### Table
Tabular data display with headers and rows.

```json
{
  "tool": "shared:canvas-spawn",
  "arguments": {
    "kind": "table",
    "id": "data-1",
    "config": "{\"title\": \"Portfolio\", \"headers\": [\"Symbol\", \"Shares\", \"Value\"], \"rows\": [[\"AAPL\", \"100\", \"$15,000\"]]}"
  }
}
```

## WezTerm Keybindings

| Key | Action |
|-----|--------|
| `LEADER + c` | Canvas actions menu |
| `LEADER + a` | Agent actions (includes canvas) |

## Daemon Requirement

Canvas requires the sidecar daemon to be running:

```bash
# Start daemon
bun run src/daemon/index.ts

# Or via CLI
npx tsx .claude/skills/personas/scripts/personas-daemon.ts start
```

## IPC Protocol

Canvas uses the daemon's IPC socket for communication:

```bash
# Socket path
~/.zee/agent-core/daemon.sock

# Example: Spawn a calendar
echo '{"id":"1","method":"canvas:spawn","params":{"kind":"calendar","id":"cal-1"}}' | nc -U ~/.zee/agent-core/daemon.sock

# Example: List canvases
echo '{"id":"2","method":"canvas:list","params":{}}' | nc -U ~/.zee/agent-core/daemon.sock
```

## Configuration

Canvas manager configuration (in daemon):

```typescript
{
  defaultWidth: 0.67,      // 67% of terminal width
  reusePane: true,         // Reuse single canvas pane
  splitDirection: "right"  // Split to the right
}
```

## Implementation Notes

- **No external dependencies** - Uses WezTerm CLI and ANSI escape codes
- **Pane reuse** - Single canvas pane is reused to avoid clutter
- **Native rendering** - Text, calendar, document, table rendered with box-drawing chars
- **IPC-based** - All operations go through daemon IPC for consistency
