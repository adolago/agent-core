---
name: zee
description: Personal assistant for life admin. Use for memory management, messaging (WhatsApp/Telegram/Discord), email (neomutt/notmuch), calendar (khal), contacts (khard), notifications, and cross-platform communication coordination.
includes:
  - personas
  - shared
  - agents-menu
  - pim-classic
---

# zee - Personal Life Assistant

> **Part of the Personas** - Zee shares orchestration capabilities with Stanley and Johny.
> See the `personas` skill for: drone spawning, shared memory, conversation continuity.

zee handles the cognitive load of life administration:
- **Memory**: Remember everything, recall anything
- **Messaging**: WhatsApp, Telegram, Discord coordination
- **Email**: neomutt + notmuch (search) + msmtp (send) + mbsync (sync)
- **Calendar**: khal (TUI) + vdirsyncer (CalDAV sync)
- **Contacts**: khard (TUI) + vdirsyncer (CardDAV sync)
- **Notifications**: Proactive reminders and alerts
- **Expenses**: Splitwise group balances, reimbursements
- **Usage Monitoring**: CodexBar provider limits + reset tracking

## Core Capabilities

### Memory System (Qdrant-backed)
```bash
# Store a memory
npx tsx scripts/zee-memory.ts store "Meeting with John about Q4 planning" --category task

# Search memories
npx tsx scripts/zee-memory.ts search "John Q4" --limit 5

# Pattern learning
npx tsx scripts/zee-memory.ts patterns --category preference
```

### Messaging (Multi-platform)
```bash
# Send WhatsApp message
npx tsx scripts/zee-messaging.ts whatsapp --to "+1234567890" --message "Running 10 min late"

# Send Telegram message
npx tsx scripts/zee-messaging.ts telegram --to "@username" --message "Check this link"

# Broadcast to group
npx tsx scripts/zee-messaging.ts broadcast --group "family" --message "Dinner at 7pm"
```

### Email (neomutt + notmuch)
```bash
# Sync and index email
mbsync -a && notmuch new

# Search email
notmuch search "from:john@example.com subject:meeting"

# Read email (interactive)
neomutt

# Send email
neomutt -s "Quick question" someone@example.com
```

### Calendar (khal)
```bash
# Sync calendars
vdirsyncer sync

# Today's events
khal list

# Add event
khal new 15:00 16:00 "Meeting with John"

# Interactive TUI
ikhal
```

### Contacts (khard)
```bash
# Search contacts
khard list "john"

# Show contact
khard show "John Doe"

# Add new contact
khard new
```

### Calendar Management (Legacy)
```bash
# Check schedule
npx tsx scripts/zee-calendar.ts today

# Find free time
npx tsx scripts/zee-calendar.ts free --duration 1h --within 3d

# Schedule meeting
npx tsx scripts/zee-calendar.ts create "Coffee with Sarah" --when "tomorrow 3pm" --duration 30m
```

### Contacts
```bash
# Search contacts
npx tsx scripts/zee-contacts.ts search "Sarah"

# Get contact details
npx tsx scripts/zee-contacts.ts get "Sarah Johnson"

# Sync from sources
npx tsx scripts/zee-contacts.ts sync --source google,whatsapp
```

### Splitwise (Shared Expenses)
Track shared expenses, balances, and settle-ups via Splitwise API (OAuth token required).
Enable with `zee.splitwise.enabled` in `agent-core.jsonc`.

```bash
# List groups (balances by group)
curl -H "Authorization: Bearer $SPLITWISE_TOKEN" \
  "https://secure.splitwise.com/api/v3.0/get_groups"

# Create expense (see dev.splitwise.com for full payload)
curl -X POST -H "Authorization: Bearer $SPLITWISE_TOKEN" \
  -d "cost=42.50&description=Dinner&group_id=12345" \
  "https://secure.splitwise.com/api/v3.0/create_expense"
```

### CodexBar (Usage Monitoring)
Track provider usage windows and reset timers from the macOS menu bar (CodexBar app + CLI).
Enable with `zee.codexbar.enabled` in `agent-core.jsonc`.

