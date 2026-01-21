# agent-core

Agent-core is a CLI + daemon that powers the Personas system (Zee, Stanley, Johny).

- **Version:** v0.1.0-20260114
- **Prebuilt targets:** Linux x64, macOS arm64 (Apple Silicon)
- **Other platforms:** build from source

## Install

```bash
npm install -g @adolago/agent-core@0.1.0-20260114
```

## Configure

Agent-core reads JSONC config from `~/.config/agent-core/agent-core.jsonc` or `.agent-core/agent-core.jsonc`.
Environment variables are used only for secrets.

Minimal memory configuration:

```jsonc
{
  "memory": {
    "qdrant": {
      "url": "http://localhost:6333",
      "collection": "personas_memory"
    },
    "embedding": {
      "profile": "nebius/qwen3-embedding-8b",
      "dimensions": 4096,
      "apiKey": "{env:NEBIUS_API_KEY}"
    }
  }
}
```

## Run

```bash
agent-core
agent-core --no-daemon
agent-core daemon --hostname 127.0.0.1 --port 3210
```
