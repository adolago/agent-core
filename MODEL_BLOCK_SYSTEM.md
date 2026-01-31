# Model Block List System

A comprehensive deny-list system for managing model and provider visibility in agent-core.

---

## Overview

| Component | Purpose | Location |
|-----------|---------|----------|
| **Block List Config** | Define what to hide | `.agent-core/model-block-list.jsonc` |
| **Deep Dive Docs** | Provider details | `docs/providers/PROVIDERS_DEEP_DIVE.md` |
| **CLI Tool** | Manage block list | `scripts/model-block-cli.ts` |
| **Audit Report** | Full catalog | `MODELS_AND_PROVIDERS_AUDIT.md` |

---

## Principle: Deny-List Approach

```
DEFAULT STATE: All models are VISIBLE
                    |
                    v
BLOCK LIST: Define what to HIDE
                    |
                    v
RESULT: Only unwanted models hidden
```

This is the opposite of a whitelist approach where everything is hidden by default.

---

## Quick Start

### 1. View Current Block List

```bash
bun run scripts/model-block-cli.ts list
```

### 2. Block a Model

```bash
bun run scripts/model-block-cli.ts add-model openai gpt-4o
```

### 3. Block a Provider

```bash
bun run scripts/model-block-cli.ts add-provider xai
```

### 4. Apply to Config

```bash
bun run scripts/model-block-cli.ts apply
```

---

## Pre-Configured Block List

The default block list (`.agent-core/model-block-list.jsonc`) includes deprecated models:

### Blocked by Default (Commented)

| Provider | Models | Reason |
|----------|--------|--------|
| OpenAI | gpt-4, gpt-4-turbo, gpt-4o, gpt-4o-mini | Replaced by GPT-5 |
| Google | gemini-2.5-flash, gemini-2.5-pro | Replaced by Gemini 3 |
| xAI | grok-2, grok-3 series | Replaced by Grok 4 |
| Kimi | kimi-k2-thinking | Replaced by K2.5 |
| Z.AI | glm-4.5, glm-4.6 series | Replaced by GLM 4.7 |

To activate: **uncomment** the entries in the block list file.

---

## Configuration Files

### Block List File

**Path:** `.agent-core/model-block-list.jsonc`

```jsonc
{
  "blocked_providers": [],
  "blocked_models": {
    "openai": ["gpt-4o"]
  },
  "_meta": {
    "principle": "Deny-list approach"
  }
}
```

### Agent-Core Config (Auto-Generated)

**Path:** `~/.config/agent-core/agent-core.jsonc`

```jsonc
{
  "disabled_providers": ["xai"],
  "provider": {
    "openai": {
      "blacklist": ["gpt-4o"]
    }
  }
}
```

---

## CLI Reference

| Command | Description | Example |
|---------|-------------|---------|
| `list` | Show block list | `bun run scripts/model-block-cli.ts list` |
| `add-model` | Block a model | `... add-model openai gpt-4o` |
| `remove-model` | Unblock a model | `... remove-model openai gpt-4o` |
| `add-provider` | Block a provider | `... add-provider xai` |
| `remove-provider` | Unblock a provider | `... remove-provider xai` |
| `check` | Check status | `... check openai/gpt-4o` |
| `apply` | Apply to config | `... apply` |
| `validate` | Validate syntax | `... validate` |

---

## Provider Categories

### LLM Providers (18)

- **Tier 1:** OpenAI, Anthropic, Google
- **Tier 2:** xAI, DeepSeek, MiniMax
- **Tier 3:** Alibaba, Z.AI, Kimi, Moonshot
- **Proxy:** OpenRouter, Synthetic (Venice removed)
- **Local:** Ollama, vLLM
- **Enterprise:** Amazon Bedrock, GitHub Copilot

### Utility Providers

| Category | Count | Providers |
|----------|-------|-----------|
| Embedding | 6 | openai, google, voyage, vllm, local, ollama |
| Reranking | 2 | voyage, vllm |
| TTS | 5 | openai, elevenlabs, minimax, edge, sherpa-onnx |
| STT | 9 | google-stt, google, openai, groq, deepgram + 4 local |
| Image | 1 | openai |
| Web Search | 3 | brave, perplexity, exa |

---

## Model Status Legend

| Status | Meaning | Action |
|--------|---------|--------|
| `active` | Production ready | Use freely |
| `deprecated` | Scheduled removal | **Auto-hidden** |
| `beta` | Testing phase | Available, may have issues |
| `alpha` | Early access | Available, experimental |
| `blocked` | In block list | **Hidden** |

---

## File Structure

```
agent-core/
├── .agent-core/
│   └── model-block-list.jsonc      # Block list config
├── docs/providers/
│   └── PROVIDERS_DEEP_DIVE.md      # Detailed provider docs
├── scripts/
│   ├── model-block-cli.ts          # CLI tool
│   └── README.md                   # CLI documentation
├── MODELS_AND_PROVIDERS_AUDIT.md   # Full audit report
└── MODEL_BLOCK_SYSTEM.md           # This file
```

---

## Best Practices

### 1. Use Block List for Deprecated Models

Don't delete old entries - keep them as documentation.

### 2. Comment Why Something is Blocked

```jsonc
{
  "blocked_models": {
    "openai": [
      // Blocked: superseded by GPT-5 series
      "gpt-4o"
    ]
  }
}
```

### 3. Version Control Your Block List

```bash
git add .agent-core/model-block-list.jsonc
```

### 4. Validate Before Apply

```bash
bun run scripts/model-block-cli.ts validate
bun run scripts/model-block-cli.ts apply
```

---

## Troubleshooting

### Model Still Showing After Block

1. Check block list: `bun run scripts/model-block-cli.ts list`
2. Verify applied: `bun run scripts/model-block-cli.ts apply`
3. Restart agent-core daemon

### Can't Find Block List

The tool creates a default one at `./.agent-core/model-block-list.jsonc` when you first run `list`.

### Apply Failed

1. Validate syntax: `bun run scripts/model-block-cli.ts validate`
2. Check config exists: `ls ~/.config/agent-core/`
3. Try manual apply - copy blocked items to your config

---

## Summary

This system provides:

1. **Transparency** - All models visible by default
2. **Control** - Easy to hide what you don't want
3. **Documentation** - Full provider deep dive
4. **Automation** - CLI tool for management
5. **Audit Trail** - Complete model catalog

Total: **150+ models** across **35+ providers**, **30+ deprecated models** documented.
