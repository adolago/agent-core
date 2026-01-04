# MCP Tools Layer Architecture

## Overview

The MCP Tools Layer provides a unified tool access system across all surfaces (CLI, Web, API, WhatsApp). It combines built-in tools, domain-specific tools, external MCP servers, and plugins into a single cohesive system.

## Architecture Diagram (C4 - Component Level)

```
+------------------------------------------------------------------+
|                         Agent Core                                |
+------------------------------------------------------------------+
|                                                                   |
|  +------------------------+    +------------------------------+   |
|  |    Tool Registry       |    |    Permission Checker        |   |
|  |------------------------|    |------------------------------|   |
|  | - Tool registration    |    | - Per-tool permissions       |   |
|  | - Tool discovery       |<-->| - Pattern matching           |   |
|  | - Agent filtering      |    | - Surface defaults           |   |
|  | - Category grouping    |    | - User overrides             |   |
|  +------------------------+    +------------------------------+   |
|            ^                              ^                       |
|            |                              |                       |
|  +---------+----------+    +-------------+-----------------+      |
|  |                    |    |                               |      |
|  v                    v    v                               v      |
|  +----------------+  +------------------+  +---------------+      |
|  | Built-in Tools |  | MCP Server Mgr   |  | Domain Tools  |      |
|  |----------------|  |------------------|  |---------------|      |
|  | - BashTool     |  | - Local (stdio)  |  | Stanley:      |      |
|  | - ReadTool     |  | - Remote (HTTP)  |  |   market_data |      |
|  | - WriteTool    |  | - OAuth support  |  |   research    |      |
|  | - EditTool     |  | - Tool discovery |  |   portfolio   |      |
|  | - GlobTool     |  | - Reconnection   |  |   sec_filing  |      |
|  | - GrepTool     |  +------------------+  | Zee:          |      |
|  | - TaskTool     |          |             |   memory_*    |      |
|  | - WebFetchTool |          v             |   messaging   |      |
|  | - SkillTool    |  +------------------+  |   notification|      |
|  +----------------+  | External Servers |  +---------------+      |
|                      | - claude-flow    |                         |
|                      | - flow-nexus     |                         |
|                      | - custom servers |                         |
|                      +------------------+                         |
+------------------------------------------------------------------+
```

## Component Descriptions

### 1. Tool Registry (`registry.ts`)

Central registry for all tools. Responsibilities:
- Register/unregister tools
- Discover tools by category, source, or server
- Filter tools by agent permissions
- Initialize tools with context
- Track tool status (enabled/disabled)

Key interfaces:
```typescript
interface ToolRegistry {
  register(tool: ToolDefinition, options: RegisterOptions): void;
  get(toolId: string): ToolRegistryEntry | undefined;
  getToolsForAgent(agent: AgentInfo, surface?: SurfaceType): Promise<Map<string, ToolRuntime>>;
  byCategory(category: ToolCategory): ToolRegistryEntry[];
  byServer(serverId: string): ToolRegistryEntry[];
}
```

### 2. Permission Checker (`permission.ts`)

Handles permission checking for tool execution. Features:
- Per-tool permissions (allow/deny/ask)
- Pattern-based permissions for bash commands, file paths
- Surface-specific defaults (CLI more permissive than WhatsApp)
- User overrides with highest priority
- Runtime overrides for session-level decisions

Permission resolution order:
1. Runtime overrides (session-level, not persisted)
2. User overrides (persisted, per-user)
3. Surface-specific defaults
4. Global defaults

### 3. MCP Server Manager (`server.ts`)

Manages connections to external MCP servers. Supports:
- **Local servers**: stdio transport, command execution
- **Remote servers**: HTTP/SSE transport with OAuth
- Tool discovery and registration
- Automatic reconnection
- Tools changed notifications

### 4. Built-in Tools (`builtin/`)

Core tools that come with the system:

