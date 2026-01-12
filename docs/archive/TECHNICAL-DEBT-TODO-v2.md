# Technical Debt & Code Ergonomics TODO v2

**Generated:** 2026-01-11
**Scope:** Multi-repo deep diagnostic (agent-core engine + personas + gateways + tests)
**Method:** Parallel exploration agents with comprehensive codebase analysis

---

## Executive Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Silent Error Handling | 14 | 8 | 6 | 4 | 32 |
| Type Safety | 6 | 15 | 12 | 8 | 41 |
| Gateway Issues | 5 | 11 | 9 | 5 | 30 |
| Incomplete Implementations | 3 | 4 | 2 | 0 | 9 |
| Test Coverage Gaps | 4 | 6 | 5 | 4 | 19 |
| Debug Ergonomics | 0 | 5 | 5 | 3 | 13 |
| **TOTAL** | **32** | **49** | **39** | **24** | **144** |

---

## Phase 1: CRITICAL (Immediate Stability)

### 1.1 Memory Leaks & Uncontrolled Listeners (6 items)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| ML-6 | Event subscriptions without unsubscribe | `share/share.ts:49-65` | Listener accumulation |
| ML-7 | WhatsApp .on() listeners never removed | `gateway/whatsapp.ts:113-173` | Listeners persist across reconnects |
| ML-8 | SSE keepalive interval leak potential | `server.ts:1460-1476` | Timer leak if stream errors |
| ML-9 | ChatContexts Map grows unbounded | `telegram.ts:134`, `whatsapp.ts:65` | No TTL/LRU eviction |
| ML-10 | processedSessions Set grows to 1000 | `fact-extraction-hook.ts:43` | No LRU, FIFO-only eviction |
| ML-11 | Tiara syncInterval overlapping saves | `tiara.ts:158-160` | State race condition |

**Fix Pattern:**
```typescript
// For event listeners - store and cleanup
const unsubscribers: Array<() => void> = []
unsubscribers.push(Bus.subscribe(Event, handler))
// In shutdown: unsubscribers.forEach(u => u())

// For Maps - implement LRU or TTL
const MAX_CONTEXTS = 500
if (chatContexts.size > MAX_CONTEXTS) {
  const oldest = chatContexts.keys().next().value
  chatContexts.delete(oldest)
}
```

### 1.2 Silent Error Swallowing (8 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| SE-7 | Fire-and-forget event handlers | `whatsapp.ts:113 (qr), 175 (message)` | Add top-level try-catch with log |
| SE-8 | Nested catch discards first error | `canvas-tool.ts:53-74` | Log original error before fallback |
| SE-9 | Peer review errors skipped | `council-stages.ts:297-298` | Log failed reviews |
| SE-10 | Qdrant operations catch without context | `qdrant.ts:109-110, 156-157, 268-270` | Distinguish "not found" vs network error |
| SE-11 | Fact extraction hook fails silently | `fact-extraction-hook.ts:76-78` | Add retry + event emission |
| SE-12 | LLM extraction fallback hides API issues | `fact-extractor.ts:103-106` | Track failure reason |
| SE-13 | Share queue chain no error handling | `share/share.ts:22-45` | Add .catch() to queue |
| SE-14 | Broadcast failures not reported | `whatsapp.ts:705-709` | Return failure count like Telegram |

### 1.3 Race Conditions (3 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| RC-3 | WhatsApp running=true before init completes | `whatsapp.ts:177-178` | Set after initialize() succeeds |
| RC-4 | Telegram poll continues on handler error | `telegram.ts:468-487` | Don't increment lastUpdateId on error |
| RC-5 | MemoryStore singleton TOCTOU race | `memory/store.ts:321-331` | Use mutex or lazy init pattern |

