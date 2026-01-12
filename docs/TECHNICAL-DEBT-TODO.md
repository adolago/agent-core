# Technical Debt & Code Ergonomics TODO

**Generated:** 2026-01-11
**Updated:** 2026-01-11 (Sprints 1-5 COMPLETED)
**Scope:** agent-core engine + personas system
**Diagnostic Method:** Deep codebase analysis via exploration agents

## Completion Status

| Sprint | Status | Key Deliverables |
|--------|--------|------------------|
| Sprint 1: Stability | ✅ DONE | Memory leak fixes, WAL mutex, config validation |
| Sprint 2: Error Handling | ✅ DONE | Fire-and-forget error handling, RPC timeout, type safety |
| Sprint 3: Debug Ergonomics | ✅ DONE | Debug commands (logs, tasks, memory, flags), AGENT_CORE_* prefix |
| Sprint 4: Testing | ✅ DONE | LLM mock infrastructure, Telegram API mock, persistence tests |
| Sprint 5: Polish | ✅ DONE | Code quality improvements, documented silent catches |

---

## Executive Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Error Handling | 2 | 6 | 4 | 3 | 15 |
| Type Safety | 4 | 8 | 12 | 6 | 30 |
| State/Config | 5 | 4 | 5 | 3 | 17 |
| Debug/Ergonomics | 0 | 5 | 8 | 4 | 17 |
| Test Coverage | 0 | 4 | 6 | 4 | 14 |
| **TOTAL** | **11** | **27** | **35** | **20** | **93** |

---

## Phase 1: CRITICAL (Stability & Data Integrity)

### 1.1 Memory Leaks (5 items)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| ML-1 | Event listeners never unsubscribed | `persistence.ts:159-191` | Cumulative on daemon restarts |
| ML-2 | Session start times map never cleared | `lifecycle.ts:251` | Unbounded growth with crashed sessions |
| ML-3 | Bus.subscribe() without cleanup | `share-next.ts:19-55` | Duplicate processing |
| ML-4 | Bus.subscribe() without cleanup | `project/bootstrap.ts:26` | Listener accumulation |
| ML-5 | Bus.subscribeAll() without cleanup | `plugin/index.ts:112`, `tui/worker.ts:66`, `format/index.ts:105` | Listener accumulation |

**Fix Pattern:**
```typescript
// Store unsubscribe functions
const unsubscribers: Array<() => void> = []

function setupEventListeners(): void {
  unsubscribers.push(Bus.subscribe(Session.Event.Created, handler))
  // ...
}

function shutdown(): void {
  unsubscribers.forEach(unsub => unsub())
  unsubscribers.length = 0
}
```

### 1.2 Race Conditions (2 items)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| RC-1 | WAL buffer race in append/flush | `persistence.ts:194-211` | Data loss on concurrent access |
| RC-2 | Non-atomic buffer array operations | `persistence.ts:196,203` | Entry duplication/loss |

**Fix:** Add mutex lock for WAL operations:
```typescript
import { Mutex } from 'async-mutex'
const walMutex = new Mutex()

async function flushWAL(): Promise<void> {
  const release = await walMutex.acquire()
  try {
    // ... flush logic
  } finally {
    release()
  }
}
```

### 1.3 Missing Feature Implementations (4 items)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| MF-1 | Permission ruleset not persisted to disk | `permission/next.ts:212` | Data loss on daemon restart |
| MF-2 | Memory persistence: Redis/Qdrant backend incomplete | `memory-persistence.ts:85` | Only file backend works |
| MF-3 | Fact extraction uses mock data | `fact-extraction-hook.ts:147` | Facts not actually extracted |
| MF-4 | Updated config not re-validated | `config.ts:1337-1342` | Can write invalid state |

---

## Phase 2: HIGH (Error Handling & Type Safety)

### 2.1 Silent/Lost Errors (6 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| SE-1 | Fire-and-forget summarize() | `processor.ts:271-274` | Add `.catch(log.error)` |
| SE-2 | Fire-and-forget summarize() | `prompt.ts:563-567` | Add `.catch(log.error)` |
| SE-3 | Sharing errors silently ignored | `session/index.ts:222-224` | Log error reason |
| SE-4 | Poll loop continues on auth failure | `telegram.ts:457-465` | Add exponential backoff + circuit breaker |
| SE-5 | HTTP errors become null | `telegram.ts:181-206` | Throw typed errors, let caller handle |
| SE-6 | runCommand never rejects | `telegram.ts:288-313` | Reject on spawn failure |