```bash
# Show local cost usage (Codex/Claude)
codexbar cost --provider codex
codexbar cost --provider claude
```

### Browser Automation (Computer Use)
Control a browser programmatically via the Zee gateway. Enable with `zee.browser.enabled` in `agent-core.jsonc`.

**Prerequisites:**
1. Chrome/Chromium running with remote debugging:
   ```bash
   chromium --remote-debugging-port=9222
   ```
2. Zee gateway running (auto-started by `agent-core daemon`)

**Configuration** (`agent-core.jsonc`):
```json
{
  "zee": {
    "browser": {
      "enabled": true,
      "controlUrl": "http://127.0.0.1:18791",
      "profile": "zee"
    }
  }
}
```

**Browser Tools Workflow:**

1. **Check status** - Verify browser server is running
   ```
   zee:browser-status → { "status": "ok", "profiles": ["zee", "chrome"] }
   ```

2. **Navigate** - Go to a URL
   ```
   zee:browser-navigate { url: "https://example.com" }
   ```

3. **Snapshot** - Get ARIA tree with element refs
   ```
   zee:browser-snapshot → Returns accessibility tree with refs like:
   - button[0]: "Submit"
   - textbox[1]: "Search..."
   - link[2]: "Home"
   ```

4. **Interact** - Click, type, fill forms using refs
   ```
   zee:browser-click { ref: "button[0]" }
   zee:browser-type { ref: "textbox[1]", text: "hello world", submit: true }
   zee:browser-fill-form { fields: [
     { ref: "textbox[0]", value: "user@example.com" },
     { ref: "textbox[1]", value: "password123" }
   ]}
   ```

5. **Wait** - Wait for conditions
   ```
   zee:browser-wait { waitFor: "text", value: "Success" }
   zee:browser-wait { waitFor: "element", selector: "#result" }
   ```

6. **Screenshot** - Capture visual state
   ```
   zee:browser-screenshot { fullPage: true }
   ```

### Claude Code Integration
Spawn Claude Code CLI as a subprocess that shares skills and MCP servers with agent-core.

**Prerequisites:**
1. Claude Code CLI installed: `npm install -g @anthropic-ai/claude-code`
2. Authenticated: `claude login`

**Shared Configuration:**
When spawning Claude Code, it automatically inherits:
- MCP servers from `~/.config/agent-core/mcp.json`, `.claude/mcp.json`, `~/.claude/mcp.json`
- Skills directories from `.claude/skills/` and `~/.config/agent-core/skills/`
- Working directory access

**Claude Code Tools Workflow:**

1. **Check status** - Verify Claude Code is ready
   ```
   zee:claude-status → Shows installed, auth status, shared configs
   ```

2. **Spawn with prompt** - Run Claude Code with shared capabilities
   ```
   zee:claude-spawn { prompt: "Explain this codebase", model: "sonnet" }
   zee:claude-spawn { prompt: "Fix the bug", model: "opus", shareMcpConfig: true }
   ```

3. **Continue session** - Resume a conversation
   ```
   zee:claude-spawn { prompt: "Continue from there", sessionId: "abc123" }
   ```

4. **Restrict tools** - Run with limited capabilities
   ```
   zee:claude-spawn {
     prompt: "Review this code",
     allowedTools: ["Read", "Grep"],
     disallowedTools: ["Write", "Edit"]
   }
   ```

## Domain Tools

