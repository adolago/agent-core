# Always-On Personas: Headless Agent Architecture

## Vision

Turn on your PC in the morning, leave without logging in, and communicate with the Triad (Zee/Stanley/Johny) via your phone. The personas work autonomously on your home computer, accessible 24/7.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ALWAYS-ON ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐     ┌─────────────────────────────────────────────┐  │
│   │   PHONE     │     │              HOME PC (Headless)             │  │
│   │             │     │                                             │  │
│   │ ┌─────────┐ │     │  ┌─────────────────────────────────────┐   │  │
│   │ │Telegram │◄├─────┼──┤        agent-core daemon            │   │  │
│   │ │WhatsApp │ │     │  │  (systemd service, pre-login)       │   │  │
│   │ │ Discord │ │     │  └──────────────┬──────────────────────┘   │  │
│   │ └─────────┘ │     │                 │                          │  │
│   │      │      │     │  ┌──────────────┼──────────────────────┐   │  │
│   │      ▼      │     │  │              ▼                      │   │  │
│   │ ┌─────────┐ │     │  │  ┌─────┐  ┌─────────┐  ┌───────┐   │   │  │
│   │ │   ZEE   │◄├─────┼──┼──┤ ZEE │  │ STANLEY │  │ JOHNY │   │   │  │
│   │ │ Gateway │ │     │  │  └──┬──┘  └────┬────┘  └───┬───┘   │   │  │
│   │ └─────────┘ │     │  │     │          │          │        │   │  │
│   └─────────────┘     │  │     └──────────┼──────────┘        │   │  │
│                       │  │                ▼                    │   │  │
│                       │  │  ┌─────────────────────────────┐   │   │  │
│                       │  │  │      SHARED LAYER           │   │   │  │
│                       │  │  │  • Qdrant Memory            │   │   │  │
│                       │  │  │  • Session Persistence      │   │   │  │
│                       │  │  │  • Todo Continuation        │   │   │  │
│                       │  │  │  • Hook System              │   │   │  │
│                       │  │  └─────────────────────────────┘   │   │  │
│                       │  │                                     │   │  │
│                       │  │           TIARA ORCHESTRATION       │   │  │
│                       │  └─────────────────────────────────────┘   │  │
│                       │                                             │  │
│                       │  ┌─────────────────────────────────────┐   │  │
│                       │  │  WezTerm (when logged in)           │   │  │
│                       │  │  • Visual panes for each drone      │   │  │
│                       │  │  • Real-time status                 │   │  │
│                       │  │  • Optional - system works without  │   │  │
│                       │  └─────────────────────────────────────┘   │  │
│                       └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 0: Todo Continuation Integration (Current)
**Status: In Progress**

Immediate integration of todo-continuation into existing systems.

#### 0.1 CLI Hook System (DONE)
- [x] `todo-continuation` hook type in tiara
- [x] `session-restore` triggers todo-continuation
- [x] `session-end` saves todos to memory
- [x] CLI command: `claude hook todo-continuation`

#### 0.2 TUI Integration (PARTIAL)
- [x] **Toast notification** - When switching to session with incomplete todos
- [x] **Session list indicator** - Shows ◐{count} for sessions with incomplete todos
- [ ] **Backend system reminder** - Inject reminder into conversation context
- [ ] **Prompt hint** - Visual indicator in prompt area about pending tasks

#### 0.3 Session Persistence Hardening
- [ ] Ensure todos survive TUI restart
- [ ] Validate session state on load
- [ ] Add session recovery on crash

---

### Phase 1: Headless Daemon Mode
**Status: Complete**
**Prerequisites: Phase 0 complete**

agent-core runs as a system service, starting before user login.

#### 1.1 Systemd Service (DONE)
Service file at `scripts/systemd/agent-core.service` with install script.

```bash
# Install the service
sudo ./scripts/systemd/install.sh

# Or manually copy
sudo cp scripts/systemd/agent-core.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable agent-core
sudo systemctl start agent-core
```

#### 1.2 Daemon Mode Implementation (DONE)
- [x] Create `daemon` command in CLI
- [x] Headless session management (no TUI)
- [x] API server for remote communication (reuses existing Server)
- [x] Logging to file/journald
- [x] PID file management for service control
- [x] Signal handlers for graceful shutdown
- [x] Session restoration with todo-continuation on startup

CLI Commands:
- `opencode daemon` - Start the daemon
- `opencode daemon-status` - Check if running
- `opencode daemon-stop` - Stop the daemon

