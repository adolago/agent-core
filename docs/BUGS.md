# Agent-Core Bug Tracker

> Last Updated: 2026-01-12

## Fixed in This Session

### 1. ✅ Silent Error Swallowing in Cache Cleanup

- **File:** `src/global/index.ts:74`
- **Issue:** Empty `catch (e) {}` block silently swallowed all errors
- **Fix:** Now only ignores ENOENT (expected), logs other errors

### 2. ✅ EventEmitter Memory Leak Warning

- **File:** `src/bus/global.ts`
- **Issue:** GlobalBus had default 10 max listeners, could trigger memory leak warning with many SSE connections
- **Fix:** Added `GlobalBus.setMaxListeners(100)`

### 3. ✅ topP Parameter Error for Claude Thinking Models

- **File:** `src/session/llm.ts:189-195`
- **Issue:** Undefined topP was being passed to provider APIs, causing errors for Claude thinking models
- **Fix:** Changed to spread-only-if-defined pattern: `...(params.topP !== undefined && { topP: params.topP })`

### 4. ✅ MCP Servers Don't Reconnect After Daemon Restart

- **File:** `src/mcp/index.ts`
- **Issue:** When daemon restarts, MCP connections were lost with no recovery
- **Fix:** Added:
  - `isHealthy(name)` - Check if MCP connection is still alive
  - `reconnect(name)` - Reconnect a single failed MCP server
  - `reconnectAll()` - Reconnect all failed MCP servers
  - `healthCheckAndReconnect()` - Health check and reconnect all
  - Auto-reconnect on tool fetch failure
- **File:** `src/server/server.ts`
- **Fix:** Added API endpoints:
  - `POST /mcp/:name/reconnect` - Reconnect single server
  - `POST /mcp/reconnect-all` - Reconnect all failed
  - `POST /mcp/health-check` - Health check and reconnect

### 5. ✅ Type Safety Issues Fixed

- **File:** `src/session/processor.ts:234`
  - **Issue:** `(value.error as any).toString()`
  - **Fix:** `value.error instanceof Error ? value.error.message : String(value.error)`
- **File:** `src/provider/transform.ts:125`
  - **Issue:** `(msg.providerOptions as any)?.openaiCompatible`
  - **Fix:** Type-safe access with `Record<string, unknown>` and `typeof` check
- **File:** `src/session/prompt.ts:690,692`
  - **Issue:** `as any` for AI SDK type compatibility
  - **Fix:** Added explanatory comments documenting why assertions are needed

### 6. ✅ Debug Status Command Type Errors

- **File:** `src/cli/cmd/debug/status.ts`
- **Issue:** Incorrect access to `config.provider?.default` and `config.model?.default`
- **Fix:** Correctly parse `config.model` string (format: `provider/model`)

## Known Issues (Not Fixed Yet)

### 1. 🟡 Type Assertions (`as any`) Remaining

- **Count:** ~30 occurrences (reduced from 35+)
- **Risk:** Type safety bypassed in some places
- **Note:** Many are necessary for AI SDK compatibility and now documented

### 2. 🟡 setInterval Without .unref() in Some Places

- **File:** `src/cli/cmd/debug/errors.ts:154`
- **Issue:** `setInterval(checkForNewErrors, 1000)` doesn't call `.unref()`
- **Impact:** Low (only affects `debug errors --follow`, which runs indefinitely by design)

## Testing Notes

To verify fixes:

```bash
# Type check
bun run typecheck

# Rebuild and restart
./scripts/reload.sh

# Check status
./scripts/reload.sh --status

# Or via CLI
agent-core debug status -v

# Test MCP reconnection
curl -X POST http://127.0.0.1:3210/mcp/health-check
```
