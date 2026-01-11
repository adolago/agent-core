# TODO: LLM Calling Chain Fixes & Improvements

Comprehensive task list from deep diagnostic analysis. Ordered by priority.

---

## CRITICAL (Blocking / Data Loss / Silent Failures)

### 1. Bootstrap Personas into Agent Registry
**Impact:** Persona configs (temperature, topP, systemPromptAdditions) are completely ignored
**Location:** `packages/agent-core/src/agent/agent.ts:69-117`

```
Problem: src/agent/personas.ts defines Zee (temp=0.7), Stanley (temp=0.3),
         Johny (temp=0.5) but agent.ts only loads 3 system agents.
         Persona definitions never reach runtime.

Fix: Add bootstrap code after line 117:
     - Load persona definitions from config or src/agent/personas.ts
     - Convert to Agent.Info via existing Persona.toAgentInfo()
     - Register in agent registry

Files:
  - packages/agent-core/src/agent/agent.ts (main fix)
  - src/agent/personas.ts (source of persona defs)
  - src/config/types.ts (AgentPersonaConfig type)
```

### 2. Fix Zero Default Retries
**Impact:** Transient API failures (timeouts, 503, 429) cause immediate failure
**Location:** `packages/agent-core/src/session/llm.ts:193`

```
Problem: maxRetries: input.retries ?? 0  // Defaults to 0!

Fix: Change to: maxRetries: input.retries ?? 3

Also consider:
  - Add configurable default in agent-core.jsonc
  - Add retry count to session status display
```

### 3. Validate Thinking Budget + Max Tokens Exclusivity
**Impact:** Silent API failures when both are set
**Location:** `packages/agent-core/src/provider/transform.ts:288` (TODO comment exists)

```
Problem: Comment warns "YOU CANNOT SET max_tokens if this is set!!!"
         but no validation code exists.

Fix: Add validation in maxOutputTokens() function (transform.ts:554-577):
     - If thinkingBudget is set, ensure maxTokens is unset or throw
     - Log warning if conflict detected
```

### 4. Standardize Thinking Budget Values
**Impact:** Inconsistent reasoning quality across providers
**Locations:**
  - `provider.ts:863-864` → Low: 8192, Max: 32768
  - `provider.ts:919-920` → Low: 8192, Max: 32768
  - `transform.ts:354-362` → Low: 16000, Max: 31999

```
Problem: Three different sets of values, unclear which is "correct"
         31999 looks like off-by-one error (should be 32000?)

Fix:
  1. Create central config: THINKING_BUDGETS = { low: 8192, medium: 16000, high: 32000, max: 64000 }
  2. Move to config file or constants.ts
  3. Update all 3 locations to use central config
  4. Document why these specific values
```

---

## HIGH (Significant Functionality Gaps)

### 5. Add Parameter Logging to LLM.stream()
**Impact:** Cannot debug what parameters were actually used
**Location:** `packages/agent-core/src/session/llm.ts:54`

```
Current: Logs modelID and providerID only

Add logging for:
  - temperature (and source: agent/model/default)
  - topP (and source)
  - topK
  - thinkingBudget / reasoningEffort
  - variant selected
  - final merged options object (at debug level)

Example:
  l.info("stream", {
    modelID: input.model.id,
    providerID: input.model.providerID,
    temperature: params.temperature,
    temperatureSource: input.agent.temperature ? 'agent' : 'model',
    topP: params.topP,
    thinkingBudget: options.thinkingBudget,
  })
```

### 6. Add Missing Sampling Parameters to Pipeline
**Impact:** Cannot tune repetition/diversity behavior
**Locations:**
  - `packages/agent-core/src/agent/agent.ts:18-43` (Agent.Info schema)
  - `packages/agent-core/src/session/llm.ts:31-42` (StreamInput type)
  - `packages/agent-core/src/provider/transform.ts` (defaults)