| Tool | Description | Key Features |
|------|-------------|--------------|
| `bash` | Shell execution | Sandboxing, timeout, command parsing |
| `read` | File reading | Line numbers, binary detection, images |
| `write` | File writing | Directory creation, overwrite protection |
| `edit` | String replacement | Fuzzy matching, unique string requirement |
| `glob` | File pattern matching | Sorted by mtime, limit handling |
| `grep` | Content search | Regex, file filtering, mtime sorting |
| `task` | Subagent spawning | Session management, parallel execution |
| `webfetch` | URL fetching | HTML to markdown, size limits |
| `skill` | Skill loading | Permission checking, content loading |

### 5. Domain Tools (`domain/`)

Agent-specific tools:

**Stanley (Financial)**:
- `stanley_market_data`: Stock quotes, historical data
- `stanley_research`: SEC filings, news, analyst reports
- `stanley_portfolio`: Holdings, analysis, optimization
- `stanley_sec_filing`: 10-K, 10-Q, 8-K retrieval

**Zee (Personal Assistant)**:
- `zee_memory_store`: Persistent key-value storage with TTL
- `zee_memory_search`: Semantic vector search
- `zee_messaging`: WhatsApp, email, Slack
- `zee_notification`: Alerts, reminders, summaries

## Data Flow

### Tool Execution Flow

```
1. User/Agent Request
         |
         v
2. Tool Registry Lookup
         |
         v
3. Permission Check
   - Check agent permissions
   - Check surface restrictions
   - Check pattern rules
         |
    allow/deny/ask
         |
         v
4. Tool Initialization
   - Load tool with context
   - Prepare parameters schema
         |
         v
5. Parameter Validation
   - Zod schema validation
   - Custom error formatting
         |
         v
6. Tool Execution
   - Execute with context
   - Stream metadata updates
         |
         v
7. Result Processing
   - Format output
   - Attach files if any
   - Return to caller
```

### MCP Server Connection Flow

```
1. Configuration Load
         |
         v
2. Transport Selection
   - Local: StdioClientTransport
   - Remote: StreamableHTTPClientTransport or SSEClientTransport
         |
         v
3. OAuth (if required)
   - Check stored tokens
   - Refresh if expired
   - Start auth flow if needed
         |
         v
4. Client Connection
   - Connect transport
   - Register notification handlers
         |
         v
5. Tool Discovery
   - listTools() call
   - Convert to ToolDefinition
   - Register with registry
         |
         v
6. Ready for Execution
```

## Permission System

### Surface Defaults

| Tool | CLI | Web | API | WhatsApp |
|------|-----|-----|-----|----------|
| bash | ask | deny | allow | deny |
| edit | allow | ask | allow | deny |
| write | allow | ask | allow | deny |
| read | allow | allow | allow | deny |
| webfetch | ask | ask | allow | allow |
| task | allow | allow | allow | deny |
| skill | allow | allow | allow | allow |

### Permission Patterns

```typescript
// Bash command patterns
{
  bash: {
    default: 'ask',
    patterns: {
      'git *': 'allow',      // All git commands
      'npm *': 'allow',      // All npm commands
      'rm -rf *': 'deny',    // Block dangerous removes
    }
  }
}

// File path patterns
{
  edit: {
    default: 'allow',
    patterns: {
      '*.env': 'deny',       // Block .env files
      '/etc/*': 'deny',      // Block system files
    }
  }
}
```

## Configuration

### MCP Server Configuration

```typescript
// Local server (stdio)
{
  type: 'local',
  command: ['npx', 'claude-flow', 'mcp', 'start'],
  environment: { DEBUG: 'true' },
  enabled: true,
  timeout: 5000
}

// Remote server (HTTP/SSE with OAuth)
{
  type: 'remote',
  url: 'https://mcp.example.com',
  headers: { 'X-API-Key': '...' },
  oauth: {
    clientId: 'my-client',
    scope: 'tools:read tools:execute'
  },
  enabled: true,
  timeout: 10000
}
```

## Usage Examples

### Initialize MCP Layer

```typescript
import { initializeMcp } from '@agent-core/mcp';

const { registry, serverManager } = await initializeMcp({
  mcpServers: {
    'claude-flow': {
      type: 'local',
      command: ['npx', 'claude-flow', 'mcp', 'start'],
    },
  },
  enableStanley: true,
  enableZee: true,
  permissions: {
    surface: 'cli',
    askHandler: async (request) => {
      // Show prompt to user
      return { granted: true, remember: true };
    },
  },
});
```

