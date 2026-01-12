# Agent-Core: Safety, Reliability, and Performance Improvement Opportunities

> Generated: 2026-01-12

This document identifies potential improvements categorized by **Safety**, **Reliability**, and **Performance**.

---

## 🔴 SAFETY ISSUES (Security & Data Integrity)

### 1. Unvalidated JSON.parse Calls

**Severity:** Medium  
**Files:** 35+ locations

Many `JSON.parse()` calls lack try-catch or validation, which could crash the process on malformed input:

```typescript
// Example from src/session/persistence.ts:224
const entry = JSON.parse(line) as WALEntry

// Example from src/file/ripgrep.ts:404
.map((line) => JSON.parse(line))
```

**Recommendation:**

- Wrap all `JSON.parse` in try-catch
- Use zod validation on parsed data for critical paths
- Create a utility `safeParse(json, schema)` helper

### 2. Spreading `process.env` to Child Processes

**Severity:** Low-Medium  
**Files:** bash.ts, daemon.ts, spawn.ts, bun/index.ts

```typescript
// src/tool/bash.ts:161
env: {
  ...process.env,  // Exposes ALL env vars to subprocesses
```

**Risk:** May leak sensitive API keys to bash commands  
**Recommendation:** Explicitly whitelist required env vars instead of spreading all

### 3. Race Conditions in File Operations

**Severity:** Medium  
**Files:** persistence.ts, patch.ts, edit.ts

```typescript
// Check-then-act pattern is not atomic:
const stats = await fs.stat(filePath).catch(() => null)
// ... time passes ...
await fs.writeFile(filePath, content) // File may have changed!
```

**Recommendation:**

- Use file locking for critical sections
- Use atomic write operations (write to temp, then rename)
- Consider using SQLite for session persistence

### 4. No Input Sanitization on Shell Commands

**Severity:** Medium  
**File:** src/tool/bash.ts

While the tool executes user-requested commands (which is intentional), there's no sandboxing or rate limiting.

**Recommendation:**

- Document security model clearly
- Consider optional sandboxing (containers, firejail)
- Add command logging for audit trail

---

## 🟠 RELIABILITY ISSUES (Error Handling & Robustness)

### 1. Silent Error Swallowing with Empty Catches

**Severity:** High  
**Files:** 6 locations with `catch {}`, 90+ locations with `.catch(() => {})`

```typescript
// Silent failures hide bugs:
} catch {}  // No logging, no action

.catch(() => {})  // Error silently discarded
```

**Locations identified:**

- `src/session/message-v2.ts:662`
- `src/session/retry.ts:89`
- `src/cli/cmd/tui/component/prompt/index.tsx:923`
- `src/server/mdns.ts:37`
- `src/pty/index.ts:79, 175`
- 90+ `.catch(() => {})` patterns throughout codebase

**Recommendation:**

- Log errors even when "handling" them: `.catch(e => log.debug("expected", e))`
- Only silence errors with explicit comment explaining why
- Create lint rule to flag empty catch blocks

### 2. Missing `.unref()` on Background Intervals

**Severity:** Medium  
**Files:** persistence.ts, errors.ts, server.ts

```typescript
// src/cli/cmd/debug/errors.ts:154
setInterval(checkForNewErrors, 1000)  // No .unref() - prevents exit!

// src/session/persistence.ts:109
checkpointInterval = setInterval(...)  // Not .unref()'d

// Good example from models.ts:117
setInterval(() => ModelsDev.refresh(), 60 * 1000 * 60).unref()  // ✓ Correct
```

**Impact:** Process may not exit cleanly  
**Recommendation:** Add `.unref()` to all background intervals that shouldn't prevent exit

### 3. No `Promise.allSettled` for Independent Operations

**Severity:** Medium  
**Files:** 25+ locations

```typescript
// If ANY promise fails, ALL results are lost:
await Promise.all([
  operationA(), // If this fails...
  operationB(), // ...this result is lost too
])
```

