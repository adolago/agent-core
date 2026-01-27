# desktop-gpui Implementation Plan

## Executive Summary

The current `desktop-gpui` implementation is a **skeleton app** (~5,400 LOC) that provides basic scaffolding but lacks the core functionality that makes the OpenCode TUI (~7,800 LOC) a production-ready application. This document provides a detailed gap analysis and implementation roadmap.

---

## Current State Analysis

### What desktop-gpui HAS ✓

| Feature | Status | Notes |
|---------|--------|-------|
| GPUI window + basic layout | ✅ Done | Window opens, renders |
| 3 views (Sessions, Chat, Settings) | ✅ Done | Basic placeholders |
| HTTP API client | ✅ Done | All endpoints implemented |
| Theme system | ✅ Done | OpenCode Dark theme ported |
| Persona support (Zee/Stanley/Johny) | ✅ Done | UI only, not wired |
| SSE stream parsing (code exists) | ⚠️ Partial | Not connected to UI |
| Prompt input component | ⚠️ Partial | Basic text input, no features |
| AppState management | ✅ Done | Centralized state struct |

### What desktop-gpui LACKS ✗

| Feature | Priority | TUI Location | Notes |
|---------|----------|--------------|-------|
| **Real-time event subscription** | P0 | `context/sdk.tsx` + `context/sync.tsx` | **CRITICAL** - No SSE connection loop |
| **SyncProvider equivalent** | P0 | `context/sync.tsx` (530 LOC) | No reactive state sync |
| **Command palette** | P1 | `component/dialog-command.tsx` | No slash commands, no `/model`, `/theme` etc |
| **Model picker dialog** | P1 | `component/dialog-model.tsx` | Placeholder only |
| **MCP status dialog** | P1 | `component/dialog-mcp.tsx` | Not implemented |
| **Theme picker dialog** | P1 | `component/dialog-theme-list.tsx` | Not implemented |
| **Session list dialog** | P1 | `component/dialog-session-list.tsx` | Not implemented |
| **Agent picker dialog** | P1 | `component/dialog-agent.tsx` | Not implemented |
| **Provider config dialog** | P1 | `component/dialog-provider.tsx` | Placeholder only |
| **Help dialog** | P2 | `ui/dialog-help.tsx` | Not implemented |
| **Status dialog** | P2 | `component/dialog-status.tsx` | Not implemented |
| **Toast notifications** | P1 | `ui/toast.tsx` | Not implemented |
| **Keyboard shortcuts system** | P1 | `context/keybind.tsx` | Basic only |
| **WhichKey popup** | P2 | `component/which-key.tsx` | Not implemented |
| **Prompt autocomplete** | P2 | `component/prompt/autocomplete.tsx` | Not implemented |
| **Prompt history** | P1 | `component/prompt/history.tsx` | Struct exists, not wired |
| **Prompt frecency** | P2 | `component/prompt/frecency.tsx` | Not implemented |
| **Prompt stash** | P2 | `component/prompt/stash.tsx` | Not implemented |
| **Rich tool rendering** | P0 | `routes/session/index.tsx` (1900+ LOC) | Basic text only |
| **Diff view rendering** | P1 | Edit tool in session | Not implemented |
| **Syntax highlighting** | P1 | via opentui parsers | Not implemented |
| **Permission prompts** | P0 | `routes/session/permission.tsx` | Not implemented |
| **Question prompts** | P0 | `routes/session/question.tsx` | Not implemented |
| **Timeline/fork dialogs** | P2 | `routes/session/dialog-timeline.tsx` | Not implemented |
| **Session sidebar** | P2 | `routes/session/sidebar.tsx` | Not implemented |
| **Export options** | P3 | `ui/dialog-export-options.tsx` | Not implemented |
| **Delegation dialog** | P3 | `routes/session/dialog-delegation.tsx` | Not implemented |
| **Todo items** | P2 | `component/todo-item.tsx` | Not implemented |
| **Tips component** | P3 | `component/tips.tsx` | Not implemented |

---

## Architecture Gap Analysis

### TUI Architecture (OpenCode)

