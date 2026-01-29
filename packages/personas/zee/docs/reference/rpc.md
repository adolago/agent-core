---
read_when:
  - Adding or changing external CLI integrations
---
# RPC adapters

Zee integrates external CLIs via JSON-RPC. Two patterns are used today.

## Pattern A: HTTP daemon (signal-cli)
- `signal-cli` runs as a daemon with JSON-RPC over HTTP.
- Event stream is SSE (`/api/v1/events`).
- Health probe: `/api/v1/check`.
- Zee owns lifecycle when `channels.signal.autoStart=true`.

See [Signal](/channels/signal) for setup and endpoints.

- JSON-RPC is line-delimited over stdin/stdout (one JSON object per line).
- No TCP port, no daemon required.

Core methods used:
- `watch.subscribe` → notifications (`method: "message"`)
- `watch.unsubscribe`
- `send`
- `chats.list` (probe/diagnostics)


## Adapter guidelines
- Gateway owns the process (start/stop tied to provider lifecycle).
- Keep RPC clients resilient: timeouts, restart on exit.
- Prefer stable IDs (e.g., `chat_id`) over display strings.
