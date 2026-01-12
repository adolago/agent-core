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

### Phase 0: Todo Continuation Integration
**Status: Complete**

Immediate integration of todo-continuation into existing systems.

#### 0.1 CLI Hook System (DONE)
- [x] `todo-continuation` hook type in tiara
- [x] `session-restore` triggers todo-continuation
- [x] `session-end` saves todos to memory
- [x] CLI command: `claude hook todo-continuation`

#### 0.2 TUI Integration (DONE)
- [x] **Toast notification** - When switching to session with incomplete todos
- [x] **Session list indicator** - Shows ◐{count} for sessions with incomplete todos
- [x] **Backend system reminder** - Inject reminder into conversation context (prompt.ts:1180-1219)
- [x] **Prompt hint** - Visual indicator in prompt area: "◐ N pending · task..."

#### 0.3 Session Persistence Hardening (DONE)
- [x] Ensure todos survive TUI restart (Storage module persists to `~/.local/share/agent-core/storage`)
- [x] Validate session state on load (startup toast shows pending todos count across sessions)
- [x] Add session recovery on crash (Storage + sync context auto-restore; daemon has WAL)

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
- `agent-core daemon` - Start the daemon
- `agent-core daemon-status` - Check if running
- `agent-core daemon-stop` - Stop the daemon

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
**Status: Complete (External Architecture)**
**Prerequisites: Phase 1 complete**

Messaging is handled by an **external gateway** service, keeping agent-core clean for upstream sync.

#### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       GATEWAY ARCHITECTURE                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐
│  │             Zee Gateway (External Transport Layer)               │
│  │                ~/Repositories/personas/zee/                      │
│  │                                                                 │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  │ WhatsApp │  │ Telegram │  │  Signal  │  │ Discord  │        │
│  │  │(whatsapp-│  │ (grammY) │  │          │  │          │        │
│  │  │ web.js)  │  │          │  │          │  │          │        │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│  │       └──────────────┼──────────────┼──────────────┘            │
│  │                      ▼                                          │
│  │          ┌─────────────────────────┐                            │
│  │          │   Persona Detection     │                            │
│  │          │   @stanley → stanley    │                            │
│  │          │   @johny → johny        │                            │
│  │          │   default → zee         │                            │
│  │          └───────────┬─────────────┘                            │
│  └──────────────────────┼──────────────────────────────────────────┘
│                         │ HTTP POST /session/:id/message
│                         │ + agent: persona
│                         ▼
│  ┌─────────────────────────────────────────────────────────────────┐
│  │               agent-core daemon --external-gateway               │
│  │                    http://127.0.0.1:3210                        │
│  │                                                                 │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  │     ZEE     │  │   STANLEY   │  │    JOHNY    │              │
│  │  │   Persona   │  │   Persona   │  │   Persona   │              │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │
│  └─────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.2 Running the Gateway

**Step 1: Start agent-core daemon**
```bash
# Start daemon in external gateway mode
agent-core daemon --external-gateway
```

**Step 2: Start zee gateway (in separate terminal)**
```bash
cd ~/Repositories/personas/zee
pnpm zee gateway
```

**Step 3: Send messages via phone**
- WhatsApp/Telegram messages go to zee gateway
- Gateway routes to agent-core daemon
- Persona routing: mention `@stanley` or `@johny` in message, or let Zee handle default

#### 2.3 Persona Routing

Messages are routed based on mentions:
- `@stanley What's the market doing?` → Routes to Stanley persona
- `@johny Help me study calculus` → Routes to Johny persona
- `Hello, what's the weather?` → Routes to Zee (default)

#### 2.4 Supported Platforms

| Platform | Status | Implementation |
|----------|--------|----------------|
| WhatsApp | ✅ Done | whatsapp-web.js in zee gateway |
| Telegram | ✅ Done | grammY in zee gateway |
| Discord | 🔜 Planned | - |
| Signal | 🔜 Planned | - |

#### 2.5 Security
- [x] User allowlist per platform
- [x] Chat/group restrictions
- [x] Persona routing validation
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
agent-core daemon --wezterm          # Enable (default: true)
agent-core daemon --no-wezterm       # Disable
agent-core daemon --wezterm-layout horizontal  # Layout: horizontal|vertical|grid
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
- Phase 0: Session storage in agent-core sync context
- Phase 0: TUI integration (toast, backend reminder, prompt hint, session indicators)
- Phase 0: Session persistence hardening (startup validation, recovery)
- Phase 1: Headless daemon mode with systemd service
- Phase 1: Daemon CLI commands (daemon, daemon-status, daemon-stop)
- Phase 1: Configuration schema for daemon settings
- Phase 1: Session restoration with todo-continuation on daemon startup
- Phase 2: Telegram + WhatsApp gateways with persona routing
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
- Phase 6: Channel/persona mapping (WhatsApp=Zee, Telegram=Stanley/Johny)
- Phase 6: Daily session management (`persistence.ts` daily sessions API)
- Phase 6: Thread abstraction (`session/thread.ts`)
- Phase 6: Inter-persona delegation (`zee-delegate.ts` tool)
- Phase 6: @mention support (detectMention in WhatsApp gateway)
- Phase 6: Cross-session memory injection (`bootstrap/personas.ts`)
- Phase 6: Personas bootstrap initialization in daemon