### Get Tools for Agent

```typescript
import { getToolsForAgent } from '@agent-core/mcp';

const agent: AgentInfo = {
  name: 'primary',
  mode: 'primary',
  permission: {
    bash: { '*': 'ask' },
    edit: 'allow',
    // ...
  },
};

const tools = await getToolsForAgent(agent, 'cli');

for (const [id, runtime] of tools) {
  console.log(`Tool: ${id}`);
  console.log(`Description: ${runtime.description}`);
}
```

### Execute a Tool

```typescript
import { getToolRegistry } from '@agent-core/mcp';

const registry = getToolRegistry();
const entry = registry.get('bash');
const runtime = await entry.tool.init();

const result = await runtime.execute(
  { command: 'git status', description: 'Check git status' },
  {
    sessionId: 'session-123',
    messageId: 'msg-456',
    agent: 'primary',
    abort: new AbortController().signal,
    metadata: (data) => console.log('Metadata:', data),
  }
);

console.log(result.output);
```

## Extension Points

### Adding a New Built-in Tool

1. Create tool file in `builtin/`:
```typescript
// builtin/mytool.ts
import { defineTool } from '../registry';

export const MyTool = defineTool('mytool', 'builtin', {
  description: '...',
  parameters: z.object({ ... }),
  async execute(params, ctx) {
    return { title: '...', metadata: {}, output: '...' };
  },
});
```

2. Add to `builtin/index.ts`:
```typescript
import { MyTool } from './mytool';
export const builtinTools = [..., MyTool];
```

### Adding Domain Tools

1. Create or extend domain file in `domain/`:
```typescript
// domain/myagent.ts
export const MyAgentTool = defineTool('myagent_action', 'domain', { ... });
```

2. Add registration function in `domain/index.ts`:
```typescript
export function registerMyAgentTools(): void {
  registry.registerAll([MyAgentTool], { source: 'domain' });
}
```

### Adding MCP Server Support

1. Implement `McpClientFactory` for custom transport
2. Register in `McpServerManager` constructor
3. Handle tool discovery and conversion

## File Structure

```
src/mcp/
  index.ts              # Main entry, exports, initialization
  types.ts              # Core type definitions
  registry.ts           # Tool registry implementation
  permission.ts         # Permission checking system
  server.ts             # MCP server management
  builtin/
    index.ts            # Built-in tools registration
    bash.ts             # Shell execution
    read.ts             # File reading
    write.ts            # File writing
    edit.ts             # String replacement
    glob.ts             # File pattern matching
    grep.ts             # Content search
    task.ts             # Subagent spawning
    webfetch.ts         # URL fetching
    skill.ts            # Skill loading
  domain/
    index.ts            # Domain tools registration
    stanley.ts          # Financial tools
    zee.ts              # Personal assistant tools
```

## Decision Records

### ADR-001: Unified Tool Interface

**Context**: Need consistent tool API across built-in, MCP, and domain tools.

**Decision**: Use `ToolDefinition` interface with async `init` method returning `ToolRuntime`.

**Rationale**:
- Allows lazy initialization with context
- Consistent execute signature
- Type-safe parameters via Zod

### ADR-002: Surface-Based Permission Defaults

**Context**: Different surfaces have different security requirements.

**Decision**: Each surface has default permission sets, with user overrides taking precedence.

**Rationale**:
- WhatsApp needs strictest defaults (no file access)
- CLI can be more permissive
- Users can customize per their needs

### ADR-003: MCP SDK Compatibility

**Context**: Need to support external MCP servers following the protocol spec.

**Decision**: Abstract MCP client interface, allow pluggable implementations.

**Rationale**:
- Decouples from specific SDK version
- Allows testing with mock clients
- Supports both local and remote servers

## Future Considerations

1. **Plugin System**: Allow third-party tool packages
2. **Tool Composition**: Chain tools for complex workflows
3. **Tool Caching**: Cache tool results for repeated calls
4. **Metrics**: Track tool usage and performance
5. **Audit Logging**: Log tool executions for compliance