### 1.4 Incomplete Critical Implementations (3 items)

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| MF-5 | `getSessionContent()` returns empty string | `fact-extraction-hook.ts:147-156` | Fact extraction completely broken |
| MF-6 | Memory persistence Redis/Qdrant loading stub | `memory-persistence.ts:85` | Only file backend works |
| MF-7 | Permission denial not signaled to UI | `permission.ts:434` | User doesn't see why blocked |

---

## Phase 2: HIGH (Error Handling & Gateway Stability)

### 2.1 Gateway Polling & Retry Issues (6 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| GW-1 | No exponential backoff in poll loop | `telegram.ts:454-466` | Add backoff on error |
| GW-2 | Process timeout doesn't actually kill | `telegram.ts:288-313` | Implement proper SIGKILL |
| GW-3 | No fetch timeout on any HTTP call | `telegram.ts:185, 228, 818, 846, 882` | Add AbortController timeout |
| GW-4 | Hardcoded 30s long-poll timeout | `telegram.ts:215` | Make configurable |
| GW-5 | No rate limit detection (429) | All API calls | Parse Retry-After header |
| GW-6 | File download no retry on transient | `telegram.ts:225-240` | Add retry for 503/timeout |

**Exponential Backoff Pattern:**
```typescript
private pollBackoff = 1000
private readonly MAX_BACKOFF = 60000

private pollLoop(): void {
  this.poll()
    .then(() => { this.pollBackoff = 1000 }) // Reset on success
    .catch((error) => {
      log.error("Poll error", { error })
      this.pollBackoff = Math.min(this.pollBackoff * 2, this.MAX_BACKOFF)
    })
    .finally(() => {
      if (this.running) {
        setTimeout(() => this.pollLoop(), this.pollBackoff)
      }
    })
}
```

### 2.2 Missing JSON Validation (6 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| JV-1 | Config JSON.parse unvalidated | `config.ts:83, 157` | Add zod schema |
| JV-2 | WAL entry cast without validation | `persistence.ts:277` | Validate before cast |
| JV-3 | API response cast to type | `telegram.ts:834` | Check required fields |
| JV-4 | OAuth token response assumed | `google-antigravity-auth.ts:181-182, 225-226` | Validate shape |
| JV-5 | Zee tools response.json() cast | `zee/tools.ts:289, 333, 886` | Validate success field |
| JV-6 | Calendar API generic T cast | `google/calendar.ts:103, 143, 321` | Add schema validation |

**Validation Pattern:**
```typescript
import { z } from "zod"

const TelegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  description: z.string().optional(),
})

const data = TelegramResponseSchema.parse(await response.json())
```

### 2.3 Type Safety Violations (15 items)

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| TS-9 | 40+ `@ts-ignore` comments | Multiple files | Audit and reduce |
| TS-10 | `Record<string, any>` in logger | `util/log.ts:24-27` | Define LogMeta interface |
| TS-11 | Provider options `any` | `provider.ts:43, 68, 112-159` | Type per-provider |
| TS-12 | Permission merge unsafe casts | `permission.ts:136, 257, 262-266` | Use type guards |
| TS-13 | Qdrant payload cast | `memory/store.ts:177-211` | Validate payload shape |
| TS-14 | Memory bridge unsafe casts | `memory-bridge.ts:242, 283, 426` | Add validation |
| TS-15 | Category cast to any | `zee/tools.ts:168` | Validate before passing |
| TS-16 | Env var cast to any | `memory/store.ts:41` | Use enum validation |
| TS-17 | Browser schema any | `browser/browser.ts:316` | Type schema properly |
| TS-18 | Council model cast | `council-providers.ts:140` | Use adapter pattern |
| TS-19 | Plugin memory params | `memory-persistence.ts:364-381` | Define proper types |
| TS-20 | Message type string check | `whatsapp.ts:220` | Use enum/type guard |
| TS-21 | Persona cast unchecked | `whatsapp.ts:317` | Validate command |
| TS-22 | Private member access | `memory-bridge.ts:629-638` | Expose via interface |
| TS-23 | RPC definition any | `util/rpc.ts:3, 28, 30-31` | Type worker methods |