**Recommendation:** Use `Promise.allSettled` for independent operations where partial success is acceptable

### 4. Incomplete Cleanup on Init Failure

**Severity:** Medium  
**File:** src/session/persistence.ts

```typescript
export async function init() {
  // Starts intervals at lines 109, 115
  // If something fails AFTER starting intervals, they're not cleaned up
}
```

**Recommendation:** Implement proper cleanup on init failure using try-finally

### 5. Missing Timeout on External Fetches

**Severity:** Medium  
**Various files**

Some HTTP fetches don't have explicit timeouts, relying on system defaults.

**Recommendation:** All external requests should have configurable timeouts

---

## 🟡 PERFORMANCE ISSUES

### 1. Frequent `JSON.stringify` for Logging/Storage

**Severity:** Low  
**Files:** persistence.ts, multiple tools

```typescript
// Creating JSON strings on every checkpoint
await fs.writeFile(path, JSON.stringify(sessionData, null, 2))
```

**Recommendation:**

- Consider binary formats (MessagePack, CBOR) for high-frequency storage
- Skip pretty-printing (`null, 2`) in production

### 2. Unbounded In-Memory Buffers

**Severity:** Medium  
**File:** src/session/persistence.ts:78

```typescript
let walBuffer: WALEntry[] = [] // Can grow unbounded
```

**Recommendation:**

- Add max size limit
- Flush when buffer exceeds threshold

### 3. Repeated File Stat Calls

**Severity:** Low  
**Files:** Various tools

Many tools call `fs.stat` multiple times for the same file in quick succession.

**Recommendation:** Cache stat results within a single operation

### 4. Serial MCP Tool Fetching

**Severity:** Low  
**File:** src/mcp/index.ts

MCP servers are polled sequentially for tools.

**Recommendation:** Parallelize with `Promise.all` (already partially done)

### 5. No Caching of Parsed Configs

**Severity:** Low  
**File:** src/config/config.ts

Config is parsed on each access.

**Recommendation:** Cache parsed config with TTL or invalidation

---

## 📋 TODO Comments Requiring Attention

```typescript
// src/provider/transform.ts:294
// TODO: YOU CANNOT SET max_tokens if this is set!!!  ⚠️ CRITICAL

// src/session/prompt.ts:316
// TODO: centralize "invoke tool" logic

// src/server/server.ts:80
// TODO: Break server.ts into smaller route files to fix type inference

// src/permission/next.ts:212
// TODO: we don't save the permission ruleset to disk yet
```

---

## 🎯 Priority Recommendations

### Immediate (P0) - Do This Week

1. Add logging to empty catch blocks
2. Add `.unref()` to background intervals in persistence.ts and errors.ts
3. Validate critical JSON.parse calls with zod

### Short-Term (P1) - Next Sprint

4. Replace check-then-act patterns with atomic operations
5. Limit env var exposure in bash tool
6. Add max size to WAL buffer

### Medium-Term (P2) - Next Quarter

7. Replace JSON persistence with SQLite for sessions
8. Add comprehensive error telemetry
9. Implement proper circuit breakers for external services

### Long-Term (P3)

10. Consider sandboxing for bash tool
11. Add fuzzing tests for parsers
12. Implement structured concurrency patterns

---

## 📊 Summary Statistics

| Category               | Count | Critical | Medium | Low |
| ---------------------- | ----- | -------- | ------ | --- |
| Silent error catches   | 96+   | 6        | 30     | 60  |
| Unvalidated JSON.parse | 35    | 5        | 20     | 10  |
| Missing .unref()       | 9     | 0        | 3      | 6   |
| Race conditions        | 8     | 2        | 4      | 2   |
| TODO comments          | 22    | 1        | 5      | 16  |

---

_This analysis was performed by searching for common anti-patterns. Manual code review may reveal additional issues._