| Tool | Purpose |
|------|---------|
| `zee:memory-store` | Store facts, preferences, tasks, notes |
| `zee:memory-search` | Semantic search across all memories |
| `zee:messaging` | Send/receive across WhatsApp, Telegram, Discord |
| `neomutt` | Email client (read, compose, reply) |
| `notmuch` | Email search and indexing |
| `mbsync` | IMAP sync (offline email) |
| `msmtp` | SMTP sending |
| `khal` | Calendar TUI (view, add, edit events) |
| `khard` | Contacts TUI (search, add, edit) |
| `vdirsyncer` | CalDAV/CardDAV sync |
| `zee:notification` | Proactive alerts and reminders |
| `zee:splitwise` | Shared expenses, balances, reimbursements |
| `zee:codexbar` | Provider usage monitoring via CodexBar CLI |
| `zee:browser-status` | Check browser control server status |
| `zee:browser-snapshot` | Get ARIA accessibility tree with element refs |
| `zee:browser-navigate` | Navigate to URL |
| `zee:browser-click` | Click element by ref (e.g., "button[3]") |
| `zee:browser-type` | Type text into element |
| `zee:browser-fill-form` | Fill multiple form fields at once |
| `zee:browser-screenshot` | Capture page or element screenshot |
| `zee:browser-wait` | Wait for element, text, or URL |
| `zee:browser-tabs` | List open browser tabs |
| `zee:browser-profiles-list` | List all browser profiles with status |
| `zee:browser-profiles-create` | Create new isolated browser profile |
| `zee:browser-profiles-delete` | Delete a browser profile |
| `zee:browser-profiles-start` | Start browser for a specific profile |
| `zee:browser-profiles-stop` | Stop browser for a specific profile |
| `zee:browser-profiles-reset` | Reset profile (clear all cookies/storage) |
| `zee:claude-status` | Check Claude Code CLI availability and auth |
| `zee:claude-spawn` | Spawn Claude Code with a prompt |
| `zee:claude-credentials` | Check OAuth credential details |
| `zee:sentinel-status` | Check restart sentinel system status |
| `zee:sentinel-save` | Manually save session state for restart recovery |
| `zee:sentinel-restore` | Restore session state from restart sentinel |
| `zee:sentinel-search` | Search similar past sessions using semantic search |
| `zee:cron-status` | Check cron scheduler status and configuration |
| `zee:cron-list` | List all configured cron jobs |
| `zee:cron-add` | Create a new cron job (scheduled, interval, or one-time) |
| `zee:cron-update` | Update an existing cron job |
| `zee:cron-remove` | Remove a cron job |
| `zee:cron-run` | Manually trigger a cron job immediately |
| `zee:cron-runs` | Get run history for a cron job |
| `zee:cron-wake` | Send a wake event to the agent |
| `zee:pty-start` | Start interactive PTY session for TTY commands |
| `zee:pty-list` | List running and finished PTY sessions |
| `zee:pty-poll` | Poll session for new output |
| `zee:pty-send-keys` | Send keystrokes (arrows, ctrl+c, function keys) |
| `zee:pty-paste` | Paste text with bracketed paste mode |
| `zee:pty-log` | Fetch full session output log |
| `zee:pty-kill` | Terminate a running session |
| `zee:pty-clear` | Clear finished session from registry |

## PTY Sessions (Interactive Terminals)

Run interactive terminal commands that require TTY support.

**Use Cases:**
- Interactive interpreters: `python -i`, `node`, `irb`
- Text editors: `vim`, `nano`, `emacs`
- TUI applications: `htop`, `ncdu`, `lazygit`
- Debuggers: `gdb`, `pdb`, `lldb`
- Any command needing terminal input

**PTY Session Workflow:**

1. **Start session** - Launch interactive command
   ```
   zee:pty-start { command: "python3 -i" }
   → sessionId: "abc123"
   ```

2. **Send input** - Type commands or keystrokes
   ```
   zee:pty-send-keys {
     sessionId: "abc123",
     literal: "print('hello')",
     keys: ["enter"]
   }
   ```

3. **Poll output** - Get response
   ```
   zee:pty-poll { sessionId: "abc123" }
   → stdout: "hello\n>>>"
   ```

4. **Paste code** - Safe multi-line paste
   ```
   zee:pty-paste {
     sessionId: "abc123",
     text: "for i in range(3):\n  print(i)",
     bracketed: true
   }
   ```

5. **Kill session** - Terminate when done
   ```
   zee:pty-kill { sessionId: "abc123" }
   ```

**Named Keys:**

