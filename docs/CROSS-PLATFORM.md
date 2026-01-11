# Cross-Platform Integration Guide

Agent-core supports cross-platform session sync and notifications across TUI, mobile (Zee app), and web interfaces.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENT-CORE SERVER                            │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   REST API  │  │  SSE Events │  │   Gateways  │                │
│  │ /session/*  │  │ /events     │  │ Telegram    │                │
│  │ /notify     │  │ /session/   │  │ WhatsApp    │                │
│  │ /handoff    │  │   :id/events│  │             │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                        │
│         └────────────────┼────────────────┘                        │
│                          │                                         │
│              ┌───────────▼───────────┐                            │
│              │   SESSION STORAGE     │                            │
│              │   ~/.local/share/     │                            │
│              │   agent-core/storage/ │                            │
│              └───────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │   TUI   │       │ Mobile  │       │   Web   │
   │ (This)  │       │  (Zee)  │       │(OpenCode)
   └─────────┘       └─────────┘       └─────────┘
```

## API Endpoints

### Session Events (SSE)

Subscribe to real-time session updates:

```bash
# Subscribe to a specific session
curl -N http://localhost:4096/session/{sessionID}/events

# Subscribe to all sessions (dashboard)
curl -N http://localhost:4096/events
```

**Event Types:**
- `session.created` - New session created
- `session.updated` - Session modified
- `session.deleted` - Session deleted
- `session.status` - Processing status changed
- `session.idle` - Session became idle
- `message.updated` - Message added/modified
- `message.part.updated` - Streaming message part
- `todo.updated` - Todo list changed
- `connected` - Initial connection established
- `keepalive` - Heartbeat (every 30s)

**Example Event:**
```
event: session.updated
data: {"id":"session_abc123","title":"Debug session","time":{"updated":1234567890}}

event: message.updated
data: {"id":"msg_xyz","sessionID":"session_abc123","role":"assistant"}
```

### Session Handoff

Transfer a session to another platform:

```bash
curl -X POST http://localhost:4096/session/{sessionID}/handoff \
  -H "Content-Type: application/json" \
  -d '{"targetSurface": "mobile"}'
```

**Response:**
```json
{
  "sessionID": "session_abc123",
  "title": "Debug session",
  "surface": "mobile",
  "timestamp": 1234567890,
  "messageCount": 15,
  "lastMessage": "The issue was in the config...",
  "todos": [...],
  "resumeUrl": "agentcore://session/session_abc123"
}
```

**Target Surfaces:**
- `mobile` - Deep link to Zee mobile app
- `web` - URL to web interface
- `cli` - Resume in TUI
- `telegram` - Continue via Telegram
- `whatsapp` - Continue via WhatsApp

### Cross-Platform Notifications

Send notifications across all platforms:

```bash
curl -X POST http://localhost:4096/notify \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Task Complete",
    "message": "Build succeeded with 0 errors",
    "sessionID": "session_abc123",
    "platforms": ["telegram", "whatsapp"],
    "persona": "zee"
  }'
```

**Response:**
```json
{
  "success": true,
  "results": [
    {"platform": "telegram", "success": true},
    {"platform": "whatsapp", "success": false, "error": "Not connected"}
  ]
}
```

## Integration Patterns

### Mobile App Integration

1. **Session Discovery**
   ```typescript
   // List recent sessions
   const sessions = await fetch('/session?limit=10')

   // Subscribe to updates
   const events = new EventSource(`/session/${sessionID}/events`)
   events.onmessage = (e) => updateUI(JSON.parse(e.data))
   ```

2. **Resume Session**
   ```typescript
   // Get handoff data
   const handoff = await fetch(`/session/${id}/handoff`, {
     method: 'POST',
     body: JSON.stringify({ targetSurface: 'mobile' })
   })

   // Send message to continue
   await fetch(`/session/${id}/message`, {
     method: 'POST',
     body: JSON.stringify({ content: 'Continue from mobile' })
   })
   ```

3. **Receive Notifications**
   ```typescript
   // Subscribe to global events for notification triggers
   const events = new EventSource('/events')
   events.addEventListener('session.idle', (e) => {
     showNotification('Task complete', JSON.parse(e.data))
   })
   ```

### Web Dashboard Integration

```typescript
// Dashboard monitoring all sessions
const events = new EventSource('/events')

events.addEventListener('session.created', (e) => {
  addToSessionList(JSON.parse(e.data))
})

events.addEventListener('session.status', (e) => {
  updateSessionStatus(JSON.parse(e.data))
})

events.addEventListener('session.idle', (e) => {
  markSessionComplete(JSON.parse(e.data))
})
```

### Gateway Integration

Telegram and WhatsApp gateways already support session continuity:

```typescript
// Telegram gateway automatically tracks sessions per chat
// WhatsApp gateway tracks sessions per phone number

// Send proactive message
await fetch('/gateway/telegram/send', {
  method: 'POST',
  body: JSON.stringify({
    persona: 'zee',
    chatId: 123456789,
    message: 'Your analysis is ready!'
  })
})
```

## Deep Linking

Agent-core uses the `agentcore://` URL scheme:

| URL | Action |
|-----|--------|
| `agentcore://session/{id}` | Open specific session |
| `agentcore://new?persona=zee` | New session with persona |
| `agentcore://handoff?from=telegram&session={id}` | Handoff from gateway |

## Offline Support

For mobile clients that may go offline:

1. **Cache Session State**
   - Store last known session state locally
   - Queue messages when offline

2. **Delta Sync Endpoint**

   Use the dedicated sync endpoint for efficient delta updates:

   ```bash
   # Get all changes since last sync
   curl "http://localhost:4096/sync?since=1705000000000"
   ```

   **Response:**
   ```json
   {
     "timestamp": 1705001234567,
     "sessions": [
       { "id": "session_abc", "title": "Debug session", "time": { "updated": 1705001000000 } }
     ],
     "todos": [
       { "sessionID": "session_abc", "todos": [{ "content": "Fix bug", "status": "pending" }] }
     ]
   }
   ```

   Store `timestamp` for the next sync request.

3. **Full Sync Flow**
   ```typescript
   // Initial sync (no timestamp)
   const initial = await fetch('/sync')
   let lastSync = initial.timestamp

   // Delta sync on reconnect
   const delta = await fetch(`/sync?since=${lastSync}`)
   mergeChanges(delta.sessions, delta.todos)
   lastSync = delta.timestamp

   // Subscribe to real-time updates
   const events = new EventSource('/events')
   events.onmessage = (e) => handleRealtimeUpdate(e.data)
   ```

4. **Conflict Resolution**
   - Server timestamps are authoritative
   - Last-write-wins for session metadata
   - Messages are append-only (no conflicts)

## Personas API

Get information about available personas:

```bash
curl http://localhost:4096/personas
```

**Response:**
```json
[
  {
    "id": "zee",
    "name": "Zee",
    "description": "Personal assistant for life admin",
    "domain": "personal",
    "capabilities": ["memory", "messaging", "calendar", "contacts", "notifications"],
    "gateway": { "telegram": false, "whatsapp": true }
  },
  {
    "id": "stanley",
    "name": "Stanley",
    "description": "Investing and financial research assistant",
    "domain": "finance",
    "capabilities": ["market-data", "portfolio", "sec-filings", "research", "backtesting"],
    "gateway": { "telegram": true, "whatsapp": false }
  },
  {
    "id": "johny",
    "name": "Johny",
    "description": "Study assistant for learning and knowledge management",
    "domain": "learning",
    "capabilities": ["study", "knowledge-graph", "spaced-repetition", "mastery-tracking"],
    "gateway": { "telegram": true, "whatsapp": false }
  }
]
```

## Theme Preferences API

### List Available Themes

```bash
curl http://localhost:4096/themes
```

**Response:**
```json
[
  { "id": "opencode", "name": "Opencode", "builtin": true },
  { "id": "dracula", "name": "Dracula", "builtin": true },
  { "id": "nord", "name": "Nord", "builtin": true },
  { "id": "zee", "name": "Zee", "builtin": true, "persona": "zee" },
  { "id": "stanley", "name": "Stanley", "builtin": true, "persona": "stanley" },
  { "id": "johny", "name": "Johny", "builtin": true, "persona": "johny" }
]
```

### Get Current Theme

```bash
curl http://localhost:4096/preferences/theme
```

**Response:**
```json
{ "theme": "opencode" }
```

### Set Theme

```bash
curl -X PATCH http://localhost:4096/preferences/theme \
  -H "Content-Type: application/json" \
  -d '{"theme": "dracula"}'
```

**Response:**
```json
{ "theme": "dracula" }
```

## Security Considerations

### Current State
- No authentication on API endpoints
- CORS allows localhost, tauri://, opencode.ai
- Gateway messages require allowlist

### Recommendations
1. Add API key/token validation for production
2. Use HTTPS in production
3. Implement rate limiting
4. Add audit logging for sensitive operations

## Configuration

Add to `~/.config/agent-core/config.json`:

```json
{
  "server": {
    "port": 4096,
    "cors": ["http://localhost:*", "https://your-app.com"]
  },
  "gateway": {
    "telegram": {
      "enabled": true,
      "allowedUsers": [123456789],
      "transcribeAudio": {
        "command": ["openai", "api", "audio.transcriptions.create", "-m", "whisper-1", "-f", "{{MediaPath}}", "--response-format", "text"],
        "timeoutSeconds": 45
      }
    },
    "whatsapp": {
      "enabled": true,
      "allowedPhones": ["+1234567890"]
    }
  }
}
```

### Voice Transcription

Both Telegram and WhatsApp gateways support voice note transcription via a configurable CLI command.

**Configuration:**
- `transcribeAudio.command`: Array of command parts with `{{MediaPath}}` template for the audio file
- `transcribeAudio.timeoutSeconds`: Maximum time to wait for transcription (default: 45)

**Supported transcription CLIs:**
- OpenAI Whisper API: `["openai", "api", "audio.transcriptions.create", "-m", "whisper-1", "-f", "{{MediaPath}}", "--response-format", "text"]`
- whisper.cpp: `["whisper-cpp", "-m", "ggml-base.bin", "-f", "{{MediaPath}}"]`
- Deepgram: Custom script that calls Deepgram API
- Any CLI that outputs transcript text to stdout

## Troubleshooting

### SSE Connection Drops
- Check for proxy/load balancer timeouts
- Keepalive events are sent every 30 seconds
- Client should reconnect on disconnect

### Handoff Fails
- Verify session exists: `GET /session/{id}`
- Check target surface is valid
- Ensure gateways are connected for messaging targets

### Notifications Not Sending
- Check gateway status: `GET /gateway/telegram/chats`
- Verify allowlist includes target users
- Check `results` array for per-platform errors