#### 1.3 Credential Access (PARTIAL)
- [x] Environment-based fallback for API keys (via daemon.env file)
- [ ] Keyring access from service context (future)
- [ ] Secure credential storage at `~/.zee/credentials/` (future)

#### 1.4 Configuration Schema (DONE)
Added `daemon` section to config schema:
```json
{
  "daemon": {
    "enabled": true,
    "session": {
      "persistence": true,
      "checkpoint_interval": 300,
      "recovery": true
    },
    "todo": {
      "auto_continue": true,
      "notify_on_incomplete": true
    },
    "gateway": {
      "telegram": { "enabled": false },
      "discord": { "enabled": false }
    }
  }
}
```

---

### Phase 2: Remote Communication Gateway
**Status: Telegram Complete**
**Prerequisites: Phase 1 complete**

Zee becomes the universal gateway for all communication.

#### 2.1 Telegram Gateway (DONE)

Implementation at `packages/agent-core/src/gateway/telegram.ts`:

- [x] Long polling for incoming messages (no webhook required)
- [x] Intent-based persona routing (finance → Stanley, learning → Johny, else → Zee)
- [x] User/chat authorization via allowlist
- [x] Bot commands (/start, /status, /new, /zee, /stanley, /johny)
- [x] Automatic message chunking for Telegram's 4096 char limit
- [x] Integration with daemon startup
- [x] Outbound notification support

**Usage:**
```bash
# Set up your bot token (get from @BotFather)
export TELEGRAM_BOT_TOKEN=your-token-here

# Optionally restrict to specific users (get ID from @userinfobot)
export TELEGRAM_ALLOWED_USERS=123456789,987654321

# Start daemon with Telegram gateway
opencode daemon --port 4567
```

**Bot Commands:**
- `/start` - Welcome message and help
- `/status` - Check system status
- `/new` - Start new conversation
- `/zee` - Switch to Zee persona
- `/stanley` - Switch to Stanley persona
- `/johny` - Switch to Johny persona

**Intent Routing Patterns:**
- Stanley: portfolio, stock, market, invest, trading, finance, ticker, NVDA/AAPL/TSLA
- Johny: study, learn, quiz, teach, explain, knowledge, practice, math/calculus
- Zee: Everything else (default)

#### 2.2 Future Platforms
- [ ] WhatsApp integration (requires Business API)
- [ ] Discord bot as alternative

#### 2.3 Security (PARTIAL)
- [x] User ID allowlist
- [x] Chat ID allowlist
- [ ] Rate limiting (future)
- [ ] Audit logging (future)

---

### Phase 3: Session Persistence & Recovery
**Status: Complete**
**Prerequisites: Phase 1, 2 complete**

Robust session management that survives crashes and restarts.

#### 3.1 Persistence Module (DONE)

Implementation at `packages/agent-core/src/session/persistence.ts`:

```
~/.local/state/agent-core/persistence/
├── checkpoints/
│   └── checkpoint-{timestamp}/
│       ├── sessions.json      # All sessions with todos
│       ├── last-active.json   # Last active per persona
│       └── metadata.json      # Checkpoint metadata
├── wal.jsonl                  # Write-ahead log
├── last-active.json           # Current last active state
└── recovery-needed            # Marker (removed on clean shutdown)
```

#### 3.2 Features Implemented

**Checkpoints:**
- [x] Periodic checkpoints (default: every 5 minutes)
- [x] Configurable checkpoint interval
- [x] Automatic cleanup of old checkpoints (keeps last 3)
- [x] Full session state with todos

**Write-Ahead Logging:**
- [x] Logs session creates/updates
- [x] Logs message creates
- [x] Logs todo updates
- [x] Logs last active session changes
- [x] Automatic WAL replay on crash recovery

**Recovery:**
- [x] Recovery marker detects unclean shutdown
- [x] Automatic recovery on daemon startup
- [x] Checkpoint restoration
- [x] WAL replay after checkpoint

**Last Active Tracking:**
- [x] Tracks last active session per persona (zee/stanley/johny)
- [x] Stores associated Telegram chat ID
- [x] Enables session continuity across restarts
- [x] Integrated with Telegram gateway

#### 3.3 Cross-Device Session Continuity (DONE)
- [x] Session restored when same chat ID reconnects
- [x] Per-persona session tracking
- [x] Works across daemon restarts

---

### Phase 4: Tiara Hook Integration
**Status: Complete**
**Prerequisites: Phase 0.1 complete, Phase 1-3 complete**

Full hook lifecycle for session management.

#### 4.1 Lifecycle Hooks Module (DONE)