| Key | Description |
|-----|-------------|
| `enter`, `tab`, `escape`, `space` | Basic keys |
| `up`, `down`, `left`, `right` | Arrow keys |
| `home`, `end`, `pageup`, `pagedown` | Navigation |
| `f1` - `f12` | Function keys |
| `c-c` | Ctrl+C (SIGINT) |
| `c-d` | Ctrl+D (EOF) |
| `c-z` | Ctrl+Z (SIGTSTP) |
| `c-KEY` | Ctrl + key |
| `m-KEY` | Alt + key |

**Example: Interactive Python Session**

```bash
# Start Python interpreter
zee:pty-start { command: "python3 -i" }

# Define a function
zee:pty-paste {
  sessionId: "abc123",
  text: "def greet(name):\n    return f'Hello, {name}!'"
}
zee:pty-send-keys { sessionId: "abc123", keys: ["enter", "enter"] }

# Call it
zee:pty-send-keys {
  sessionId: "abc123",
  literal: "greet('World')",
  keys: ["enter"]
}

# Check output
zee:pty-poll { sessionId: "abc123" }
→ stdout: "'Hello, World!'\n>>>"

# Exit
zee:pty-send-keys { sessionId: "abc123", keys: ["c-d"] }
```

**Example: Vim Editing**

```bash
# Start vim
zee:pty-start { command: "vim /tmp/test.txt" }

# Enter insert mode and type
zee:pty-send-keys { sessionId: "abc123", keys: ["i"] }
zee:pty-send-keys { sessionId: "abc123", literal: "Hello, World!" }

# Exit insert mode
zee:pty-send-keys { sessionId: "abc123", keys: ["escape"] }

# Save and quit
zee:pty-send-keys { sessionId: "abc123", literal: ":wq", keys: ["enter"] }
```

**Configuration:**

Sessions auto-cleanup after 30 minutes. Environment variables:
- `PI_BASH_JOB_TTL_MS` - Session TTL (default: 30 min)
- `PI_BASH_MAX_OUTPUT_CHARS` - Output limit (default: 200KB)

## Browser Profiles

Manage multiple isolated browser contexts for different purposes (work, personal, testing, etc.).

Each profile has its own:
- Cookies and sessions (separate logins)
- localStorage and sessionStorage
- Browser history and cache
- CDP port for debugging
- Color for visual distinction

**Browser Profile Tools Workflow:**

1. **List profiles** - See all available profiles
   ```
   zee:browser-profiles-list → { profiles: [...], running: 2 }
   ```

2. **Create profile** - New isolated browser context
   ```
   zee:browser-profiles-create {
     name: "work",
     color: "#0066CC"
   }
   ```

3. **Start profile** - Launch browser with profile's data
   ```
   zee:browser-profiles-start { profile: "work" }
   ```

4. **Use browser tools** - All browser tools accept a profile parameter
   ```
   zee:browser-navigate { url: "https://example.com", profile: "work" }
   zee:browser-snapshot { profile: "work" }
   ```

5. **Stop profile** - Close browser (preserves data)
   ```
   zee:browser-profiles-stop { profile: "work" }
   ```

6. **Reset profile** - Clear all data (cookies, storage, cache)
   ```
   zee:browser-profiles-reset { profile: "work" }
   ```

7. **Delete profile** - Remove profile entirely
   ```
   zee:browser-profiles-delete { name: "work" }
   ```

**Profile Types:**

- **Local profiles**: Chrome runs on this machine, data stored locally
- **Remote profiles**: Connect to external Chrome via CDP URL

**Example: Separate Work/Personal Browsers**

```bash
# Create profiles
zee:browser-profiles-create { name: "work", color: "#0066CC" }
zee:browser-profiles-create { name: "personal", color: "#00AA00" }

# Start work browser, login to work accounts
zee:browser-profiles-start { profile: "work" }
zee:browser-navigate { url: "https://mail.google.com", profile: "work" }

# Start personal browser, separate session
zee:browser-profiles-start { profile: "personal" }
zee:browser-navigate { url: "https://mail.google.com", profile: "personal" }

# Each profile maintains its own login state
```