### 2.4 Console vs Structured Logging (14+ locations)

| ID | Files | Fix |
|----|-------|-----|
| CL-1 | `tiara.ts:159, 305, 535, 577` | Replace console with Log module |
| CL-2 | `fact-extractor.ts:104` | Use structured log |
| CL-3 | `fact-extraction-hook.ts:77, 82, 133, 137` | Use structured log |
| CL-4 | `council-stages.ts:299` | Use log.warn |
| CL-5 | `lsp/server.ts:220, 229, 235, 239` | Use structured log |
| CL-6 | `util/rpc.ts:12, 38` | Use log.error |
| CL-7 | `gateway/whatsapp.ts:131-134` | Keep for QR (user-facing) |

---

## Phase 3: MEDIUM (Test Coverage & Debug Ergonomics)

### 3.1 Critical Untested Modules (19 directories)

| ID | Module | LOC | Priority |
|----|--------|-----|----------|
| TC-5 | gateway/ (telegram + whatsapp) | 1,852 | CRITICAL |
| TC-6 | processor.ts | 410 | CRITICAL |
| TC-7 | server.ts HTTP endpoints | 3,858 | CRITICAL |
| TC-8 | prompt.ts | 53K | HIGH |
| TC-9 | orchestration/ | 494 | HIGH |
| TC-10 | hooks/ | 506 | HIGH |
| TC-11 | plugin/ | 911 | HIGH |
| TC-12 | bus/ | 161 | MEDIUM |
| TC-13 | pty/ | 233 | MEDIUM |
| TC-14 | worktree/ | 217 | MEDIUM |
| TC-15 | storage/ | 226 | MEDIUM |

### 3.2 Missing Mock Infrastructure

| ID | Mock Needed | Purpose |
|----|-------------|---------|
| TM-7 | WhatsApp API mock | Gateway testing |
| TM-8 | HTTP Server mock | Server endpoint tests |
| TM-9 | Session storage mock | Persistence tests |
| TM-10 | Bus/PubSub mock | Event system tests |
| TM-11 | Plugin system mock | Plugin loading tests |
| TM-12 | WezTerm mock | Orchestration tests |

### 3.3 Missing Debug Commands

| ID | Command | Description | Priority |
|----|---------|-------------|----------|
| DC-6 | `debug rpc list` | Show pending RPC calls | HIGH |
| DC-7 | `debug websocket list` | Show active WS connections | HIGH |
| DC-8 | `debug permissions state` | Show current permission state | HIGH |
| DC-9 | `debug errors recent` | Last N errors with traces | HIGH |
| DC-10 | `debug bundle export` | Export diagnostic bundle | MEDIUM |
| DC-11 | `debug performance` | Endpoint timing metrics | MEDIUM |
| DC-12 | `debug experimental` | Feature flag status | LOW |

**Current Implementation Gap:**
- 3/8 planned debug endpoints implemented (37.5%)
- `debug memory search` is placeholder only
- No HTTP `/debug/*` endpoints exist

### 3.4 Hardcoded Values to Extract (8 items)

| ID | Value | Location | Config Key |
|----|-------|----------|------------|
| HV-5 | Telegram long-poll 30s | `telegram.ts:215` | `gateway.telegram.pollTimeout` |
| HV-6 | Codesearch timeout 30s | `codesearch.ts:77` | `tools.codesearch.timeout` |
| HV-7 | Websearch timeout 25s | `websearch.ts:91` | `tools.websearch.timeout` |
| HV-8 | SSE keepalive 30s | `server.ts:1469` | `server.sse.keepalive` |
| HV-9 | Terminal detect 1s | `tui/app.tsx:97` | `tui.terminalDetectTimeout` |
| HV-10 | Tiara sync 30s | `tiara.ts:158` | `personas.syncInterval` |
| HV-11 | Fact extraction set limit 1000 | `fact-extraction-hook.ts:70` | `memory.factExtractionLimit` |
| HV-12 | ChatContext no limit | `telegram.ts:134` | `gateway.maxContexts` |