Implementation at `packages/agent-core/src/hooks/lifecycle.ts`:

```typescript
// Daemon lifecycle
LifecycleHooks.Daemon.Start      // Daemon starting up
LifecycleHooks.Daemon.Ready      // Daemon ready to accept work
LifecycleHooks.Daemon.Shutdown   // Graceful shutdown initiated

// Session lifecycle
LifecycleHooks.SessionLifecycle.Start     // New session created
LifecycleHooks.SessionLifecycle.Restore   // Existing session restored (triggers todo-continuation)
LifecycleHooks.SessionLifecycle.End       // Session completed or suspended
LifecycleHooks.SessionLifecycle.Transfer  // Session moving to different device/context

// Todo lifecycle
LifecycleHooks.TodoLifecycle.Continuation // Incomplete tasks detected
LifecycleHooks.TodoLifecycle.Completed    // All tasks done
LifecycleHooks.TodoLifecycle.Blocked      // Task cannot proceed, needs input
```

#### 4.2 Hook Integration Points (DONE)
- [x] Daemon startup emits `daemon.start` and `daemon.ready`
- [x] Daemon shutdown emits `daemon.shutdown`
- [x] Telegram gateway emits `session.lifecycle.start` for new sessions
- [x] Telegram gateway emits `session.lifecycle.restore` when restoring sessions
- [x] Session restore triggers `todo.lifecycle.continuation` when incomplete todos exist

#### 4.3 Hook Registration
Hooks use the standard Bus event system for pub/sub:
```typescript
// Subscribe to daemon ready
Bus.subscribe(LifecycleHooks.Daemon.Ready, (event) => {
  console.log(`Daemon ready on port ${event.properties.port}`)
})

// Custom handler registration
LifecycleHooks.on(LifecycleHooks.TodoLifecycle.Continuation, async (payload) => {
  // Handle todo continuation
})
```

---

### Phase 5: Visual Orchestration (Optional Enhancement)
**Status: WezTerm Complete**
**Prerequisites: All previous phases**

When you're at your desk, see what the personas are doing.

#### 5.1 WezTerm Integration (DONE)

Implementation at `packages/agent-core/src/orchestration/wezterm.ts`:

- [x] Daemon spawns WezTerm status pane when X/Wayland session available
- [x] Display detection (X11 via DISPLAY, Wayland via WAYLAND_DISPLAY)
- [x] Status pane showing daemon health, services, sessions
- [x] Graceful degradation when no display (falls back silently)
- [x] Session pane management API (create/close/focus)
- [x] Integration with lifecycle hooks (auto-updates on events)

**CLI Options:**
```bash
opencode daemon --wezterm          # Enable (default: true)
opencode daemon --no-wezterm       # Disable
opencode daemon --wezterm-layout horizontal  # Layout: horizontal|vertical|grid
```

**Status Pane Features:**
- PID, port, uptime display
- Service status (Persistence, Telegram, Discord, WezTerm)
- Session count and incomplete todos
- Auto-refresh every 5 seconds

**Session Pane API:**
```typescript
// Create a pane for a session
const paneId = await WeztermOrchestration.createSessionPane(sessionId, "My Session", "zee")

// Send command to pane
await WeztermOrchestration.sendToSessionPane(sessionId, "echo hello")

// Focus/close pane
await WeztermOrchestration.focusSessionPane(sessionId)
await WeztermOrchestration.closeSessionPane(sessionId)
```

#### 5.2 Web Dashboard (Future)
- [ ] Local web server in daemon
- [ ] Real-time status via WebSocket
- [ ] Access from any device on local network
- [ ] Mobile-friendly interface

---

## Current Status

### Completed
- Phase 0: Todo continuation hook infrastructure in tiara
- Phase 0: CLI integration for session-restore with todo-continuation
- Phase 0: Session storage in opencode sync context
- Phase 0: TUI integration (toast, backend reminder, prompt hint)
- Phase 1: Headless daemon mode with systemd service
- Phase 1: Daemon CLI commands (daemon, daemon-status, daemon-stop)
- Phase 1: Configuration schema for daemon settings
- Phase 1: Session restoration with todo-continuation on daemon startup
- Phase 2: Telegram gateway with persona routing
- Phase 2: Intent-based persona detection (Stanley/Johny/Zee)
- Phase 2: User authorization allowlists
- Phase 3: Session persistence with checkpoints and WAL
- Phase 3: Crash recovery with automatic checkpoint restoration
- Phase 3: Last active session tracking per persona
- Phase 3: Cross-device session continuity
- Phase 4: Lifecycle hooks module (`packages/agent-core/src/hooks/lifecycle.ts`)
- Phase 4: Daemon lifecycle hooks (start, ready, shutdown)
- Phase 4: Session lifecycle hooks (start, restore, end, transfer)
- Phase 4: Todo lifecycle hooks (continuation, completed, blocked)
- Phase 4: Daemon integration with lifecycle hooks
- Phase 4: Telegram gateway integration with session hooks
- Phase 5: WezTerm orchestration module (`packages/agent-core/src/orchestration/wezterm.ts`)
- Phase 5: Display detection (X11/Wayland)
- Phase 5: Status pane with daemon health visualization
- Phase 5: Session pane management API
- Phase 5: Graceful degradation when no display
- Phase 5: Integration with lifecycle hooks for auto-updates

