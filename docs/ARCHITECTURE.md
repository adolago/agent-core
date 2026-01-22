# Agent Core Architecture

## Overview

Agent Core is a unified foundation for AI agent applications, designed to power three primary surfaces:

- **Stanley**: Native GUI application built with GPUI (Rust-based)
- **Zee**: Messaging assistant for WhatsApp, Telegram, Discord, and more
- **Agent-Core**: CLI/TUI development environment

## Design Principles

1. **Surface Agnostic**: Core logic is independent of presentation layer
2. **Provider Portable**: Seamless switching between 15+ LLM providers
3. **Memory Unified**: Cross-surface memory sharing via Qdrant
4. **Plugin Extensible**: Hook-based architecture for customization
5. **Type Safe**: Full TypeScript with Zod validation

## Architecture Diagram

```
+-------------------+     +-------------------+     +-------------------+
|     Stanley       |     |       Zee         |     |    Agent-Core     |
|   (GUI/GPUI)      |     | (WhatsApp/etc)    |     |    (CLI/TUI)      |
+--------+----------+     +---------+---------+     +---------+---------+
         |                          |                         |
         +------------+-------------+-------------+-----------+
                      |                           |
                      v                           v
              +-------+-------+           +-------+-------+
              |   Surface     |           |   Surface     |
              |   Adapter     |           |   Adapter     |
              +-------+-------+           +-------+-------+
                      |                           |
                      +-----------+---------------+
                                  |
                                  v
                      +-----------+-----------+
                      |                       |
                      |     Agent Core        |
                      |                       |
                      +-----------+-----------+
                                  |
        +------------+------------+------------+------------+
        |            |            |            |            |
        v            v            v            v            v
   +----+----+  +----+----+  +----+----+  +----+----+  +----+----+
   |Provider |  |  Agent  |  |  Tool   |  |   MCP   |  | Memory  |
   | System  |  | System  |  | System  |  | Manager |  |  Layer  |
   +---------+  +---------+  +---------+  +---------+  +---------+
```

## Module Overview

### 1. Provider System (`/src/provider`)

Multi-provider LLM support with subscription-based authentication.

**Key Features:**
- 15+ bundled providers (Anthropic, OpenAI, Google, etc.)
- Subscription auth (Claude Max, ChatGPT Plus, GitHub Copilot)
- models.dev registry integration for model metadata
- Custom model loaders for provider-specific SDKs
- Automatic cost tracking and usage analytics

**Supported Providers:**
- Anthropic (Claude)
- OpenAI (GPT-4, GPT-5)
- Google (Gemini)
- Amazon Bedrock
- Azure OpenAI
- Google Vertex AI
- OpenRouter
- xAI (Grok)
- Mistral
- Groq
- DeepInfra
- Cerebras
- Cohere
- Together AI
- Perplexity
- GitHub Copilot

### 2. Agent System (`/src/agent`)

Configurable agent personas with permission management.

**Key Features:**
- Named agents with distinct personas (Zee, Stanley, Johny)
- Permission levels: allow, ask, deny
- Mode switching: primary, subagent
- Per-agent model selection
- Custom system prompts
- Tool enablement configuration

**Personas:**
- `zee`: Personal assistant and messaging
- `stanley`: Investing and markets
- `johny`: Learning and knowledge

### 3. Tool System (`/src/tool`)

Built-in tools and registry for extensibility.

**Built-in Tools:**
- `bash`: Shell command execution
- `read`/`write`/`edit`: File operations
- `glob`/`grep`: File search
- `task`: Subagent spawning
- `websearch`/`webfetch`: Web access
- `todoread`/`todowrite`: Task management
- `skill`: Skill execution

**Tool Context:**
- Session/message IDs
- Permission checking
- Memory access
- Abort signals

### 4. MCP Integration (`/src/mcp`)

Model Context Protocol for tool extension.

**Key Features:**
- Local servers (stdio-based)
- Remote servers (HTTP/SSE/WebSocket)
- OAuth authentication flow
- Dynamic tool discovery
- Tool list change notifications

### 5. Memory Layer (`/src/memory`)

Qdrant-backed semantic memory with cross-surface sharing.

**Components:**
- **MemoryStore**: Vector-based semantic search
- **PatternStore**: Learning from interactions (ReasoningBank-style)
- **ContactTracker**: Relationship management
- **GraphStore**: Knowledge graph with entities/relationships
- **MemoryExtractor**: Automatic memory extraction from conversations

**Categories:**
- Facts, preferences, context
- Relationships, patterns
- Tasks, custom

