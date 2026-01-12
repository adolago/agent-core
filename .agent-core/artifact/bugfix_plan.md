# Comprehensive Bug Fix Implementation Plan

**Date:** 2026-01-12
**Scope:** MCP Reconnection, Type Safety, Code Patterns

---

## Part 1: MCP Server Reconnection After Daemon Restart

### Problem Analysis

When the daemon restarts:

1. MCP client connections in the daemon are lost
2. TUI continues to display "Connection closed" status
3. No automatic reconnection mechanism exists
4. User must manually restart TUI to re-establish MCP connections

### Root Causes

1. MCP state is stored per-Instance in `Instance.state()` (line 156)
2. When daemon restarts, Instance state is recreated fresh
3. MCP clients show "connected" initially but fail when actually used
4. The `tools()` function (line 542) catches errors and marks as failed, but only AFTER a tool call fails

### Solution Design

1. **Add health check for MCP connections** - Ping MCP servers before reporting "connected"
2. **Add reconnection logic** - Attempt reconnect when connection fails
3. **Add retry with exponential backoff** - Graceful reconnection
4. **Expose reconnect API** - Allow TUI/API to trigger reconnection

### Implementation Steps

#### Step 1.1: Add connection health check function

```typescript
// In MCP namespace
export async function isHealthy(name: string): Promise<boolean>
```

#### Step 1.2: Add reconnect function

```typescript
export async function reconnect(name: string): Promise<Status>
```

#### Step 1.3: Add automatic reconnection on tool failure

When `tools()` catches an error, attempt reconnect before fully failing.

#### Step 1.4: Add periodic health check (optional)

Background interval to check MCP health and reconnect if needed.

---

## Part 2: Fix Type Safety Issues (`as any`)

### Problem Analysis

35+ occurrences of `as any` throughout the codebase bypass TypeScript's type checking:

- Potential runtime errors not caught at compile time
- Makes refactoring harder
- Reduces IDE assistance

### High-Priority Files

1. `src/provider/provider.ts` - 2 occurrences
2. `src/provider/transform.ts` - 1 occurrence
3. `src/session/prompt.ts` - 2 occurrences
4. `src/session/processor.ts` - 1 occurrence

### Solution Strategy

For each `as any`:

1. **Determine if it's necessary** - Some are valid workarounds for external lib types
2. **Add proper type definitions** - Most can be fixed with correct types
3. **Use type guards** - For runtime type checking
4. **Add `@ts-expect-error` with comments** - For external lib workarounds

### Implementation Steps

#### Step 2.1: Fix provider.ts Auth.get type mismatch

```typescript
// Current:
const options = await plugin.auth.loader(() => Auth.get(providerID) as any, ...)

// Fix: Define proper return type for loader callback
```

#### Step 2.2: Fix transform.ts providerOptions access

```typescript
// Current:
...(msg.providerOptions as any)?.openaiCompatible

// Fix: Define proper type for providerOptions
```

#### Step 2.3: Fix session/prompt.ts schema handling

```typescript
// Current:
inputSchema: jsonSchema(schema as any)

// Fix: Use proper JSONSchema type
```

#### Step 2.4: Fix session/processor.ts error handling

```typescript
// Current:
error: (value.error as any).toString()

// Fix: Add type guard for error
```

---

## Part 3: Additional Code Pattern Issues

### 3.1: Missing unref() on intervals

**Location:** Some setInterval calls don't use .unref()
**Impact:** May prevent process from exiting cleanly
**Fix:** Add .unref() to background intervals that shouldn't keep process alive

### 3.2: Unsafe object property access

**Pattern:** `obj[key]` where key could be undefined
**Fix:** Add null checks or use optional chaining

### 3.3: Silent error handling

**Pattern:** `.catch(() => {})` or `catch (e) {}`
**Fix:** At minimum log errors, or only catch specific expected errors

### 3.4: Race conditions in async operations

**Pattern:** State modifications without proper locking
**Fix:** Add state guards or use atomic operations

---

## Execution Order

1. **Part 1: MCP Reconnection** (High priority - user-visible bug)
   - 1.1 Add health check
   - 1.2 Add reconnect function
   - 1.3 Add auto-reconnect on failure
2. **Part 2: Type Safety** (Medium priority - code quality)
   - 2.1 Fix provider.ts
   - 2.2 Fix transform.ts
   - 2.3 Fix prompt.ts
   - 2.4 Fix processor.ts

3. **Part 3: Code Patterns** (Lower priority - code quality)
   - 3.1 Add missing unref()
   - 3.2 Review and document remaining as any uses

---

## Testing Plan

After implementation:

1. Run `bun run build` to verify compilation
2. Run `./scripts/reload.sh` to restart daemon
3. Verify MCP reconnection works by restarting daemon while TUI is running
4. Run existing tests if available