```
┌─────────────────────────────────────────────────────────┐
│                      App (app.tsx)                      │
├─────────────────────────────────────────────────────────┤
│  Providers (nested context)                             │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ArgsProvider → ExitProvider → KVProvider → ...      ││
│  │   → SDKProvider → SyncProvider → ThemeProvider      ││
│  │   → LocalProvider → KeybindProvider → DialogProvider││
│  │   → CommandProvider → PromptHistoryProvider → ...   ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Routes                                                 │
│  ┌────────────────┐  ┌────────────────────────────────┐│
│  │     Home       │  │           Session              ││
│  │  - Logo        │  │  - Header (model, agent info)  ││
│  │  - Prompt      │  │  - Messages (tool renders)     ││
│  │  - Tips        │  │  - Sidebar (subagents, todos)  ││
│  │  - MCP status  │  │  - Footer (status, keybinds)   ││
│  └────────────────┘  │  - Prompt                      ││
│                      │  - Permission/Question prompts ││
│                      └────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Dialogs (overlay system)                               │
│  - Model picker, MCP status, Theme list, Help, etc.    │
├─────────────────────────────────────────────────────────┤
│  Real-time Events (SSE → SyncProvider)                 │
│  - session.*, message.*, permission.*, question.*      │
│  - mcp.*, lsp.*, todo.*, config.*                      │
└─────────────────────────────────────────────────────────┘
```

### desktop-gpui Architecture (Current)

```
┌─────────────────────────────────────────────────────────┐
│                   AppRoot (app.rs)                      │
├─────────────────────────────────────────────────────────┤
│  Globals (simple)                                       │
│  ┌─────────────────────────────────────────────────────┐│
│  │ AppState (single struct), Theme, ApiState          ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Views                                                  │
│  ┌────────────────┐  ┌────────────┐  ┌────────────────┐│
│  │  SessionsView  │  │  ChatView  │  │  SettingsView  ││
│  │  - List only   │  │  - Basic   │  │  - Placeholder ││
│  │  - No search   │  │  - No tools│  │                ││
│  └────────────────┘  └────────────┘  └────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Components                                             │
│  - Sidebar (navigation)                                 │
│  - PromptInput (basic text)                            │
│  - (No dialogs implemented)                            │
├─────────────────────────────────────────────────────────┤
│  API (client.rs)                                        │
│  - HTTP methods ✓                                       │
│  - SSE parsing ✓ (NOT CONNECTED)                       │
│  - No event loop running                               │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 0: Critical Foundation (Week 1)

**Goal:** Make the app actually work with the daemon

#### 0.1 SSE Event Subscription Loop
**Files:** New `src/events.rs`, modify `src/app.rs`

The TUI's `SDKProvider` maintains a persistent SSE connection:
```typescript
// TUI: context/sdk.tsx
while (true) {
  const events = await eventSdk.event.subscribe({ signal: abort.signal })
  for await (const event of events.stream) {
    handleEvent(resolved)
  }
}
```

**GPUI equivalent needed:**
```rust
// New: src/events.rs
pub struct EventSubscription {
    client: AgentCoreClient,
    runtime: tokio::runtime::Handle,
}

impl EventSubscription {
    pub fn start(cx: &mut App) {
        // Spawn background task that:
        // 1. Calls client.subscribe_events()
        // 2. Processes each event
        // 3. Updates AppState via cx.update()
        // 4. Reconnects on disconnect
    }
}
```

#### 0.2 Reactive State Sync
**Files:** Refactor `src/state.rs`

Current state is a dumb struct. Need event-driven updates:

| Event Type | Handler |
|------------|---------|
| `session.created` | Add to sessions list |
| `session.updated` | Update session in list |
| `session.deleted` | Remove from list, handle active |
| `message.updated` | Update/add message |
| `message.part.updated` | Update message parts |
| `permission.asked` | Show permission dialog |
| `question.asked` | Show question dialog |
| `todo.updated` | Update todo list |
| `mcp.status` | Update MCP status |

#### 0.3 Permission & Question Prompts
**Files:** New `src/dialogs/permission.rs`, `src/dialogs/question.rs`

The agent cannot function without these - tool calls block waiting for approval.

```rust
pub struct PermissionPrompt {
    request: PermissionRequest,
    session_id: String,
}

impl PermissionPrompt {
    pub fn approve(&self, cx: &mut Context<Self>) { /* POST /permission/reply */ }
    pub fn deny(&self, cx: &mut Context<Self>) { /* POST /permission/reply */ }
}
```

---

### Phase 1: Core Functionality (Week 2-3)

#### 1.1 Toast Notification System
**Files:** New `src/components/toast.rs`

```rust
pub struct ToastManager {
    toasts: Vec<Toast>,
    max_visible: usize,
}

pub struct Toast {
    id: String,
    variant: ToastVariant, // Info, Success, Warning, Error
    title: Option<String>,
    message: String,
    duration_ms: u64,
    created_at: Instant,
}
```

#### 1.2 Dialog System
**Files:** New `src/dialogs/mod.rs`, refactor dialog rendering

Current dialog stack exists but nothing uses it properly. Need:
- Overlay rendering layer
- Focus management
- Escape to close
- Animation support

#### 1.3 Command Palette
**Files:** New `src/components/command_palette.rs`

```rust
pub struct CommandPalette {
    query: String,
    commands: Vec<Command>,
    filtered: Vec<Command>,
    selected_index: usize,
}