```
Missing parameters:
  - frequency_penalty (-2.0 to 2.0)
  - presence_penalty (-2.0 to 2.0)
  - seed (for reproducibility)
  - minP (min-p sampling)

Fix:
  1. Add to Agent.Info zod schema
  2. Add to LLM.StreamInput type
  3. Add ProviderTransform.frequencyPenalty() function
  4. Add ProviderTransform.presencePenalty() function
  5. Wire through in llm.ts params construction
```

### 7. Define topP in All Personas
**Impact:** Personas lose control over diversity sampling
**Location:** `src/agent/personas.ts`

```
Problem: Only temperature is set:
  - Stanley: temperature=0.3, topP=undefined
  - Zee: temperature=0.7, topP=undefined
  - Johny: temperature=0.5, topP=undefined

Fix: Add topP to each persona config:
  - Stanley: topP=0.9 (more focused for analysis)
  - Zee: topP=0.95 (balanced for conversation)
  - Johny: topP=0.92 (balanced for teaching)
```

### 8. Inject systemPromptAdditions into LLM Calls
**Impact:** Persona-specific instructions never reach model
**Location:** `packages/agent-core/src/session/llm.ts:60-72`

```
Problem: AgentPersonaConfig.systemPromptAdditions is defined but never used

Fix: After agent.prompt injection, add persona extensions:
  ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
  ...(input.agent.systemPromptAdditions ? [input.agent.systemPromptAdditions] : []),
  ...input.system,

Requires: Store systemPromptAdditions in Agent.Info
```

### 9. Implement Circuit Breaker Success Recording
**Impact:** Flaky providers not properly penalized
**Location:** `packages/agent-core/src/provider/fallback.ts:282-302`

```
Problem: Circuit breaker records failures but NOT successes (except half_open)
         A 50% failure rate provider won't be penalized properly

Fix: Record success on stream completion:
  - Track successful stream completions
  - Update success_counter in closed state too
  - Use success/failure ratio for health scoring
```

---

## MEDIUM (Maintainability / Developer Experience)

### 10. Extract Hardcoded Temperature Defaults to Config
**Impact:** Adding new models requires code changes in 3+ places
**Location:** `packages/agent-core/src/provider/transform.ts:236-262`

```
Problem: Magic numbers scattered in code:
  if (id.includes("qwen")) return 0.55
  if (id.includes("gemini")) return 1.0
  if (id.includes("glm-4.6")) return 1.0

Fix:
  1. Create MODEL_TEMPERATURE_DEFAULTS in config or constants
  2. Move all model-specific defaults there
  3. Add JSDoc explaining why specific values
  4. Make configurable via agent-core.jsonc
```

### 11. Consolidate Duplicated Merge Logic
**Impact:** Inconsistent parameter merging
**Locations:**
  - `provider.ts:99-104`
  - `llm.ts:99-127`

```
Problem: Identical merge pattern in 2+ places:
  pipe(base, mergeDeep(model.options), mergeDeep(agentOptions), mergeDeep(variant))

Fix: Create shared function:
  export function mergeModelOptions(base, model, agent, variant, overrides?) {
    return pipe(base, mergeDeep(model), mergeDeep(agent), mergeDeep(variant), mergeDeep(overrides))
  }
```

### 12. Add Max Retry Limit
**Impact:** Could retry indefinitely on persistent errors
**Location:** `packages/agent-core/src/session/retry.ts`

```
Problem: No max retry count - relies on caller to stop

Fix:
  1. Add MAX_RETRY_ATTEMPTS constant (default: 5)
  2. Check attempt count in retryable()
  3. Return false after max attempts
  4. Make configurable via agent-core.jsonc
```

### 13. Persist Retry State
**Impact:** Retry progress lost on crash/restart
**Location:** `packages/agent-core/src/session/processor.ts:351-355`

```
Problem: Retry state only in SessionStatus (in-memory)

Fix:
  1. Store retry state in session message metadata
  2. Restore on session reload
  3. Show retry history in UI
```

### 14. Load Persona Knowledge Files
**Impact:** Persona knowledge not available to model
**Location:** `src/config/types.ts:137` (defined), nowhere (consumed)