**Configuration** (`agent-core.jsonc`):
```json
{
  "zee": {
    "browser": {
      "enabled": true,
      "defaultProfile": "zee",
      "profiles": {
        "work": {
          "cdpPort": 18802,
          "color": "#0066CC"
        },
        "personal": {
          "cdpPort": 18803,
          "color": "#00AA00"
        },
        "remote": {
          "cdpUrl": "http://browserless.io:3000",
          "color": "#FF6699"
        }
      }
    }
  }
}
```

## Cron Scheduling

Automate recurring tasks without external schedulers. Cron jobs run via the Zee gateway.

**Schedule Types:**
- **cron**: Standard cron expressions (e.g., `0 9 * * *` for 9am daily)
- **every**: Intervals in milliseconds (e.g., 3600000 for hourly)
- **at**: One-time run at specific timestamp

**Payload Types:**
- **systemEvent**: Inject text into agent context
- **agentTurn**: Run agent with specific message

**Cron Tools Workflow:**

1. **Check status** - Verify cron scheduler is running
   ```
   zee:cron-status → { enabled: true, running: true, jobCount: 3 }
   ```

2. **List jobs** - See all scheduled jobs
   ```
   zee:cron-list { includeDisabled: true }
   ```

3. **Create job** - Schedule a recurring task
   ```
   zee:cron-add {
     job: {
       name: "Morning standup",
       schedule: { kind: "cron", expr: "0 9 * * *" },
       payload: { kind: "systemEvent", text: "Time for morning standup" }
     }
   }
   ```

4. **Update job** - Modify schedule or disable
   ```
   zee:cron-update {
     jobId: "abc123",
     patch: { enabled: false }
   }
   ```

5. **Run manually** - Test a job immediately
   ```
   zee:cron-run { jobId: "abc123" }
   ```

6. **Check history** - View run results
   ```
   zee:cron-runs { jobId: "abc123" }
   ```

7. **Wake agent** - Send immediate or deferred wake event
   ```
   zee:cron-wake { text: "Check inbox now", mode: "now" }
   ```

**Example Jobs:**

```bash
# Daily 9am reminder
zee:cron-add {
  job: {
    name: "Daily standup",
    schedule: { kind: "cron", expr: "0 9 * * MON-FRI", tz: "America/New_York" },
    payload: { kind: "systemEvent", text: "Morning standup reminder" }
  }
}

# Hourly health check
zee:cron-add {
  job: {
    name: "Health check",
    schedule: { kind: "every", everyMs: 3600000 },
    sessionTarget: "isolated",
    payload: { kind: "agentTurn", message: "Run system health check and report issues" }
  }
}

# One-time reminder (deletes after run)
zee:cron-add {
  job: {
    name: "Meeting reminder",
    schedule: { kind: "at", atMs: 1706104800000 },
    deleteAfterRun: true,
    payload: { kind: "systemEvent", text: "Meeting with John in 15 minutes" }
  }
}
```

**Configuration** (`agent-core.jsonc`):
```json
{
  "zee": {
    "cron": {
      "enabled": true,
      "store": "~/.local/state/agent-core/cron.json",
      "maxConcurrentRuns": 3
    }
  }
}
```

## Stay-Up (Restart Sentinel)

Never lose context when the daemon restarts or crashes. The restart sentinel:
- Captures session state (key facts, objectives, pending tasks) on shutdown
- Stores context in Qdrant with semantic embeddings for search
- Automatically restores interrupted sessions on startup
- Uses Nebius QWEN 8B embeddings (4096 dimensions) for semantic context

**Configuration** (`agent-core.jsonc`):
```json
{
  "memory": {
    "qdrant": {
      "url": "http://localhost:6333"
    },
    "embedding": {
      "profile": "nebius/qwen3-embedding-8b"
    }
  }
}
```

**Sentinel Tools Workflow:**

1. **Check status** - Verify sentinel system is ready
   ```
   zee:sentinel-status → { qdrant: "connected", embedding: { provider: "nebius", dimension: 4096 } }
   ```