---

## Phase 4: LOW (Polish & Code Quality)

### 4.1 Code Duplication Patterns

| ID | Pattern | Files | Action |
|----|---------|-------|--------|
| CD-1 | Event subscription pattern | share.ts, share-next.ts, persistence.ts, server.ts | Create `safeSubscribe()` helper |
| CD-2 | JSON parse error handling | persistence.ts, config.ts, codesearch.ts, websearch.ts | Create `safeJsonParse<T>()` |
| CD-3 | Fetch with timeout pattern | telegram.ts, websearch.ts, codesearch.ts | Create `fetchWithTimeout()` |

### 4.2 Test Anti-Patterns to Fix

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| TA-1 | Fixture cleanup commented out | `fixture.ts:39` | Uncomment cleanup |
| TA-2 | Random seed in tests | `snapshot.test.ts` | Use fixed IDs |
| TA-3 | Hardcoded /tmp paths | `bash.test.ts`, `patch.test.ts` | Use tmpdir() |
| TA-4 | 39 setTimeout in tests | Multiple | Reduce timing deps |

### 4.3 Documentation Gaps

| ID | Gap | Action |
|----|-----|--------|
| DG-1 | No flag documentation | Add `--help` output for each flag |
| DG-2 | Debug commands undocumented | Add man pages or --help |
| DG-3 | Gateway API not documented | Document Telegram/WhatsApp setup |

---

## Implementation Sprints

### Sprint 6: Gateway Stability (Critical)
1. GW-1 (Exponential backoff)
2. GW-2 (Process timeout fix)
3. GW-3 (Fetch timeout)
4. RC-3 (WhatsApp init race)
5. SE-7 (Event handler errors)
6. ML-7 (WhatsApp listener cleanup)

### Sprint 7: Error Visibility (High)
1. SE-8 through SE-14 (Silent error fixes)
2. CL-1 through CL-6 (Console to structured log)
3. JV-1 through JV-6 (JSON validation)

### Sprint 8: Type Safety (High)
1. TS-9 through TS-23 (Type violations)
2. CD-1 through CD-3 (Helper extraction)

### Sprint 9: Test Coverage (Medium)
1. TC-5 (Gateway tests + WhatsApp mock)
2. TC-6 (Processor tests)
3. TM-7 through TM-12 (Mock infrastructure)

### Sprint 10: Debug Ergonomics (Medium)
1. DC-6 through DC-9 (Critical debug commands)
2. MF-5 (Fix fact extraction)
3. Complete `debug memory search`

---

## Quick Wins (Can Do Now)

1. **Add .catch(log.error) to fire-and-forget calls** - 5 min each
2. **Set WhatsApp running=true AFTER init** - 2 min
3. **Add fetch timeout to gateway calls** - 30 min
4. **Uncomment fixture cleanup** - 1 min
5. **Replace console.log with Log module** - 2 min each
6. **Add backoff to Telegram poll loop** - 30 min

---

## Metrics to Track

- [ ] `@ts-ignore` count: Target <10 (from 40+)
- [ ] Silent catch blocks: Target 0 (from 14 critical)
- [ ] Test coverage: Target 50% of critical paths
- [ ] Debug command coverage: Target 75% of planned (from 37.5%)
- [ ] Hardcoded timeouts: Target 0 (from 8)
- [ ] Console.log count in non-CLI: Target <10 (from 14+)

---

## Cross-Repository Summary

| Repository | Critical | High | Medium | Status |
|------------|----------|------|--------|--------|
| packages/agent-core/src | 18 | 24 | 22 | Active development |
| src/domain | 6 | 8 | 5 | Needs validation |
| src/personas | 4 | 6 | 4 | Incomplete implementations |
| src/memory | 4 | 5 | 4 | Type safety issues |
| test/ | 0 | 6 | 5 | Coverage gaps |