```
Problem: AgentPersonaConfig.knowledge array never loaded

Fix:
  1. Read knowledge file paths from persona config
  2. Load file contents on agent initialization
  3. Inject into system prompt or make available as context
  4. Support glob patterns for knowledge directories
```

### 15. Auto-Configure Persona MCP Servers
**Impact:** Persona tooling not available
**Location:** `src/config/types.ts:140` (defined), nowhere (consumed)

```
Problem: AgentPersonaConfig.mcpServers array never processed

Fix:
  1. Read mcpServers from persona config
  2. Auto-start listed servers when persona selected
  3. Integrate with existing MCP connection logic
```

### 16. Improve Error Messages
**Impact:** Hard to debug provider/model issues
**Locations:**
  - `provider.ts:1389` → "no providers found"
  - `provider.ts:1391` → "no models found"

```
Problem: Generic errors with no context

Fix: Include diagnostic info:
  throw new Error(`No providers found. Checked: ${checked.join(', ')}. ` +
    `Auth available: ${authed.join(', ')}. Disabled: ${disabled.join(', ')}`)
```

---

## LOW (Refactoring / Code Quality)

### 17. Decouple Claude Model Pruning Logic
**Impact:** Hard to maintain, no tests
**Location:** `packages/agent-core/src/provider/provider.ts:1083-1154`

```
Problem: 72 lines of Claude-specific regex in main provider.ts

Fix:
  1. Extract to claude-version-filter.ts
  2. Add unit tests for edge cases
  3. Document the pruning rules
```

### 18. Create Provider Namespace Abstraction
**Impact:** Adding providers requires changes in multiple places
**Location:** `packages/agent-core/src/provider/transform.ts:518-552`

```
Problem: 10+ provider wrapping rules hardcoded in switch statement

Fix:
  1. Create PROVIDER_NAMESPACE_MAP constant
  2. Validate at model load time
  3. Make extensible via config
```

### 19. Add Reactive Config Reloading
**Impact:** Config changes require process restart
**Location:** `packages/agent-core/src/provider/provider.ts:606`

```
Problem: Provider state computed once, never refreshed

Fix:
  1. Watch config file for changes
  2. Invalidate provider state on change
  3. Re-authenticate if auth changes
  4. Emit event for UI to refresh
```

### 20. Fix SDK Cache Serialization Order
**Impact:** Potential cache misses for equivalent options
**Location:** `packages/agent-core/src/provider/provider.ts:1200-1202`

```
Problem: JSON.stringify order matters for hash
  {a:1, b:2} vs {b:2, a:1} = different hashes

Fix:
  1. Sort object keys before stringify
  2. Or use stable-stringify library
  3. Add cache stats logging
```

### 21. Remove Provider-Specific Special Cases
**Impact:** Hard to add similar providers
**Locations:**
  - `provider.ts:635-647` (github-copilot-enterprise)
  - `provider.ts:1048-1056` (github-copilot npm override)

```
Problem: GitHub Copilot gets special treatment in 3+ places

Fix:
  1. Create provider variant abstraction
  2. Move special cases to provider config
  3. Document the variant pattern
```

### 22. Add Type Documentation for Parameter Precedence
**Impact:** Unclear how params merge
**Location:** `src/agent/types.ts:60-64`

```
Problem: No JSDoc for temperature/topP precedence

Fix: Add documentation:
  /**
   * @param temperature - Model temperature (0-2)
   * Precedence: session override > agent config > persona default > model default
   */
```

---

## TUI ENHANCEMENTS

### 23. Implement TUI Parameter Settings Dialog
**Impact:** Users cannot adjust params without editing config
**Design:** See `docs/TUI-PARAMETER-SETTINGS-DESIGN.md`

```
Tasks:
  1. Create DialogParameters component
  2. Add LocalProvider.parameters store
  3. Register command in app.tsx
  4. Add keybinding (Ctrl+Shift+P)
  5. Add sidebar display
  6. Wire through to LLM.stream()
```

### 24. Add Parameter Indicator to Footer
**Impact:** No visibility of active overrides

