# Logging Architecture

This document describes the structured logging system used across agent-core.

---

## Overview

Agent-core uses a centralized structured logging system based on the `Log` utility. This provides:

- Consistent log formatting across all modules
- Configurable log levels
- Structured metadata for debugging
- Integration with wide events for observability

---

## Log Utility

### Location

`packages/agent-core/src/util/log.ts`

### Usage

```typescript
import { Log } from "../util/log"

// Create a logger for your module
const log = Log.create({ service: "my-service" })

// Use structured logging
log.debug("processing request", { requestId: "abc123", size: 1024 })
log.info("operation complete", { duration: 150 })
log.warn("rate limit approaching", { remaining: 10 })
log.error("operation failed", { error: err.message, code: err.code })
```

### Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging information |
| `info` | Normal operational messages |
| `warn` | Potential issues that don't stop execution |
| `error` | Errors that affect functionality |

---

## Module-Specific Logging

### Personas (`src/personas/`)

```typescript
import { Log } from "../util/log"

const log = Log.create({ service: "personas.tiara" })
// Or subsystem-specific:
const log = Log.create({ service: "personas.fact-extractor" })
```

### Memory (`src/memory/`)

```typescript
const log = Log.create({ service: "memory.qdrant" })
```

### MCP Servers (`src/mcp/`)

```typescript
const log = Log.create({ service: "mcp.server" })
```

### Domain Tools (`src/domain/`)

```typescript
const log = Log.create({ service: "domain.zee" })
const log = Log.create({ service: "domain.stanley" })
```

---

## Zee Gateway Logging

The zee gateway uses `createSubsystemLogger` for consistent logging:

```typescript
import { createSubsystemLogger } from "./logging"

const log = createSubsystemLogger("gateway")
log.info("server started", { port: 3210 })
```

### Subsystems

| Subsystem | Purpose |
|-----------|---------|
| `gateway` | HTTP/WebSocket server |
| `hooks` | Webhook processing |
| `whatsapp` | WhatsApp bridge |
| `telegram` | Telegram bot |
| `discord` | Discord integration |

---

## Acceptable Console Usage

The following `console.log` usage patterns are acceptable:

### Test Files

Test output is expected to use console for immediate feedback:

```typescript
// integration.test.ts
console.log(`[TEST] ${msg}`)
console.log(`[✓] ${msg}`)
```

### MCP Servers (stdio protocol)

MCP servers running on stdio use `console.error` for startup messages:

```typescript
// Standard MCP server startup
console.error("Portfolio MCP server running on stdio")
```

### Plugin Fallbacks

Plugin system provides fallback logging when structured logger unavailable:

```typescript
warn: (message, data) => console.warn(`[plugin] ${message}`, data || '')
```

---

## Wide Events

For observability, agent-core integrates wide events:

### Configuration

```json
{
  "wideEvents": {
    "enabled": true,
    "sampleRate": 0.02,
    "slowMs": 2000,
    "payloads": "summary"
  }
}
```

### Event Fields

| Field | Description |
|-------|-------------|
| `timestamp` | ISO timestamp |
| `service` | Service name |
| `operation` | Operation being performed |
| `duration_ms` | Operation duration |
| `status` | `success` or `error` |
| `metadata` | Additional context |

---

## Best Practices

1. **Always use structured logging** in production code
2. **Include relevant context** as metadata, not in the message string
3. **Use appropriate log levels** - debug for development, info for operations
4. **Create service-specific loggers** for easier filtering
5. **Avoid logging sensitive data** (API keys, passwords, tokens)

### Good

```typescript
log.info("user authenticated", { userId: "123", method: "oauth" })
```

### Bad

```typescript
log.info(`user 123 authenticated via oauth`)  // Unstructured
console.log("user authenticated")             // Not structured
log.info("auth", { token: "secret123" })      // Sensitive data
```

---

## Audit Summary

| Component | Logging Method | Status |
|-----------|----------------|--------|
| `packages/agent-core/` | `Log` utility | ✓ Structured |
| `src/personas/` | `Log` utility | ✓ Structured |
| `src/memory/` | `Log` utility | ✓ Structured |
| `src/mcp/` | `Log` utility | ✓ Structured |
| `src/domain/` | `Log` utility | ✓ Structured |
| `zee/src/` | `createSubsystemLogger` | ✓ Structured |
| Test files | `console.log` | ✓ Acceptable |
| MCP stdio servers | `console.error` | ✓ Protocol standard |

---

*Generated: 2026-01-12*
