# Canvas TUI Integration (Shared)

WezTerm-powered canvas rendering available to all personas (Zee, Stanley, Johny).

## Tools

- `shared:canvas-show` - Display a canvas in WezTerm pane
- `shared:canvas-spawn` - Spawn canvas with initial config
- `shared:canvas-update` - Update canvas configuration
- `shared:canvas-selection` - Get user selection from canvas

## Canvas Types

- `text` - Simple text display
- `calendar` - Calendar views
- `document` - Document rendering
- `flight` - Flight information

## Scenarios

- `display` - Read-only display
- `edit` - Editable interface
- `meeting-picker` - Meeting selection

## Usage Examples

### Display a text canvas
```json
{
  "tool": "shared:canvas-show",
  "arguments": {
    "kind": "text",
    "id": "notes",
    "scenario": "edit"
  }
}
```

### Show a calendar
```json
{
  "tool": "shared:canvas-show",
  "arguments": {
    "kind": "calendar",
    "id": "cal-1",
    "scenario": "display"
  }
}
```

### Spawn with config
```json
{
  "tool": "shared:canvas-spawn",
  "arguments": {
    "kind": "text",
    "id": "portfolio",
    "config": "{\"title\": \"Positions\", \"content\": \"...\"}"
  }
}
```

### Get user selection
```json
{
  "tool": "shared:canvas-selection",
  "arguments": {
    "id": "cal-1"
  }
}
```

## WezTerm Integration

- Canvases spawn in WezTerm panes via `wezterm cli`
- Existing panes are reused (tracked in `/tmp/claude-canvas-pane-id`)
- 67% width split (Claude:Canvas = 1:2 ratio)
- IPC via Unix sockets at `/tmp/canvas-{id}.sock`

## Vendor Fork

Located at: `agent-core/vendor/canvas`
- Fork: https://github.com/adolago/canvas
- Upstream: https://github.com/dvdsgl/claude-canvas
- Modified `canvas/src/terminal.ts` to use WezTerm instead of tmux