### 6. Surface Abstraction (`/src/surface`)

Unified interface for different presentation layers.

**Surface Types:**
- CLI: Command-line interface
- TUI: Terminal UI (ink-based)
- GUI: Native application (GPUI)
- Messaging: WhatsApp, Telegram, Discord, etc.
- API: HTTP/WebSocket server

**Surface Adapter Interface:**
```typescript
interface SurfaceAdapter {
  type: SurfaceType;
  capabilities: SurfaceCapabilities;
  send(message: OutboundMessage): Promise<string>;
  sendStream(recipientId, stream, replyTo?): Promise<void>;
  subscribe(callback): () => void;
}
```

### 7. Session Management (`/src/session`)

Conversation state with streaming and persistence.

**Key Features:**
- Message history with parts (text, tool_use, etc.)
- Streaming responses with callbacks
- Retry logic with exponential backoff
- Session forking and branching
- Snapshot/restore for undo
- Session sharing

### 8. Plugin System (`/src/plugin`)

Hook-based extensibility for customization.

**Hook Points:**
- `session.start`/`session.end`
- `message.before`/`message.after`
- `tool.before`/`tool.after`
- `permission.ask`
- `file.before_edit`/`file.after_edit`
- `bash.before`/`bash.after`
- `memory.save`
- `error`

**Plugin Capabilities:**
- Custom tools
- Provider authentication
- Commands
- Automation rules

### 9. Configuration (`/src/config`)

Unified configuration management.

**Config Sources (priority order):**
1. Environment variables
2. CLI flags
3. Project config (`.agent-core/config.json`)
4. Global config (`~/.config/agent-core/config.json`)

**Key Config Sections:**
- `provider`: Provider-specific settings
- `agent`: Agent configurations
- `mcp`: MCP server definitions
- `memory`: Qdrant/embedding settings
- `surface`: UI configurations
- `plugins`: Plugin paths

### 10. Transport (`/src/transport`)

Communication abstractions for IPC and networking.

**Transport Types:**
- IPC: Local process communication
- WebSocket: Real-time bidirectional
- HTTP: Request/response + SSE
- Stream: AI model responses
- RPC: Remote procedure calls
- PubSub: Event distribution

## Data Flow

### Message Processing

```
User Input (Surface)
       |
       v
+------+------+
| InboundMsg  |
+------+------+
       |
       v
+------+------+
| SessionMgr  | --> Store in Session
+------+------+
       |
       v
+------+------+
| Memory Svc  | --> Search relevant memories
+------+------+
       |
       v
+------+------+
|    Agent    | --> Select tools, build prompt
+------+------+
       |
       v
+------+------+
|  Provider   | --> Stream LLM response
+------+------+
       |
       v
+------+------+
|  Tool Exec  | --> Execute tool calls
+------+------+
       |
       v
+------+------+
| OutboundMsg |
+------+------+
       |
       v
Surface Output
```

### Memory Flow

```
Conversation
     |
     v
+----+----+
|Extractor| --> Extract facts, preferences
+----+----+
     |
     v
+----+----+
|Embedding| --> Generate vectors
+----+----+
     |
     v
+----+----+
| Qdrant  | --> Store in collection
+----+----+
     |
     v
Cross-Surface Access
```

## Surface-Specific Considerations

### Stanley (GUI)

- Built with GPUI (Rust)
- FFI bridge to agent-core
- Native file system integration
- Keyboard shortcuts
- Multi-window support

### Zee (Messaging)

- WhatsApp via @whiskeysockets/baileys
- Telegram via node-telegram-bot-api
- Discord via discord.js
- Auto-reply with configurable delays
- Group message handling
- Voice message transcription

### Agent-Core (CLI/TUI)

- Native CLI with yargs
- TUI with OpenTUI
- Git integration
- File watching
- Session sharing

## Extension Points

### Adding a New Provider

1. Add to `BUNDLED_PROVIDERS` in provider system
2. Implement custom loader if needed
3. Register models from models.dev

### Adding a New Surface

1. Implement `SurfaceAdapter` interface
2. Map surface capabilities
3. Handle streaming appropriately
4. Register with `SurfaceCoordinator`

### Adding a New Tool

1. Create tool definition with Zod schema
2. Implement execute function
3. Register with `ToolRegistry`
4. Or: Create MCP server

### Adding Plugins

1. Create plugin definition with hooks
2. Register tools/commands
3. Place in plugin directory or npm package

## Future Considerations

- Multi-agent orchestration
- Streaming tool results
- Voice interfaces
- Mobile surfaces
- Distributed memory
- Real-time collaboration