pub struct Command {
    title: String,
    value: String,
    category: String,
    keybind: Option<String>,
    on_select: Box<dyn Fn(&mut Context<CommandPalette>)>,
}
```

Slash commands to implement:
- `/model` - Switch model
- `/agent` - Switch agent/persona
- `/theme` - Switch theme
- `/themes` - Theme list
- `/session` - Session list
- `/sessions` - Same
- `/status` - System status
- `/mcp` - MCP servers status
- `/help` - Help dialog
- `/exit`, `/quit`, `/q` - Exit app

#### 1.4 Model Picker Dialog
**Files:** Implement `src/dialogs/model.rs`

Group by provider, show status, filter by search.

#### 1.5 Prompt Input Improvements
**Files:** Enhance `src/components/prompt_input.rs`

- [ ] Slash command detection and autocomplete
- [ ] History navigation (up/down arrows)
- [ ] File attachment preview
- [ ] Multi-line expansion

---

### Phase 2: Rich Message Rendering (Week 3-4)

#### 2.1 Tool-Specific Renderers
**Files:** New `src/components/tools/` directory

Each tool needs its own renderer:

| Tool | Rendering Needs |
|------|-----------------|
| `Bash` | Command, expandable output, workdir |
| `Read` | File path, line range |
| `Write` | File path, syntax highlighted content |
| `Edit` | Diff view (unified or stacked) |
| `Grep` | Pattern, matches count |
| `Glob` | Pattern, matches count |
| `Task` | Subagent indicator, progress, navigate |
| `WebFetch` | URL, status |

#### 2.2 Syntax Highlighting
**Files:** New `src/syntax/` module

Options:
1. Use tree-sitter (complex, full highlighting)
2. Use syntect (simpler, good enough)
3. Basic keyword highlighting (minimal)

Recommend: syntect for balance of quality and simplicity.

#### 2.3 Diff View Component
**Files:** New `src/components/diff_view.rs`

Support both unified and stacked (side-by-side) diff views.

---

### Phase 3: Polish & Parity (Week 4-5)

#### 3.1 Keyboard Shortcuts System
**Files:** Enhance `src/keyboard.rs`

Current implementation is basic. Need:
- Configurable keybinds
- WhichKey popup (shows available keys)
- Context-aware bindings (different per view)

#### 3.2 Session Sidebar
**Files:** New `src/components/session_sidebar.rs`

Shows:
- Subagent sessions
- Todo items
- Session diffs

#### 3.3 Theme Picker & Additional Themes
**Files:** Enhance `src/theme/`

Current: 1 theme (OpenCode Dark)
TUI has: Multiple themes + light/dark mode detection

#### 3.4 MCP Status Dialog
**Files:** Implement `src/dialogs/mcp.rs`

Shows MCP server connection status, tools available.

#### 3.5 Help Dialog
**Files:** New `src/dialogs/help.rs`

Keybind reference, slash command reference.

---

## Effort Estimates

| Phase | Estimated LOC | Time |
|-------|---------------|------|
| Phase 0 (Foundation) | ~1,000 | 1 week |
| Phase 1 (Core Functionality) | ~2,000 | 2 weeks |
| Phase 2 (Rich Rendering) | ~1,500 | 1.5 weeks |
| Phase 3 (Polish) | ~1,000 | 1 week |
| **Total** | **~5,500** | **5-6 weeks** |

This would bring desktop-gpui to ~11,000 LOC, achieving rough feature parity with the TUI.

---

## Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │ P0: SSE Events    │ P1: Command       │
    │ P0: Permissions   │     Palette       │
    │ P0: Questions     │ P1: Model Picker  │
    │ P0: Tool Renders  │ P1: Toast System  │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT│ P2: Tips         │ P2: Diff Views    │ EFFORT
    │ P3: Export        │ P2: Syntax HL     │
    │ P3: Delegation    │ P2: MCP Dialog    │
    │                   │ P2: Help Dialog   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

---

## Recommended Next Steps

1. **Immediately**: Implement SSE event loop (Phase 0.1)
2. **This week**: Add permission/question prompts (Phase 0.3)
3. **Next**: Command palette with basic slash commands (Phase 1.3)
4. **Then**: Rich tool rendering (Phase 2.1)

Without Phase 0, the app is non-functional as a real client. The current implementation is essentially a static mockup that happens to compile.