2. **Manual save** - Save current session before update/restart
   ```
   zee:sentinel-save {
     sessionKey: "my-session",
     keyFacts: ["Working on feature X", "User prefers TypeScript"],
     objectives: ["Complete the implementation"],
     pendingTasks: ["Write tests", "Update docs"]
   }
   ```

3. **Restore after restart** - Get saved context
   ```
   zee:sentinel-restore {} → { sessions: [...], contextSummary: "..." }
   ```

4. **Search past sessions** - Find similar contexts
   ```
   zee:sentinel-search { query: "implementing browser automation" }
   ```

**Automatic Integration:**
- On daemon shutdown: Session state is automatically saved
- On daemon startup: Pending sentinel is automatically restored
- Sessions with incomplete todos are highlighted for continuation

## Daemon Install Wizard

Install agent-core daemon as a system service for always-on operation.

**IMPORTANT:** Agent-core daemon is the PRIMARY service. Zee gateway runs as a child
process when `--gateway` is enabled. Do NOT install zee gateway separately.

**Supported Platforms:**
- **macOS**: LaunchAgent via launchd (auto-start on login)
- **Linux**: systemd user service (requires linger for persistence after logout)

**Installation Commands:**
```bash
# Interactive wizard
agent-core daemon-install

# With options
agent-core daemon-install --port 3210 --gateway

# Non-interactive (for scripts)
agent-core daemon-install --non-interactive --gateway

# Check status
agent-core daemon-service-status

# Uninstall
agent-core daemon-uninstall
```

**Options:**
| Option | Description |
|--------|-------------|
| `--port` | Daemon port (default: 3210) |
| `--hostname` | Bind hostname (default: 127.0.0.1) |
| `--gateway` | Enable zee messaging gateway (WhatsApp/Telegram/Signal) |
| `--gateway-force` | Force gateway start even if preflight fails |
| `--wezterm` | Enable WezTerm visual orchestration (default: true) |
| `--directory` | Working directory for daemon |
| `--force` | Force reinstall if already installed |
| `--non-interactive` | Skip prompts (for scripting) |

**Service Locations:**
- **macOS**: `~/Library/LaunchAgents/com.agent-core.daemon.plist`
- **Linux**: `~/.config/systemd/user/agent-core-daemon.service`

**Log Locations:**
- `~/.local/state/agent-core/logs/daemon.log`
- `~/.local/state/agent-core/logs/daemon.err.log`

**Linux systemd linger:**
Required for service to continue running after logout:
```bash
sudo loginctl enable-linger $USER
```

**Service Management:**
```bash
# macOS
launchctl kickstart -k gui/$(id -u)/com.agent-core.daemon  # restart
launchctl bootout gui/$(id -u)/com.agent-core.daemon       # stop

# Linux
systemctl --user restart agent-core-daemon.service
systemctl --user stop agent-core-daemon.service
systemctl --user status agent-core-daemon.service
journalctl --user -u agent-core-daemon.service -f          # logs
```

## Runtime Status

Check shared runtime status:

```bash
npx tsx scripts/zee-daemon.ts status
```

## Memory Categories

- **conversation**: Chat history and context
- **fact**: Important information to remember
- **preference**: User likes/dislikes, habits
- **task**: To-dos and action items
- **decision**: Past decisions and reasoning
- **relationship**: People and connections
- **note**: General notes and observations
- **pattern**: Learned behaviors and routines

## Usage Examples

### Remember Something
```
User: "Remember that Sarah prefers oat milk"
zee: Stores as preference, links to Sarah contact
     Will recall when relevant (coffee orders, restaurant choices)
```

### Coordinate Communication
```
User: "Tell the team I'll be late"
zee: Identifies "team" from context
     Sends appropriate message to each platform
     WhatsApp group, Slack channel, or email as configured
```

### Smart Scheduling
```
User: "Schedule lunch with John next week"
zee: Checks both calendars (if shared)
     Finds mutual free time
     Proposes options considering travel time
     Creates event with location suggestion
```

