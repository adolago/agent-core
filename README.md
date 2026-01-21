# Agent-Core

[![Version](https://img.shields.io/npm/v/@adolago/agent-core?style=flat-square)](https://www.npmjs.com/package/@adolago/agent-core)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

Agent-Core is a CLI agent engine that powers the Personas system (Zee, Stanley, Johny). It adds persona-based routing, semantic memory, and orchestration capabilities.

## Release

- **Version:** v0.1.0-20260114
- **Prebuilt targets:** Linux x64, macOS arm64 (Apple Silicon)
- **Other platforms:** build from source

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Qdrant](https://qdrant.tech) (local or cloud) for semantic memory
- API key for your model provider (Anthropic, OpenAI, Google, etc.)

### Install (prebuilt)

Prebuilt binaries are published to npm for Linux x64 and macOS arm64:

```bash
npm install -g @adolago/agent-core@0.1.0-20260114
```

### Install (from source)

```bash
# Clone the repository
git clone https://github.com/yourusername/agent-core.git

# Install dependencies
cd agent-core
bun install

# Build the project
cd packages/agent-core
bun run build

# Install the binary (optional)
cp dist/agent-core-linux-x64/bin/agent-core ~/bin/agent-core
# macOS arm64:
# cp dist/agent-core-darwin-arm64/bin/agent-core ~/bin/agent-core
```

### Configuration

Agent-core reads JSONC config from `~/.config/agent-core/agent-core.jsonc` or `.agent-core/agent-core.jsonc`.
Environment variables are used only for secrets (Qdrant settings are config-only).

Example memory + embeddings configuration:

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
  },
  "tiara": {
    "qdrant": {
      "url": "http://localhost:6333",
      "stateCollection": "personas_state",
      "memoryCollection": "personas_memory",
      "embeddingDimension": 4096
    }
  }
}
```

Set secrets via environment variables:

```bash
export ANTHROPIC_API_KEY="..."
export OPENAI_API_KEY="..."     # If using OpenAI embeddings
export GOOGLE_API_KEY="..."     # If using Google embeddings
export NEBIUS_API_KEY="..."     # If using Nebius embeddings
```

Optional: Google Antigravity (plugin-based OAuth):

```bash
agent-core plugin install opencode-google-auth
agent-core auth login
```

Select **Google** when prompted.

Start Qdrant (if running locally):

```bash
docker run -p 6333:6333 qdrant/qdrant
```

### Embedding profiles

Common profiles you can set in `memory.embedding.profile`:

- `nebius/qwen3-embedding-8b` (4096 dims)
- `openai/text-embedding-3-small` (1536 dims) + `openai/text-embedding-3-small-512` / `-1024`
- `openai/text-embedding-3-large` (3072 dims) + `openai/text-embedding-3-large-1024` / `-1536`
- `google/text-embedding-004` (768 dims)

You can also override with `provider`, `model`, `dimensions`, `baseUrl`, and `apiKey`.

Keep Qdrant collection dimensions aligned with your embedding dimensions by setting
`memory.embedding.dimensions` and `tiara.qdrant.embeddingDimension` to the same value.

### Running

**Interactive TUI (auto-starts daemon + gateway if needed):**

```bash
agent-core
agent-core --no-daemon   # run without the daemon (local worker only)
```

**Daemon mode (spawns the Zee gateway):**

```bash
agent-core daemon --hostname 127.0.0.1 --port 3210
```

## Architecture

```
agent-core/
├── packages/agent-core/    # Main CLI/TUI/daemon
├── src/
│   ├── personas/           # Persona logic and routing
│   ├── memory/             # Qdrant semantic memory
│   └── domain/             # Domain tools (zee/, stanley/)
├── vendor/tiara/           # Orchestration layer (SPARC methodology)
└── .claude/skills/         # Persona skill definitions
```

### Personas

| Persona     | Domain             | Description                                |
| ----------- | ------------------ | ------------------------------------------ |
| **Zee**     | Personal Assistant | Memory, messaging, calendar, notifications |
| **Stanley** | Investing          | Markets, portfolio, trading strategies     |
| **Johny**   | Learning           | Knowledge graphs, spaced repetition        |

### Key Features

- **Semantic Memory**: Vector-based memory with Qdrant for context persistence
- **Multi-Persona Routing**: Route messages to specialized personas
- **Orchestration**: SPARC methodology via tiara for complex tasks
- **Embedded Gateway**: Zee messaging gateway launched by agent-core

## Usage with Zee Gateway

The Zee gateway is launched and supervised by agent-core when the daemon starts:

```bash
agent-core daemon
```

Messages mentioning `@stanley` or `@johny` are routed to those personas; all others go to Zee.

## Development

```bash
# Run tests
bun test

# Build
bun run build

# Type check
bun run typecheck
```

## Wide events

Agent-core emits wide event JSONL logs for per-request diagnostics:

```bash
agent-core logs wide --lines 50
agent-core logs wide --where sessionId=session_123
```

## Credits

- **Claude-Flow** - SPARC orchestration patterns

## License

See LICENSE file.
