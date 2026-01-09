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

#### 0.2 TUI Integration (TODO)
- [ ] **Toast notification** - When switching to session with incomplete todos
- [ ] **Backend system reminder** - Inject reminder into conversation context
- [ ] **Prompt hint** - Visual indicator in prompt area about pending tasks

#### 0.3 Session Persistence Hardening
- [ ] Ensure todos survive TUI restart
- [ ] Validate session state on load
- [ ] Add session recovery on crash

---

### Phase 1: Headless Daemon Mode
**Prerequisites: Phase 0 complete**

agent-core runs as a system service, starting before user login.

#### 1.1 Systemd Service
```bash
# /etc/systemd/system/agent-core.service
[Unit]
Description=Agent Core - Always-On Personas
After=network.target

[Service]
Type=simple
User=artur
Environment=HOME=/home/artur
Environment=AGENT_CORE_HEADLESS=1
WorkingDirectory=/home/artur/Repositories/agent-core
ExecStart=/home/artur/.bun/bin/bun run packages/opencode/src/cli/index.ts daemon
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 1.2 Daemon Mode Implementation
- [ ] Create `daemon` command in CLI
- [ ] Headless session management (no TUI)
- [ ] API server for remote communication
- [ ] Credential management without user session
- [ ] Logging to file/journald

#### 1.3 Credential Access
- [ ] Keyring access from service context
- [ ] Environment-based fallback for API keys
- [ ] Secure credential storage at `~/.zee/credentials/`

---

### Phase 2: Remote Communication Gateway
**Prerequisites: Phase 1 complete**

Zee becomes the universal gateway for all communication.

#### 2.1 Messaging Platform Integration
```
┌──────────────────────────────────────────────────────────────┐
│                    ZEE GATEWAY                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Telegram ──┐                                                │
│             │    ┌──────────────────────────────────────┐   │
│  WhatsApp ──┼───►│  Message Router                      │   │
│             │    │                                      │   │
│  Discord ───┘    │  • Parse intent                      │   │
│                  │  • Route to persona (Zee/Stanley/    │   │
│                  │    Johny)                            │   │
│                  │  • Queue if busy                     │   │
│                  │  • Return results                    │   │
│                  └──────────────────────────────────────┘   │
│                                                              │
│  Outbound:                                                   │
│  • Task completion notifications                             │
│  • Todo status updates                                       │
│  • Error alerts                                              │
│  • Daily summaries                                           │
└──────────────────────────────────────────────────────────────┘
```

#### 2.2 Implementation Tasks
- [ ] Telegram bot running in daemon mode
- [ ] WhatsApp integration (if available)
- [ ] Discord bot as alternative
- [ ] Message queue for handling during offline
- [ ] Intent parsing to route to correct persona:
  - "Check my portfolio" → Stanley
  - "What's on my calendar" → Zee
  - "Quiz me on calculus" → Johny

#### 2.3 Security Considerations
- [ ] Device authentication
- [ ] Rate limiting
- [ ] Audit logging
- [ ] Session tokens for multi-device

---

### Phase 3: Session Persistence & Recovery
**Prerequisites: Phase 1, 2 in progress**

Robust session management that survives anything.

#### 3.1 Persistent Session Store
```
~/.zee/
├── sessions/
│   ├── active/           # Currently active sessions
│   │   ├── {session-id}.json
│   │   └── {session-id}.todos.json
│   └── archive/          # Completed sessions
├── state/
│   ├── daemon.pid        # Daemon process ID
│   ├── daemon.lock       # Lock file
│   └── last-active.json  # Last active session per persona
└── recovery/
    ├── checkpoint/       # Periodic state snapshots
    └── journal/          # Write-ahead log for crash recovery
```

#### 3.2 Recovery Mechanisms
- [ ] Checkpoint every N minutes
- [ ] Write-ahead logging for in-progress operations
- [ ] Graceful shutdown with state save
- [ ] Crash recovery on restart:
  1. Load last checkpoint
  2. Replay journal entries
  3. Trigger todo-continuation hooks
  4. Resume interrupted work

#### 3.3 Cross-Device Session Continuity
- [ ] Phone starts a conversation
- [ ] Continue on desktop
- [ ] Session context follows the user

---

### Phase 4: Tiara Hook Integration
**Prerequisites: Phase 0.1 complete, Phase 1-3 in progress**

Full hook lifecycle for session management.

#### 4.1 Hook Events
```typescript
// Session lifecycle
'session-start'      // New session created
'session-restore'    // Existing session loaded (triggers todo-continuation)
'session-end'        // Session completed or suspended
'session-transfer'   // Session moving to different device/context

// Todo lifecycle
'todo-continuation'  // Incomplete tasks detected
'todo-completed'     // All tasks done
'todo-blocked'       // Task cannot proceed, needs input

// Daemon lifecycle
'daemon-start'       // Daemon starting up
'daemon-ready'       // Daemon ready to accept work
'daemon-shutdown'    // Graceful shutdown initiated
```

#### 4.2 Integration Points
- [ ] Daemon startup triggers `session-restore` for all active sessions
- [ ] Message gateway triggers `session-start` or `session-restore`
- [ ] TUI session switch triggers `session-restore`
- [ ] All paths check for todo-continuation

---

### Phase 5: Visual Orchestration (Optional Enhancement)
**Prerequisites: All previous phases**

When you're at your desk, see what the personas are doing.

#### 5.1 WezTerm Integration
- [ ] Daemon spawns WezTerm panes when X session available
- [ ] One pane per active drone/task
- [ ] Status pane showing overall system state
- [ ] Graceful degradation when no display

#### 5.2 Web Dashboard (Alternative)
- [ ] Local web server in daemon
- [ ] Real-time status via WebSocket
- [ ] Access from any device on local network
- [ ] Mobile-friendly interface

---

## Current Status

### Completed
- Todo continuation hook infrastructure in tiara
- CLI integration for session-restore with todo-continuation
- Session storage in opencode sync context

### In Progress
- TUI integration (toast, backend reminder, prompt hint)

### Next Steps
1. Implement TUI todo-continuation integrations
2. Create daemon mode skeleton
3. Design message gateway architecture
4. Implement persistent session store

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
- [ ] Switching sessions in TUI shows toast for incomplete todos
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