### Morning Brief
```
User: "What's my day look like?"
zee: Today's calendar with context
     Pending tasks and reminders
     Unread messages needing response
     Upcoming deadlines
```

## Surfaces

zee operates across multiple surfaces:
- **CLI**: Direct terminal interaction
- **Web**: Browser-based interface
- **API**: Programmatic access
- **WhatsApp**: Chat-based interaction
- **Telegram**: Bot interface
- **Discord**: Server/DM integration

## MCP Servers

- `tiara` - Orchestration and memory

## Integration Points

- **agent-core**: `/src/domain/zee/tools.ts`
- **Browser**: `/src/domain/zee/browser.ts` (Playwright via Zee gateway)
- **Plugins**: `/src/plugin/builtin/domains/zee-messaging.ts`
- **Memory**: `/src/plugin/builtin/memory-persistence.ts`
- **Qdrant**: Vector database for semantic memory
- **CodexBar**: Menu bar usage tracking + `codexbar` CLI
- **Splitwise**: Expense sharing API (`https://secure.splitwise.com/api/v3.0`)
- **Zee Gateway**: Browser control server at `http://127.0.0.1:18791`

## Permissions

- Edit: allow (notes, drafts)
- Git: allow (personal projects)
- External directory: deny (privacy protection)
- Messaging APIs: allow (with user consent)

## When to Use zee

- Remembering important information
- Coordinating across messaging platforms
- Calendar and scheduling
- Contact management
- Personal task tracking
- Life admin automation
- Morning/evening briefings
- Browser automation (form filling, web scraping, UI testing)

---

## Enhanced Capabilities (Sisyphus-derived)

*Zee inherits coordination and visual capabilities from the Sisyphus ecosystem*

### Multimodal Analysis (Messages & Screenshots)

Understand visual content for life admin:

```
Multimodal Protocol for Zee:
1. Analyze message screenshots (WhatsApp, Telegram)
2. Extract key information (dates, names, actions)
3. Store in memory for future recall
4. Suggest follow-up actions
```

**Use Multimodal for:**
- Screenshot of conversation to remember
- Receipt/invoice processing
- Ticket/booking confirmation parsing
- UI navigation assistance

### Interactive Terminal Sessions

Manage background processes:

```
Interactive Bash Protocol:
1. Spawn persistent terminal sessions (via tmux/WezTerm)
2. Run long-running tasks in background
3. Check on status periodically
4. Collect output when complete
```

**Use Interactive Bash for:**
- Running scripts that take time
- Monitoring logs
- Parallel task execution
- Background data syncing

### Frontend UI Assistance

When you need visual interfaces:

```
Frontend Protocol:
1. Identify UI requirement
2. Delegate to Frontend Engineer agent
3. Review proposed design
4. Iterate on feedback
```

**Use Frontend for:**
- Personal dashboards
- Notification displays
- Quick utilities
- Visual tools

### Tool Selection for Life Admin

| Need | Tool | Why |
|------|------|-----|
| Remember something | `zee:memory-store` | Semantic storage |
| Find past info | `zee:memory-search` | Context recall |
| Analyze image | Multimodal Looker | Visual understanding |
| Run background task | Interactive Bash | Persistent execution |
| Schedule event | `khal new` | CalDAV-synced calendar |
| Search email | `notmuch search` | Fast indexed search |
| Find contact | `khard list` | CardDAV-synced contacts |

### Delegation Triggers

Zee should delegate when:

| Situation | Delegate To | Reason |
|-----------|------------|--------|
| Financial question | Stanley | Domain expertise |
| Learning request | Johny | Study system |
| Code implementation | Johny (Oracle) | Code understanding |
| Chart/trading visual | Stanley (Multimodal) | Financial context |

### Zee's Life Admin Rules

1. **Capture immediately** - Store memories before context is lost
2. **Proactive reminders** - Don't wait to be asked
3. **Cross-reference** - Link related information
4. **Respect privacy** - Sensitive data stays local
5. **Minimize friction** - Make life easier, not harder