### In Progress
- None (All core phases complete: 0-6)

### Next Steps
1. Add Discord gateway (if needed)
2. Add web dashboard (Phase 5.2)
3. Rate limiting and audit logging for gateways
4. TUI integration with session lifecycle hooks
5. Qdrant semantic search for memory injection
6. Fact extraction from conversations

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
- [x] LLM receives system reminder about pending tasks (prompt.ts insertReminders)
- [x] Prompt area shows hint about incomplete work ("◐ N pending · task...")
- [x] TUI startup shows toast if any sessions have pending todos

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

---

## Phase 6: Persistent Chat Design
**Status: Complete**
**Prerequisites: Phase 2-4 complete**

Enhanced conversation management with daily sessions, inter-persona delegation, and cross-session memory.

### 6.1 Channel/Persona Mapping

Each channel has a designated persona:

| Channel | Primary Persona | Routing |
|---------|-----------------|---------|
| WhatsApp | Zee only | Fixed - Zee handles all WhatsApp messages |
| Telegram | Stanley, Johny | Dedicated bots per persona |
| TUI | Any | User selects via model/persona settings |
| API | Any | Specified in request |

**WhatsApp is Zee-only** because:
- Zee is the personal assistant with life admin focus
- Simpler UX - no persona switching needed
- Delegation handles cross-persona queries
- Matches original design intent

### 6.2 Daily Session Management

One session per persona per day for gateway channels:

```
Implementation: packages/agent-core/src/session/persistence.ts

~/.local/state/agent-core/persistence/
├── daily-sessions.json   # Tracks current daily session per persona
└── ...
```

**Daily Session Schema:**
```typescript
interface DailySessionEntry {
  sessionId: string    // The active session ID
  chatId?: string      // Associated chat/phone number
  createdAt: number    // Session creation timestamp
}

// Keyed by: "{persona}:{YYYY-MM-DD}"
// e.g., "zee:2026-01-11" → { sessionId: "...", chatId: "1234567890" }
```

**API:**
```typescript
// Get today's session for a persona
const session = await Persistence.getDailySession("zee")

// Check if today's session exists
const exists = await Persistence.hasDailySession("zee")

// Get or create today's session
const { sessionId, isNew } = await Persistence.getOrCreateDailySession("zee", {
  chatId: "1234567890",
  directory: "/home/user/code"
})
```

**Session Titles:**
- `Zee - 2026-01-11` (WhatsApp daily)
- `Stanley - Telegram - 2026-01-11` (Telegram daily)
- `Johny - Telegram - 2026-01-11` (Telegram daily)

### 6.3 Thread Abstraction

Higher-level interface over sessions:

```
Implementation: packages/agent-core/src/session/thread.ts
```

**Thread Features:**
- Maps to sessions but adds metadata (channel, persona, user)
- Handles daily session creation automatically
- Provides thread history and message counts
- Supports looking up threads by user+persona+channel

**API:**
```typescript
import { Thread } from "@/session/thread"

// Get or create a thread for Zee via WhatsApp
const thread = await Thread.getOrCreate("zee", "whatsapp", {
  userId: "1234567890"
})

// Get thread messages
const messages = await Thread.getMessages(thread.id, { limit: 10 })

// Get thread summary for display
const summary = Thread.getSummary(thread)
// → "💬 Zee via WhatsApp (42 msgs, last: 1/11/2026 5:00 PM)"

// List recent threads for a persona
const recent = await Thread.listRecent("stanley", { limit: 5 })
```

### 6.4 Inter-Persona Delegation

Zee can delegate queries to Stanley or Johny and relay responses:

```
Implementation: .agent-core/tool/zee-delegate.ts
```

**How it works:**
1. User asks Zee a question that requires another persona
2. Zee uses `zee-delegate` tool to send query to target persona
3. Tool creates headless session with target persona
4. Target persona processes query and responds
5. Response is formatted with persona identification and returned
6. Zee relays formatted response to user

**Example Flow:**
```
User (WhatsApp): "Ask Stanley about NVDA stock"
→ Zee: Detects delegation needed
→ zee-delegate tool: Creates Stanley session, sends query
→ Stanley (via Opus): Analyzes NVDA
→ Returns formatted response:

  📊 **Stanley** (via opus):

  NVDA is currently trading at $142.50...

  ---
  📎 Session: `session_abc123`
  💡 To continue directly: `agent-core attach session_abc123`
  🔗 Or ask me to follow up with Stanley
```

**Response Format:**
- Persona emoji (📊 Stanley, 📚 Johny, 💬 Zee)
- Persona name with model info
- Response content
- Session ID for jumping to conversation
- Attach command for direct continuation

### 6.5 @Mention Support

Users can @mention personas in chat to trigger delegation hints:

```
Implementation: packages/agent-core/src/gateway/whatsapp.ts (detectMention)
```

**Detection Patterns:**
- Explicit: `@stanley`, `@johny`
- Natural: "ask Stanley about...", "check with Johny on..."

**Behavior:**
When mention detected, Zee's system prompt includes delegation hint:
```
[Delegation hint: User mentioned Stanley. Consider using zee-delegate tool
to ask Stanley and relay their response.]
```

### 6.6 Cross-Session Memory Injection

Personas bootstrap initializes hooks for memory injection:

```
Implementation: packages/agent-core/src/bootstrap/personas.ts
```

**Hook Points:**
- `session.lifecycle.start` - New session created
- `session.lifecycle.restore` - Existing session restored

**Memory Injection Flow:**
1. Session starts/restores for WhatsApp or Telegram
2. Hook retrieves yesterday's session summary (if exists)
3. Relevant context injected into session
4. Persona has continuity across days

**Future Enhancement:**
- Qdrant semantic search for relevant memories
- Fact extraction from conversations
- Priority-based memory injection

### 6.7 WhatsApp Commands

Updated commands for Zee-only WhatsApp:

| Command | Description |
|---------|-------------|
| `/start` | Welcome message with Zee introduction |
| `/help` | Available commands and delegation info |
| `/status` | System status (daemon, services) |
| `/new` | Start fresh conversation |
| `/stanley` | Info about using Telegram for Stanley |
| `/johny` | Info about using Telegram for Johny |

**Delegation Info in Help:**
```
I can also ask Stanley (investing) or Johny (learning) questions for you.
Just say "ask Stanley about..." or "check with Johny about..."
```

---

## Architecture: Message Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          MESSAGE FLOW                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐                                                        │
│  │  WhatsApp   │──────┐                                                 │
│  │  (Zee only) │      │                                                 │
│  └─────────────┘      │                                                 │
│                       ▼                                                  │
│  ┌─────────────┐    ┌─────────────────────────────────────────────┐    │
│  │  Telegram   │───►│           GATEWAY LAYER                      │    │
│  │  (Stanley)  │    │                                             │    │
│  └─────────────┘    │  • Daily session management                 │    │
│                       │  • @mention detection                       │    │
│  ┌─────────────┐    │  • User authorization                       │    │
│  │  Telegram   │───►│  • Channel/persona routing                  │    │
│  │  (Johny)    │    └──────────────┬──────────────────────────────┘    │
│  └─────────────┘                    │                                   │
│                                     ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      THREAD ABSTRACTION                           │  │
│  │                                                                   │  │
│  │  Thread.getOrCreate(persona, channel, {userId}) → thread.id       │  │
│  │  Thread.getMessages(thread.id) → message history                  │  │
│  │  Thread.getSummary(thread) → display string                       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                     │                                   │
│                                     ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      SESSION LAYER                                │  │
│  │                                                                   │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │  │
│  │  │  Daily Sessions  │  │  Persistence     │  │  Cross-Session │  │  │
│  │  │  (per persona)   │  │  (checkpoints,   │  │  Memory        │  │  │
│  │  │                  │  │   WAL, recovery) │  │  Injection     │  │  │
│  │  └──────────────────┘  └──────────────────┘  └────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                     │                                   │
│                                     ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      PERSONA LAYER                                │  │
│  │                                                                   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                           │  │
│  │  │   ZEE   │◄─┤  TOOLS  ├─►│ STANLEY │                           │  │
│  │  │         │  │         │  │         │                           │  │
│  │  │ delegate│  │ memory  │  │ finance │                           │  │
│  │  │ calendar│  │ calendar│  │ markets │                           │  │
│  │  │ contact │  │ delegate│  │ research│                           │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘                           │  │
│  │       │            │            │                                 │  │
│  │       │       ┌────┴────┐       │                                 │  │
│  │       └──────►│  JOHNY  │◄──────┘                                 │  │
│  │               │         │                                         │  │
│  │               │ learning│                                         │  │
│  │               │ knowledge│                                        │  │
│  │               └─────────┘                                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Delegation Examples

```
User (WhatsApp): "Check with Stanley on how my portfolio is doing"
→ Zee: Detects @stanley mention
→ Delegation hint injected
→ Zee uses zee-delegate(persona="stanley", query="How is my portfolio doing?")
→ Stanley (new headless session): Analyzes portfolio
→ Response formatted:

  📊 **Stanley** (via opus):

  Your portfolio is up 2.3% today. NVDA leading gains at +4.1%...

  ---
  📎 Session: `session_xyz789`
  💡 To continue: `agent-core attach session_xyz789`

User (WhatsApp): "Ask Johny to quiz me on calculus"
→ Zee: Detects delegation request
→ Zee uses zee-delegate(persona="johny", query="Quiz me on calculus")
→ Johny (new headless session): Generates quiz
→ Response:

  📚 **Johny** (via sonnet):

  Let's test your understanding of derivatives!

  Q1: What is d/dx of x³ + 2x² - 5x + 1?
  ...
```