### In Progress
- None (Phases 0-5 complete)

### Next Steps
1. Add Discord gateway (if needed)
2. Add web dashboard (Phase 5.2)
3. Rate limiting and audit logging for gateways
4. TUI integration with session lifecycle hooks

---

## Technical Decisions

### Why Zee as Gateway?
Zee is already the personal assistant with messaging capabilities. Rather than create a separate "remote access" system, leverage Zee's existing role:
- Natural language interface
- Already handles calendar, contacts, notifications
- Can delegate to Stanley/Johny as needed
- Single point of entry reduces complexity

### Why Systemd?
- Starts before user login
- Automatic restart on failure
- Journal integration for logs
- Well-understood, reliable

### Why Not Docker/Container?
- Needs access to user's files and credentials
- GPU access for potential local LLM
- Desktop integration (WezTerm, notifications)
- Containers add complexity without benefit here

### Session Storage: SQLite vs JSON Files
For now: JSON files
- Simple, debuggable
- Easy to backup/restore
- No database dependencies

Later: Consider SQLite if:
- Query patterns become complex
- Concurrent access is needed
- Performance becomes an issue

---

## Configuration

```yaml
# ~/.config/agent-core/daemon.yaml
daemon:
  enabled: true
  autostart: true

  # Session management
  session:
    persistence: true
    checkpoint_interval: 300  # seconds
    recovery: true

  # Todo continuation
  todo:
    auto_continue: true
    notify_on_incomplete: true
    completion_threshold: 100  # percent before considering done

  # Remote access
  gateway:
    telegram:
      enabled: true
      bot_token: ${TELEGRAM_BOT_TOKEN}
    whatsapp:
      enabled: false  # future
    discord:
      enabled: false  # future

  # Visual (when available)
  wezterm:
    enabled: true
    auto_spawn_panes: true
```

---

## Success Criteria

### Phase 0 Complete When:
- [x] Switching sessions in TUI shows toast for incomplete todos
- [x] Session list shows indicator for sessions with incomplete todos
- [ ] LLM receives system reminder about pending tasks
- [ ] Prompt area shows hint about incomplete work

### Phase 1 Complete When:
- [ ] `systemctl start agent-core` works
- [ ] Survives reboot
- [ ] Logs accessible via `journalctl -u agent-core`

### Phase 2 Complete When:
- [ ] Send Telegram message → get response from Zee
- [ ] "Ask Stanley about NVDA" → Stanley analyzes
- [ ] Notifications sent for completed tasks

### Phase 3 Complete When:
- [ ] Kill daemon → restart → work continues
- [ ] Reboot PC → work continues
- [ ] Start conversation on phone → continue on desktop

### Phase 4 Complete When:
- [ ] All lifecycle hooks fire correctly
- [ ] Consistent behavior across CLI, TUI, daemon, remote

### Phase 5 Complete When:
- [ ] Login to desktop → see active work in WezTerm
- [ ] Web dashboard shows system status
- [ ] Can monitor from phone browser

---

## Appendix: Message Routing Examples

```
User (via Telegram): "What's my portfolio looking like?"
→ Zee: Detects finance intent
→ Route to Stanley
→ Stanley: Analyzes portfolio
→ Zee: Formats and sends response

User (via Telegram): "Remind me about the API meeting tomorrow"
→ Zee: Handles directly (calendar + notification)
→ Response sent

User (via Telegram): "Quiz me on derivatives"
→ Zee: Detects study intent
→ Route to Johny
→ Johny: Generates quiz based on knowledge graph
→ Zee: Formats and sends quiz

User (via Telegram): "Continue working on the auth feature"
→ Zee: Detects code intent with active todo
→ Restore session with todo-continuation
→ Resume work autonomously
→ Zee: Sends completion notification when done
```
