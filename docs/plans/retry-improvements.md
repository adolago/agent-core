# Retry Logic Improvements Plan

**Priority**: Safety > Reliability > Performance  
**Principle**: The best code is less code

---

## Executive Summary

Three targeted changes to the retry/error handling system that delete ~62 lines while improving safety, reliability, and performance. All changes are model-agnostic and work across Anthropic, OpenAI, Google, OpenRouter, and any OpenAI-compatible provider.

---

## 1. SAFETY: Remove JSON.stringify Secret Leakage Vector

### Status: IMPLEMENTED

### Problem
The `getErrorMessage()` function in `src/session/retry.ts` contained a `JSON.stringify(error)` fallback that could serialize entire error objects, potentially exposing:
- API keys in request headers
- OAuth tokens in error context
- Provider-specific credentials
- Request bodies with sensitive data

### Research
- Error objects from LLM SDKs often contain `responseHeaders`, `request.headers`, and `config` properties
- Redaction markers (`[REDACTED:*]`) work on known patterns but JSON serialization creates new strings that bypass this
- All major providers (Anthropic, OpenAI, Google) return error objects with nested context

### Solution
Remove the `JSON.stringify` fallback, keeping only safe extraction paths:
1. `Error.message`
2. `obj.message` / `obj.error`
3. `String(error)` (fallback - doesn't serialize nested properties)

### Verification
```typescript
// Before: Could leak secrets
const err = { message: "Rate limited", responseHeaders: { authorization: "sk-..." } }
getErrorMessage(err) // Could return '{"message":"Rate limited","responseHeaders":{"authorization":"sk-..."}}'

// After: Safe
getErrorMessage(err) // Returns "Rate limited"
```

### Lines Removed: 5

---

## 2. RELIABILITY: Consolidate Duplicate Retry Utilities

### Status: IMPLEMENTED

### Problem
Two separate retry implementations existed:
1. `packages/agent-core/src/util/retry.ts` - Simple 41-line utility
2. `src/session/retry.ts` - Full-featured 374-line module

This created:
- Inconsistent retry behavior between code paths
- Different transient error detection (string list vs pattern matching)
- Different backoff configurations (3 attempts vs 5)
- Maintenance burden when fixing bugs

### Research: Provider-Specific Requirements

| Provider | Rate Limit | Retry-After | Overload | Recommended Backoff |
|----------|------------|-------------|----------|---------------------|
| **Anthropic** | 429 | Yes (seconds) | "overloaded_error" | Exponential + jitter |
| **OpenAI** | 429 | Yes (seconds/date) | "slow_down", 503 | Exponential + jitter |
| **Google Gemini** | 429 (RESOURCE_EXHAUSTED) | No | 503, 500 | Exponential, switch models |
| **OpenRouter** | 429 | Yes | 502, 503 | Fallback to different provider |

**Key insight**: The session retry module (`src/session/retry.ts`) already handles all these cases:
- `RETRYABLE_ERRORS.RATE_LIMITED`: `['rate limit', 'too many requests', '429']`
- `RETRYABLE_ERRORS.OVERLOADED`: `['overloaded', 'exhausted', 'unavailable', '503']`
- `RETRYABLE_ERRORS.SERVER_ERROR`: `['server_error', 'internal error', '500', '502', '504']`
- `parseRetryAfterHeader()`: Handles both seconds and HTTP date formats

### Solution
Delete `packages/agent-core/src/util/retry.ts` entirely. It had zero imports (verified with grep).

### Model Agnosticism Verification
The consolidated retry module uses pattern matching that works for all providers:

```typescript
// These patterns match all major providers
RETRYABLE_ERRORS = {
  RATE_LIMITED: ['rate limit', 'too many requests', '429'],  // All providers
  OVERLOADED: ['overloaded', 'exhausted', 'unavailable', '503'],  // All providers
  SERVER_ERROR: ['server_error', 'internal error', '500', '502', '504'],  // All providers
  NETWORK: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'connection reset'],  // All networks
  CAPACITY: ['no_kv_space', 'capacity'],  // Anthropic-specific, harmless for others
}
```

### Fallback Chain Integration
The retry module works in concert with `fallback-chain.ts` which handles provider-specific fallback:

```
Request fails → classifyError() → RetryStrategy decides delay → Retry same provider
                     ↓
              If retries exhausted → FallbackChain.resolve() → Try different provider
```

### Lines Removed: 41

---

## 3. PERFORMANCE: Use Node.js Built-in Abortable Sleep

### Status: IMPLEMENTED

### Problem
The `DefaultRetryStrategy.sleep()` method had a 20-line hand-rolled implementation with:
- Manual `setTimeout` + `clearTimeout`
- Event listener management for abort
- `DOMException` construction
- Memory allocation for closures per retry

### Research
Node.js 16+ provides `node:timers/promises` with native AbortSignal support:
- Battle-tested runtime primitive
- Zero event listener overhead
- Proper cleanup on abort
- Used by Node.js core for all async timeouts

### Solution
Replace the entire implementation with:
```typescript
async sleep(ms: number, signal: AbortSignal): Promise<void> {
  const { setTimeout: delay } = await import('node:timers/promises');
  await delay(ms, undefined, { signal });
}
```

### Performance Impact
Per retry attempt:
- Before: 2 function allocations, 1 event listener registration, 1 timeout handle
- After: 1 native call, automatic cleanup

For a 5-retry sequence with 60s max delay, this could mean:
- ~10 fewer closure allocations
- ~5 fewer event listener registrations
- Cleaner stack traces on abort

### Compatibility
- Node.js 16+: Full support
- Bun: Full support (uses Node.js compatibility layer)
- Browser: N/A (this module is server-side only)

### Lines Removed: 16

---

## Architecture Integration

### How These Changes Fit the Retry Ecosystem

```
┌─────────────────────────────────────────────────────────────────────┐
│                     REQUEST LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Request → Provider                                              │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  CircuitBreaker.canUse(providerID)                              ││
│  │  - If OPEN: Block immediately, trigger fallback                 ││
│  │  - If HALF_OPEN: Allow limited requests                         ││
│  │  - If CLOSED: Allow all requests                                ││
│  └─────────────────────────────────────────────────────────────────┘│
│         │                                                           │
│         ▼                                                           │
│  2. Error occurs                                                    │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  src/session/retry.ts (CONSOLIDATED)                            ││
│  │  - classifyError() → RATE_LIMITED, OVERLOADED, etc.             ││
│  │  - getErrorMessage() → Safe extraction (NO JSON.stringify)      ││
│  │  - calculateDelay() → Exponential backoff + Retry-After         ││
│  │  - sleep() → Native node:timers/promises                        ││
│  └─────────────────────────────────────────────────────────────────┘│
│         │                                                           │
│         ▼                                                           │
│  3. Retry or Fallback?                                              │
│         │                                                           │
│    ┌────┴────┐                                                      │
│    │         │                                                      │
│    ▼         ▼                                                      │
│  RETRY    FALLBACK                                                  │
│  (same    (different                                                │
│  provider) provider)                                                │
│    │         │                                                      │
│    │         ▼                                                      │
│    │  ┌─────────────────────────────────────────────────────────────┐
│    │  │  FallbackChain.resolve()                                   ││
│    │  │  - classifyError() → rate_limit, unavailable, timeout      ││
│    │  │  - findRule() → Match fallback config                       ││
│    │  │  - ModelEquivalence → Find equivalent model                 ││
│    │  └─────────────────────────────────────────────────────────────┘
│    │         │                                                      │
│    └────┬────┘                                                      │
│         ▼                                                           │
│  4. Update CircuitBreaker                                           │
│  - recordSuccess() or recordFailure()                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Provider-Specific Handling (Unchanged)

The fallback chain in `packages/agent-core/src/provider/fallback-chain.ts` handles provider-specific quirks:

```typescript
// OpenAI insufficient_quota → treated as rate_limit → fallback to Anthropic/Google
if (json.error?.type === "insufficient_quota") return "rate_limit"

// Anthropic overloaded_error → treated as unavailable → fallback
if (json.error?.type === "overloaded_error") return "unavailable"

// Google RESOURCE_EXHAUSTED → treated as rate_limit
if (errorMessage.includes("exhausted")) return "unavailable"
```

---

## Testing Checklist

### Safety
- [ ] Verify `getErrorMessage` doesn't serialize nested objects
- [ ] Test with error objects containing mock API keys
- [ ] Confirm retry classification still works with simplified extraction

### Reliability
- [ ] Verify no imports of deleted `util/retry.ts`
- [ ] Test retry behavior with each provider type
- [ ] Confirm Retry-After header parsing works
- [ ] Test circuit breaker integration

### Performance
- [ ] Verify `node:timers/promises` import works
- [ ] Test abort signal cancellation
- [ ] Benchmark retry loop under load (optional)

---

## Summary

| Category | Change | Lines Removed | Risk |
|----------|--------|---------------|------|
| Safety | Remove JSON.stringify secret leak | -5 | Low |
| Reliability | Delete duplicate retry utility | -41 | Low (zero imports) |
| Performance | Use native abortable sleep | -16 | Low (Node 16+) |
| **Total** | | **-62** | |

All changes maintain model-agnostic behavior and work with the existing fallback chain and circuit breaker infrastructure.
