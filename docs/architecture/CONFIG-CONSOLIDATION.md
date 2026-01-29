# Configuration Consolidation

This document describes the shared configuration architecture between agent-core and zee gateway.

## Shared Primitives (`src/config/shared.ts`)

The following types are defined in agent-core and can be imported by zee for type consistency:

### Session Types
- `SessionScope`: `"per-sender" | "global"`
- `SessionChatType`: `"direct" | "group" | "room"`
- `MessagingProvider`: `"whatsapp" | "telegram" | "discord" | "slack" | "signal" | "webchat"`
- `GroupActivation`: `"mention" | "always"`
- `SendPolicy`: `"allow" | "deny"`

### Policy Types
- `DmPolicy`: `"pairing" | "allowlist" | "open" | "disabled"`
- `GroupPolicy`: `"open" | "disabled" | "allowlist"`
- `ReplyMode`: `"text" | "command"`
- `TypingMode`: `"never" | "instant" | "thinking" | "message"`
- `ReplyToMode`: `"off" | "first" | "all"`

### Logging Types
- `LogLevel`: `"silent" | "fatal" | "error" | "warn" | "info" | "debug" | "trace"`
- `ConsoleStyle`: `"pretty" | "compact" | "json"`
- `LoggingConfig`: Base logging configuration interface

### Model/Provider Types
- `ModelApi`: `"anthropic-messages" | "openai-chat" | "openai-responses" | "google-genai" | "bedrock-converse"`
- `ModelInputModality`: `"text" | "image" | "audio" | "video" | "file"`
- `TokenCost`: Token cost structure interface
- `ModelDefinition`: Model definition interface
- `ProviderDefinition`: Provider configuration interface

### Processing Types
- `ThinkingLevel`: `"off" | "minimal" | "low" | "medium" | "high"`
- `QueueMode`: `"fifo" | "lifo" | "priority" | "debounce"`
- `QueueDropPolicy`: `"oldest" | "newest" | "none"`

### Network Types
- `RetryConfig`: Outbound request retry configuration
- `BindMode`: `"auto" | "lan" | "tailnet" | "loopback"`

## Architecture Overview

```
agent-core (Engine)
├── src/config/shared.ts    ← Shared primitives (canonical)
├── src/config/types.ts     ← Uses shared primitives
├── src/domain/zee/         ← Zee domain tools (memory, calendar, messaging)
└── packages/agent-core/    ← TUI/CLI implementation

zee (Gateway)
├── src/config/types.ts     ← Can import from @agent-core/config
├── src/config/sessions.ts  ← Chat session management
├── src/agents/tools/       ← Full tool implementations
└── src/browser/            ← Browser control (canonical)
```

## Key Patterns

### Configuration
- agent-core defines shared primitives
- zee extends with platform-specific details (WhatsApp accounts, Telegram groups, etc.)
- Both use the same policy types (DmPolicy, GroupPolicy)

### Browser Control
- zee owns the browser implementation (`src/browser/`, `src/agents/tools/browser-tool.ts`)
- agent-core does not proxy browser control; use Zee gateway endpoints when enabled

### Memory/Qdrant
- agent-core owns the Qdrant implementation (`src/memory/`)
- zee delegates to agent-core for memory operations
- This is the correct ownership pattern

### Sessions
- agent-core sessions: TUI/CLI coding sessions (project-based)
- zee sessions: Chat sessions (messaging-based)
- Shared primitives: SessionScope, SessionChatType, MessagingProvider

## Migration Path

For zee to import shared types:

```typescript
// In zee's config/types.ts
import type {
  DmPolicy,
  GroupPolicy,
  LogLevel,
  RetryConfig,
  SessionChatType,
  MessagingProvider,
} from "@agent-core/config";
```

This requires:
1. Publishing agent-core's config as a package, OR
2. Using workspace dependencies, OR
3. Copying the shared.ts file (not recommended)

## Status

| Item | Status |
|------|--------|
| Shared primitives created | Done |
| agent-core types updated | Done |
| zee imports shared types | Future |
| Browser MCP consolidation | Future |