### 2.2 RPC/Timeout Issues (2 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| RT-1 | RPC calls hang indefinitely | `util/rpc.ts:58-64` | Add timeout with AbortController |
| RT-2 | Pending requests never cleaned | `util/rpc.ts` | Cleanup on worker crash |

**Fix Pattern:**
```typescript
call<Method>(method: Method, input: Parameters<T[Method]>[0], timeout = 30000): Promise<ReturnType<T[Method]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error(`RPC call ${String(method)} timed out after ${timeout}ms`))
    }, timeout)

    pending.set(requestId, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
    // ...
  })
}
```

### 2.3 Type Safety Critical (8 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| TS-1 | `catch (e: any)` | `processor.ts:340`, `github.ts:625` | Use `catch (e: unknown)` with narrowing |
| TS-2 | Provider options `any` | `provider.ts:43,68,112-159` | Type provider-specific options |
| TS-3 | Event handler untyped | `server.ts:524` | Define `ServerEvent` interface |
| TS-4 | JSON.parse unvalidated | `config.ts:83,157` | Add zod validation |
| TS-5 | JSON.parse unvalidated | `persistence.ts:223,409,424,472` | Add zod validation |
| TS-6 | JSON.parse unvalidated | `message-v2.ts:656`, `retry.ts:68` | Add zod validation |
| TS-7 | Process internals `as any` | `eventloop.ts:7,11` | Use `unknown` + runtime check |
| TS-8 | Dynamic object assignment | `permission.ts:264,266`, `agent.ts:322,324` | Type the builder pattern |

### 2.4 Architectural Refactoring (2 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| AR-1 | server.ts too large (3858 LOC) | `server.ts:80` | Split into route modules |
| AR-2 | TS2589 type inference chain | `server.ts:81` | Route splitting will fix |

---

## Phase 3: MEDIUM (CLI Ergonomics & Debugging)

### 3.1 Missing Debug Endpoints (8 items)

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| DE-1 | `/logs/search` | Search logs by time, level, service, keyword | HIGH |
| DE-2 | `/memory/stats` | Qdrant metrics (vectors, collections, storage) | HIGH |
| DE-3 | `/tasks/active` | Background job/drone visibility | HIGH |
| DE-4 | `/performance/metrics` | Endpoint timing, throughput | MEDIUM |
| DE-5 | `/errors/recent` | Last 100 errors with stack traces | MEDIUM |
| DE-6 | `/debug/bundle` | Export diagnostic bundle (config + logs + state) | MEDIUM |
| DE-7 | `/websocket/connections` | Active WebSocket tracking | LOW |
| DE-8 | `/experimental/status` | Experimental feature telemetry | LOW |

### 3.2 Debug Command Improvements (5 items)

| ID | Command | Current State | Needed |
|----|---------|---------------|--------|
| DC-1 | `debug logs` | N/A | Tail/search log files |
| DC-2 | `debug memory` | N/A | Qdrant collection stats |
| DC-3 | `debug tasks` | N/A | List running drones/background tasks |
| DC-4 | `debug network` | N/A | Show active connections |
| DC-5 | `debug bundle` | N/A | Create diagnostic export |

### 3.3 Logging Improvements (4 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| LI-1 | 218 console.log/error/warn calls | Multiple files | Migrate to structured logging |
| LI-2 | No log aggregation | `util/log.ts` | Add search capability |
| LI-3 | CLI output mixed with logging | `github.ts`, `stats.ts` | Separate user output from logs |
| LI-4 | Missing log metadata | Multiple | Add requestID, sessionID context |

### 3.4 Flag System Modernization (2 items)

| ID | Issue | Description |
|----|-------|-------------|
| FL-1 | `OPENCODE_*` prefix | Migrate to `AGENT_CORE_*` per CLAUDE.md |
| FL-2 | No flag documentation | Add `debug flags` command to list all |

---

## Phase 4: MEDIUM (State & Config)

### 4.1 Configuration Validation (5 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| CV-1 | Circular config imports | `config.ts:1231-1254` | Track visited paths |
| CV-2 | Silent env var substitution failure | `config.ts:1217-1218` | Warn on missing vars |
| CV-3 | Plugin resolution only warns | `config.ts:1292-1296` | Surface to user |
| CV-4 | LSP extensions not validated | `config.ts:1039-1054` | Validate extension format |
| CV-5 | Checkpoint integrity unverified | `persistence.ts:402-429` | Add checksums |

### 4.2 Hardcoded Values (4 items)

