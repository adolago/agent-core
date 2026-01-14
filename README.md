> **Fork** — This is a fork of [sst/opencode](https://github.com/sst/opencode) with customizations. All credit goes to the brilliant [SST](https://sst.dev) team and the OpenCode contributors for building such a fantastic experience. Please use the [upstream repository](https://github.com/sst/opencode) for official releases and support. Use this fork at your own risk.

# Agent-Core

[![Version](https://img.shields.io/npm/v/agent-core?style=flat-square)](https://www.npmjs.com/package/agent-core)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

Agent-Core is a CLI agent engine that powers the Personas system (Zee, Stanley, Johny). Built on OpenCode's excellent foundation, it adds persona-based routing, semantic memory, and orchestration capabilities.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Qdrant](https://qdrant.tech) (local or cloud) for semantic memory
- API key for Anthropic (Claude) or OpenAI

### Installation

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

Optional: Google Antigravity (plugin-based OAuth):

```bash
agent-core plugin install opencode-google-auth
agent-core auth login
```

Select **Google** when prompted.

3. Start Qdrant (if running locally):

```bash
docker run -p 6333:6333 qdrant/qdrant
```

### Running

**Interactive TUI:**

```bash
agent-core
```

**Daemon mode (spawns the Zee gateway):**

```bash
agent-core daemon --hostname 127.0.0.1 --port 3210
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

- **OpenCode** by [SST](https://github.com/sst/opencode) - The foundation this project builds on
- **Claude-Flow** - SPARC orchestration patterns

## License

Same as upstream OpenCode - see LICENSE file.
