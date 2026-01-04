# Agent Core

Unified foundation for AI agent applications. Powers **Stanley** (GUI), **Zee** (messaging), and **OpenCode** (CLI/TUI).

## Features

- **Multi-Provider System**: 15+ LLM providers with subscription-based auth (Claude Max, ChatGPT Plus, GitHub Copilot)
- **Agent Personas**: Configurable agents with permissions, modes, and custom prompts
- **MCP Integration**: Local and remote MCP servers with OAuth support
- **Memory Layer**: Qdrant vector storage with semantic search and pattern learning
- **Surface Abstraction**: Unified interface for CLI, GUI, and messaging platforms
- **Plugin System**: Hook-based extensibility for customization

## Installation

```bash
npm install @agent-core/core
```

## Quick Start

```typescript
import {
  ProviderRegistry,
  AgentRegistry,
  SessionManager,
  MemoryService,
  SurfaceAdapter,
} from '@agent-core/core';

// Initialize provider with Anthropic
const provider = await ProviderRegistry.get('anthropic');
const model = await ProviderRegistry.getModel('anthropic', 'claude-sonnet-4');

// Create agent
const agent = await AgentRegistry.get('build');

// Start session
const session = await SessionManager.create();

// Send message
const { messageId } = await SessionManager.send({
  sessionId: session.id,
  content: 'Hello, Claude!',
});

// Stream response
for await (const part of SessionManager.stream(session.id, messageId)) {
  if (part.type === 'text') {
    console.log(part.text);
  }
}
```

## Supported Providers

| Provider | API Key | Subscription |
|----------|---------|--------------|
| Anthropic | Yes | Claude Max |
| OpenAI | Yes | ChatGPT Plus |
| Google | Yes | - |
| GitHub Copilot | - | Yes |
| Amazon Bedrock | AWS Credentials | - |
| Azure OpenAI | Yes | - |
| Google Vertex | GCP Credentials | - |
| OpenRouter | Yes | - |
| xAI (Grok) | Yes | - |
| Mistral | Yes | - |
| Groq | Yes | - |
| DeepInfra | Yes | - |
| Cerebras | Yes | - |
| Cohere | Yes | - |
| Together AI | Yes | - |
| Perplexity | Yes | - |

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|     Stanley       |     |       Zee         |     |     OpenCode      |
|   (GUI/GPUI)      |     | (WhatsApp/etc)    |     |    (CLI/TUI)      |
+--------+----------+     +---------+---------+     +---------+---------+
         |                          |                         |
         +--------------------------+-------------------------+
                                    |
                      +-------------+-------------+
                      |                           |
                      |       Agent Core          |
                      |                           |
                      +---------------------------+
                      |  Provider | Agent | Tool  |
                      |  MCP | Memory | Session   |
                      |  Plugin | Surface | Config|
                      +---------------------------+
```

## Modules

### Provider System

```typescript
import { ProviderRegistry, type Model } from '@agent-core/core/provider';

// List available providers
const providers = await ProviderRegistry.list();

// Get specific model
const model = await ProviderRegistry.getModel('openai', 'gpt-5-turbo');

// Get language model for inference
const language = await ProviderRegistry.getLanguage(model);
```

### Agent System

```typescript
import { AgentRegistry, type AgentConfig } from '@agent-core/core/agent';

// Get agent by name
const agent = await AgentRegistry.get('build');

// List all agents
const agents = await AgentRegistry.list();

// Generate custom agent from description
const generated = await AgentRegistry.generate({
  description: 'A code review specialist',
});
```

### Memory Layer

```typescript
import { MemoryService, type MemorySearchResult } from '@agent-core/core/memory';

// Initialize memory
await MemoryService.init();

// Save memory
await MemoryService.store.save({
  content: 'User prefers TypeScript',
  category: 'preference',
  source: 'user_message',
});

// Search memories
const results = await MemoryService.store.search('coding preferences');
```

### MCP Integration

```typescript
import { MCPManager, type MCPConfig } from '@agent-core/core/mcp';

// Add local MCP server
await MCPManager.add('my-server', {
  type: 'local',
  command: ['npx', 'my-mcp-server'],
});

// Add remote MCP server with OAuth
await MCPManager.add('remote-server', {
  type: 'remote',
  url: 'https://mcp.example.com',
  oauth: { clientId: '...' },
});

// Get tools from all servers
const tools = await MCPManager.tools();
```

### Surface Abstraction

```typescript
import { SurfaceFactory, type SurfaceAdapter } from '@agent-core/core/surface';

// Create CLI surface
const cli = await SurfaceFactory.createCLI({ tui: true });

// Create messaging surface
const messaging = await SurfaceFactory.createMessaging({
  platform: 'whatsapp',
  auth: { type: 'qr' },
  autoReply: { enabled: true },
});

// Subscribe to messages
messaging.subscribe((event) => {
  if (event.type === 'message') {
    // Handle inbound message
  }
});
```

### Plugin System

```typescript
import { PluginManager, type PluginDefinition } from '@agent-core/core/plugin';

// Register plugin
await PluginManager.register({
  meta: { name: 'my-plugin', version: '1.0.0' },
  hooks: {
    'message.before': async (message, context) => {
      // Modify message before sending to model
      return message;
    },
    'tool.after': async (tool, context) => {
      // Log tool execution
    },
  },
});

// Trigger hook
await PluginManager.trigger('message.before', message, context);
```

## Configuration

Create `.agent-core/config.json` in your project:

```json
{
  "model": "anthropic/claude-sonnet-4",
  "defaultAgent": "build",
  "provider": {
    "anthropic": {
      "options": {
        "headers": {
          "anthropic-beta": "interleaved-thinking-2025-05-14"
        }
      }
    }
  },
  "memory": {
    "enabled": true,
    "qdrant": {
      "url": "http://localhost:6333",
      "collection": "agent_memories"
    }
  },
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

## Environment Variables

```bash
# Provider API keys
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Subscription auth (alternative)
# Stored via oauth flow

# Memory
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...

# Embedding (optional, defaults to Anthropic)
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
```

## Documentation

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Provider Integration](./docs/providers.md)
- [MCP Servers](./docs/mcp.md)
- [Memory System](./docs/memory.md)
- [Plugin Development](./docs/plugins.md)

## Related Projects

- [Stanley](https://github.com/artur/stanley) - Native GUI agent (GPUI)
- [Zee](https://github.com/artur/clawdis) - Messaging assistant
- [OpenCode](https://github.com/opencode-ai/opencode) - CLI/TUI agent

## License

MIT