| ID | Value | Location | Action |
|----|-------|----------|--------|
| HV-1 | WAL flush: 1000ms | `persistence.ts:36` | Make configurable |
| HV-2 | Checkpoint: 5 minutes | `persistence.ts:40` | Make configurable |
| HV-3 | Disposal timeout: 10s | `project/state.ts:46` | Make configurable |
| HV-4 | DOOM_LOOP_THRESHOLD: 3 | `processor.ts:21` | Make configurable |

---

## Phase 5: TEST COVERAGE

### 5.1 Critical Untested Code (4 items)

| ID | Module | LOC | Priority |
|----|--------|-----|----------|
| TC-1 | Gateway: Telegram | 1,046 | HIGH |
| TC-2 | Gateway: WhatsApp | 782 | HIGH |
| TC-3 | Session Processor | ~300 | HIGH |
| TC-4 | Server HTTP API | 3,858 | HIGH |

### 5.2 Missing Mock Infrastructure (6 items)

| ID | Mock Needed | Impact |
|----|-------------|--------|
| TM-1 | LLM Provider responses | Can't test LLM integration |
| TM-2 | Telegram API | Can't test gateway |
| TM-3 | WhatsApp API | Can't test gateway |
| TM-4 | Qdrant (in-memory) | Integration tests need real DB |
| TM-5 | Network/fetch interceptor | Can't test HTTP calls |
| TM-6 | File system (in-memory) | Tests use real tmpdir |

### 5.3 Integration Test Gaps (4 items)

| ID | Area | Current State |
|----|------|---------------|
| TI-1 | Daemon lifecycle | No tests |
| TI-2 | Persona delegation | Only 2 tests |
| TI-3 | CLI commands | No tests |
| TI-4 | TUI synchronization | No tests |

---

## Phase 6: LOW (Polish & Documentation)

### 6.1 Remaining TODOs to Address (6 items)

| ID | TODO | Location | Action |
|----|------|----------|--------|
| TD-1 | Pricing model workaround | `session/index.ts:445` | Update models.dev or document |
| TD-2 | Dialog implementation | `server.ts:3442` | Implement or remove |
| TD-3 | Emit permission change event | `agent/permission.ts:434` | Implement event |
| TD-4 | Centralize tool invocation | `prompt.ts:316` | Refactor |
| TD-5 | Complex task tool input | `prompt.ts:1580` | Design solution |
| TD-6 | max_tokens constraint | `transform.ts:288` | Enforce or document |

### 6.2 Code Quality (4 items)

| ID | Issue | Action |
|----|-------|--------|
| CQ-1 | 40+ silent `.catch(() => {})` | Add logging |
| CQ-2 | Inconsistent error messages | Standardize format |
| CQ-3 | Missing return types | Add to exported functions |
| CQ-4 | Weak Record<string, any> typing | Use specific interfaces |

---

## Implementation Order

### Sprint 1: Stability (Critical)
1. ML-1 through ML-5 (Memory leaks)
2. RC-1, RC-2 (Race conditions)
3. MF-1 (Permission persistence)
4. MF-4 (Config validation)

### Sprint 2: Error Handling (High)
1. SE-1 through SE-6 (Silent errors)
2. RT-1, RT-2 (RPC timeouts)
3. TS-1 through TS-4 (Type safety)

### Sprint 3: Debug Ergonomics (Medium)
1. DE-1, DE-2, DE-3 (Core debug endpoints)
2. DC-1 through DC-5 (Debug commands)
3. LI-1 (Console to structured logging)
4. FL-1 (Flag prefix migration)

### Sprint 4: Testing (Medium)
1. TM-1, TM-2, TM-3 (Mock infrastructure)
2. TC-1, TC-2 (Gateway tests)
3. TC-3, TC-4 (Processor/server tests)

### Sprint 5: Polish (Low)
1. TD-1 through TD-6 (TODO cleanup)
2. CQ-1 through CQ-4 (Code quality)
3. HV-1 through HV-4 (Configurable values)

---

## Quick Wins (Can Do Now)

1. **Add `.catch(log.error)` to fire-and-forget calls** - 5 minutes each
2. **Replace `catch (e: any)` with `catch (e: unknown)`** - 2 minutes each
3. **Add timeout to RPC calls** - 30 minutes
4. **Store Bus.subscribe() unsubscribe functions** - 1 hour
5. **Add `AGENT_CORE_*` flag aliases** - 30 minutes

---

## Metrics to Track

- [ ] Memory leak: Monitor daemon RSS over 24h restarts
- [ ] Type safety: Track `any` count with `grep -r "as any" | wc -l`
- [ ] Test coverage: Target 50% for critical paths
- [ ] Console.log count: Target <50 (from 218)
- [ ] Silent catch blocks: Target 0 (from 40+)
