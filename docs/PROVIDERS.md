# Provider Configuration

This document describes the working provider setup for agent-core.

## Config Locations

| Type                    | Location                                         |
| ----------------------- | ------------------------------------------------ |
| Project config          | `.agent-core/agent-core.jsonc` (in project root) |
| Global config (symlink) | `~/.config/agent-core/agent-core.jsonc`          |
| Agent definitions       | `.agent-core/agent/` (in project root)           |
| Global agents (symlink) | `~/.config/agent-core/agent/`                    |

The global config is symlinked to project config so changes in one location reflect in both.

## Providers

### Google (Antigravity)

Free-tier models via an optional OAuth plugin. Agent-core does not include a built-in Antigravity OAuth flow.

Install and authenticate:

```bash
agent-core auth login
```

Select **Google** when prompted.

**Provider ID:** `google`

**Available Models:**
| Model ID | Display Name | Type |
|----------|--------------|------|
| `google/antigravity-claude-opus-4-5-thinking` | Claude Opus 4.5 Thinking | Reasoning |
| `google/antigravity-claude-sonnet-4-5` | Claude Sonnet 4.5 | Standard |
| `google/antigravity-claude-sonnet-4-5-thinking` | Claude Sonnet 4.5 Thinking | Reasoning |
| `google/antigravity-gemini-3-pro` | Gemini 3 Pro | Reasoning |
| `google/antigravity-gemini-3-flash` | Gemini 3 Flash | Fast |

**Notes:**

- Models are hardcoded in `provider.ts` and auto-loaded when the antigravity plugin detects auth
- Opus 4.5 is only available as the `-thinking` variant
- Thinking models require `topP >= 0.95` (handled automatically by ProviderTransform)

### xAI (Grok)

**Provider ID:** `xai`

**Environment:** `XAI_API_KEY`

**Base URL:** `https://api.x.ai/v1`

**Available Models:**
| Model ID | Display Name | Reasoning | Context | Cost (In/Out per 1M) |
|----------|--------------|-----------|---------|----------------------|
| grok-4-1-fast | Grok 4.1 Fast | Yes | 2M | $0.2/$0.5 |
| grok-4 | Grok 4 | Yes | 256K | $3/$15 |
| grok-4-fast | Grok 4 Fast | Yes | 2M | $0.2/$0.5 |
| grok-3 | Grok 3 | No | 131K | $3/$15 |
| grok-2 | Grok 2 | No | 131K | $2/$10 |

**Notes:**
- Models are auto-loaded from models.dev registry
- Grok 4.1 Fast is recommended for Stanley (reasoning + tool calling + vision)
- 2M context window enables large document analysis

### OpenRouter

**Provider ID:** `openrouter`

**Environment:** `OPENROUTER_API_KEY`

Access to various models including Grok, Llama, etc.

## Disabled Providers

These are disabled in `agent-core.jsonc`:

- `google-vertex` - Direct Vertex AI (redundant with Antigravity)
- `google-vertex-anthropic` - Vertex Claude (redundant with Antigravity)

## Agent Defaults

| Agent      | Default Model                                 | Purpose                      |
| ---------- | --------------------------------------------- | ---------------------------- |
| Zee        | `zai-coding-plan/glm-4.7`                     | Personal assistant           |
| Stanley    | `xai/grok-4-1-fast`                           | Investing assistant          |
| Johny      | `google/antigravity-claude-opus-4-5-thinking` | Learning assistant           |
| title      | `openrouter/meta-llama/llama-3.3-70b-instruct`| Conversation titles (hidden) |
| compaction | `google/antigravity-gemini-3-flash`           | Context compaction (hidden)  |

## Auth Storage

| Provider             | Auth Location                                            | Type    |
| -------------------- | -------------------------------------------------------- | ------- |
| Google (Antigravity) | `~/.local/share/agent-core/auth.json` under `google` key | OAuth   |
| Z.AI Coding Plan     | Environment variable                                     | API Key |
| xAI                  | Environment variable                                     | API Key |
| OpenRouter           | Environment variable                                     | API Key |

## Adding New Models

To add custom models to an existing provider, add to the `provider` section in `agent-core.jsonc`:

```jsonc
"provider": {
  "provider-id": {
    "models": {
      "model-id": {
        "name": "Display Name",
        "temperature": true,
        "reasoning": false,
        "tool_call": true,
        "attachment": true,
        "limit": { "context": 200000, "output": 8192 },
        "cost": { "input": 0, "output": 0 }
      }
    }
  }
}
```