```
Show: temp:0.7 top_p:0.95 thinking:medium
When: Non-default params are active
```

### 25. Add /params Slash Command
**Impact:** No quick way to adjust params

```
Usage: /params temperature=0.8 thinking=high
```

---

## OBSERVABILITY

### 26. Add Tool Execution Timing
**Location:** `packages/agent-core/src/session/prompt.ts:695-715`

```
Track:
  - Time per tool call
  - Time in before/after hooks
  - Total tool execution time
```

### 27. Add Token Count Breakdown
**Location:** `packages/agent-core/src/session/compaction.ts`

```
Track:
  - Input tokens per message type
  - Cache hit/miss rates
  - Compaction triggers and savings
```

### 28. Add Plugin Hook Timing
**Location:** `packages/agent-core/src/session/llm.ts:76`

```
Track:
  - Time per plugin hook
  - Plugin failures (currently silent)
```

---

## Priority Matrix

| Priority | Count | Effort | Impact |
|----------|-------|--------|--------|
| CRITICAL | 4 | High | Blocking |
| HIGH | 5 | Medium | Significant |
| MEDIUM | 7 | Medium | Moderate |
| LOW | 6 | Low | Minor |
| TUI | 3 | Medium | UX |
| OBSERVABILITY | 3 | Low | Debug |

**Recommended order:**
1. #1 Bootstrap personas (unlocks persona configs)
2. #2 Fix zero retries (prevents failures)
3. #5 Add parameter logging (enables debugging)
4. #3 Validate thinking/tokens conflict
5. #4 Standardize budgets
6. #6 Add missing params
7. #7-8 Complete persona integration
8. #23 TUI parameter settings

---

## Implementation Status (2026-01-11)

| Task | Status | Notes |
|------|--------|-------|
| #1 Bootstrap personas | ✅ DONE | Personas from `src/agent/personas.ts` now loaded into agent registry |
| #2 Fix zero retries | ✅ DONE | Default changed from 0 to 3 in `llm.ts` |
| #3 Validate thinking/tokens | ✅ DONE | `maxOutputTokens()` returns undefined when reasoningEffort is set |
| #4 Standardize budgets | ✅ DONE | Created `provider/constants.ts` with `THINKING_BUDGETS` |
| #5 Add parameter logging | ✅ DONE | Enhanced logging in `llm.ts` for all params |
| #6 Add missing params | ✅ DONE | Added frequencyPenalty, presencePenalty, seed, minP to schemas |
| #7 Define topP in personas | ✅ DONE | Added topP to all persona configs and .md files |
| #8 Inject systemPromptAdditions | ✅ DONE | Now injected after agent prompt in system array |
| #23 TUI parameter settings | ✅ PARTIAL | Parameter store and footer indicator added; full dialog TBD |

### Files Modified

- `packages/agent-core/src/agent/agent.ts` - Schema + bootstrap
- `packages/agent-core/src/config/config.ts` - Schema extension
- `packages/agent-core/src/session/llm.ts` - Params, logging, injection
- `packages/agent-core/src/provider/transform.ts` - Validation, constants
- `packages/agent-core/src/provider/provider.ts` - Constants import
- `packages/agent-core/src/provider/constants.ts` - NEW: thinking budgets
- `packages/agent-core/src/cli/cmd/tui/context/local.tsx` - Parameters store
- `packages/agent-core/src/cli/cmd/tui/routes/session/footer.tsx` - Params indicator
- `src/agent/personas.ts` - Added topP to all configs
- `.agent-core/agent/zee.md` - Already had top_p
- `.agent-core/agent/stanley.md` - Added top_p=0.9
- `.agent-core/agent/johny.md` - Added top_p=0.92

---

## Testing Notes

After fixes, verify:
- [x] Zee uses temperature=0.7 (not model default)
- [x] Stanley uses temperature=0.3
- [x] Johny uses temperature=0.5
- [x] systemPromptAdditions reaches model
- [x] Retries work on transient failures
- [x] Parameter changes logged
- [x] TUI shows active params (when overrides exist)
