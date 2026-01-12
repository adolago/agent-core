# Agent-Core

> **Fork of [sst/opencode](https://github.com/sst/opencode)** — Built on OpenCode. All credit goes to the brilliant [SST](https://sst.dev) team and the OpenCode contributors for creating an exceptional open-source AI coding agent. This fork extends OpenCode with a specialized personas system, semantic memory, and multi-surface orchestration. Please use the upstream repository for official releases and support; use this fork at your own risk.

Agent-Core is a CLI agent engine that powers the Personas system (Zee, Stanley, Johny). Built on OpenCode's excellent foundation, it adds persona-based routing, semantic memory, and orchestration capabilities.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Qdrant](https://qdrant.tech) (local or cloud) for semantic memory
- API key for Anthropic (Claude) or OpenAI

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/agent-core.git ~/.local/src/agent-core

# Install dependencies
cd ~/.local/src/agent-core
bun install

# Build the project
cd packages/agent-core
bun run build

# Install the binary (optional)
cp dist/agent-core-linux-x64/bin/agent-core ~/bin/agent-core
```

### Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` and add your API keys:
```bash
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...  # For embeddings
QDRANT_URL=http://localhost:6333
```

3. Start Qdrant (if running locally):
```bash
docker run -p 6333:6333 qdrant/qdrant
```

### Running

**Interactive TUI:**
```bash
agent-core
```

**Daemon mode (for Zee gateway):**
```bash
agent-core daemon --gateway --hostname 127.0.0.1 --port 3210
```

## Architecture

```
agent-core/
├── packages/agent-core/    # Main CLI and TUI (OpenCode fork)
├── src/
│   ├── personas/           # Persona logic and routing
│   ├── memory/             # Qdrant semantic memory
│   ├── daemon/             # HTTP/IPC daemon
│   └── domain/             # Domain tools (zee/, stanley/)
├── vendor/tiara/           # Orchestration layer (SPARC methodology)
└── .claude/skills/         # Persona skill definitions
```

### Personas

| Persona | Domain | Description |
|---------|--------|-------------|
| **Zee** | Personal Assistant | Memory, messaging, calendar, notifications |
| **Stanley** | Investing | Markets, portfolio, trading strategies |
| **Johny** | Learning | Knowledge graphs, spaced repetition |

### Key Features

- **Semantic Memory**: Vector-based memory with Qdrant for context persistence
- **Multi-Persona Routing**: Route messages to specialized personas
- **Orchestration**: SPARC methodology via tiara for complex tasks
- **External Gateway**: HTTP API for messaging platform integration

## Usage with Zee Gateway

The Zee Gateway handles messaging platforms (WhatsApp, Telegram, Discord, etc.) and routes to agent-core:

```bash
# Terminal 1: Start agent-core daemon
agent-core daemon --gateway

# Terminal 2: Start zee gateway
cd ~/Repositories/personas/zee
pnpm zee gateway
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

## Credits

- **OpenCode** by [SST](https://github.com/sst/opencode) - The foundation this project builds on
- **Claude-Flow** - SPARC orchestration patterns

## License

Same as upstream OpenCode - see LICENSE file.
