# TUI Parameter Settings Design

## Overview

Add user-adjustable LLM parameters (temperature, top_p, thinking effort, max tokens) to the TUI, persisted per-session.

## Current State

Parameters flow from multiple sources with this precedence:
```
Model defaults → Agent defaults → Session overrides (NEW)
```

Currently missing session-level overrides - this design adds them.

---

## UI Design

### Option A: Sidebar Panel (Recommended)

Add a collapsible "Parameters" section to the sidebar after "Context":

```
┌─────────────────────────────────────┐
│ Parameters            [Ctrl+P] Edit │
├─────────────────────────────────────┤
│ Temperature:     0.7  ●○○○○ Creative│
│ Top P:           0.95               │
│ Thinking:        Medium             │
│ Max Output:      4096               │
└─────────────────────────────────────┘
```

### Option B: Footer Indicator

Show current parameters in footer with edit shortcut:

```
[RELEASE] │ claude-sonnet-4.5 │ temp:0.7 top_p:0.95 │ Ctrl+P
```

### Option C: Dialog Only

Command palette access (`Ctrl+P` or `/params`):

```
┌─────────── Adjust Parameters ───────────┐
│                                         │
│ Temperature                             │
│ [========●=====] 0.7                    │
│ Creative ←───────────────→ Precise      │
│                                         │
│ Top P                                   │
│ [============●=] 0.95                   │
│ Diverse ←────────────────→ Focused      │
│                                         │
│ Thinking Effort                         │
│ ○ Low (8K tokens)                       │
│ ● Medium (16K tokens)                   │
│ ○ High (32K tokens)                     │
│ ○ Max (64K tokens)                      │
│                                         │
│ Max Output Tokens                       │
│ [4096        ] (model max: 262144)      │
│                                         │
│ [Reset to Defaults]  [Apply]  [Cancel]  │
└─────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Data Layer

**File: `packages/agent-core/src/cli/cmd/tui/context/local.tsx`**

Add parameter store:

```typescript
// After line 150
const parameters = iife(() => {
  const [store, setStore] = createStore<{
    sessionParams: Record<string, SessionParams>
  }>({ sessionParams: {} })

  interface SessionParams {
    temperature?: number
    topP?: number
    topK?: number
    thinkingEffort?: 'low' | 'medium' | 'high' | 'max'
    maxOutputTokens?: number
  }

  return {
    get: (sessionID: string): SessionParams => store.sessionParams[sessionID] ?? {},
    set: (sessionID: string, params: Partial<SessionParams>) => {
      setStore("sessionParams", sessionID, prev => ({ ...prev, ...params }))
    },
    reset: (sessionID: string) => {
      setStore("sessionParams", sessionID, {})
    },
  }
})
```

### Phase 2: Dialog Component

**New file: `packages/agent-core/src/cli/cmd/tui/component/dialog-parameters.tsx`**

```typescript
export function DialogParameters() {
  const dialog = useDialog()
  const local = useLocal()
  const sync = useSync()

  const sessionID = sync.session.current()?.id
  const currentParams = local.parameters.get(sessionID)
  const model = local.model.current()

  const [temp, setTemp] = createSignal(currentParams.temperature)
  const [topP, setTopP] = createSignal(currentParams.topP)
  const [thinking, setThinking] = createSignal(currentParams.thinkingEffort ?? 'medium')
  const [maxTokens, setMaxTokens] = createSignal(currentParams.maxOutputTokens)

  const apply = () => {
    local.parameters.set(sessionID, {
      temperature: temp(),
      topP: topP(),
      thinkingEffort: thinking(),
      maxOutputTokens: maxTokens(),
    })
    dialog.clear()
  }

  return (
    <box flexDirection="column" padding={1}>
      <text bold>Adjust Parameters</text>

      {/* Temperature slider */}
      <box>
        <text>Temperature: {temp()?.toFixed(2) ?? 'default'}</text>
        <Slider value={temp()} onChange={setTemp} min={0} max={2} step={0.05} />
      </box>

      {/* Top P slider */}
      <box>
        <text>Top P: {topP()?.toFixed(2) ?? 'default'}</text>
        <Slider value={topP()} onChange={setTopP} min={0} max={1} step={0.01} />
      </box>

      {/* Thinking effort (only for thinking models) */}
      <Show when={model?.capabilities.reasoning}>
        <box>
          <text>Thinking Effort:</text>
          <Select
            options={['low', 'medium', 'high', 'max']}
            value={thinking()}
            onChange={setThinking}
          />
        </box>
      </Show>

      {/* Max tokens */}
      <box>
        <text>Max Output: {maxTokens() ?? 'default'}</text>
        <input value={maxTokens()} onChange={setMaxTokens} />
      </box>

      <box flexDirection="row" gap={2}>
        <button onClick={() => local.parameters.reset(sessionID)}>Reset</button>
        <button onClick={apply}>Apply</button>
        <button onClick={() => dialog.clear()}>Cancel</button>
      </box>
    </box>
  )
}
```

### Phase 3: Command Registration

**File: `packages/agent-core/src/cli/cmd/tui/app.tsx`**

Add to commands array (around line 357):

```typescript
{
  title: "Adjust parameters",
  value: "parameters.edit",
  keybind: "parameters_edit",
  category: "Agent",
  onSelect: () => {
    dialog.replace(() => <DialogParameters />)
  },
},
```

### Phase 4: Keybinding

**File: `packages/agent-core/src/cli/cmd/tui/context/keybind.tsx`**

Add default keybinding:

```typescript
parameters_edit: "ctrl+shift+p",
```

### Phase 5: LLM Integration

**File: `packages/agent-core/src/session/llm.ts`**

Modify StreamInput type (line 31):

```typescript
export type StreamInput = {
  // ... existing fields ...
  parameterOverrides?: {
    temperature?: number
    topP?: number
    topK?: number
    thinkingEffort?: string
    maxOutputTokens?: number
  }
}
```

Merge overrides (around line 100):

```typescript
const options: Record<string, any> = pipe(
  base,
  mergeDeep(input.model.options),
  mergeDeep(agentProviderOptions),
  mergeDeep(variant),
  mergeDeep(input.parameterOverrides ?? {}),  // Session overrides
)
```

### Phase 6: Sidebar Display

**File: `packages/agent-core/src/cli/cmd/tui/routes/session/sidebar.tsx`**

Add after Context section:

```typescript
<Show when={local.parameters.get(sessionID)}>
  <box flexDirection="column">
    <text bold>Parameters</text>
    <text dimColor>
      temp: {params.temperature ?? 'default'} |
      top_p: {params.topP ?? 'default'}
    </text>
    <Show when={params.thinkingEffort}>
      <text dimColor>thinking: {params.thinkingEffort}</text>
    </Show>
  </box>
</Show>
```

---

## Thinking Effort Mapping

| UI Label | Budget Tokens | Use Case |
|----------|---------------|----------|
| Low | 8,192 | Quick responses |
| Medium | 16,000 | Balanced (default) |
| High | 32,000 | Complex reasoning |
| Max | 64,000 | Deep analysis |

---

## Persistence

Parameters stored in `~/.local/state/agent-core/kv.json`:

```json
{
  "params_session-abc123": {
    "temperature": 0.7,
    "topP": 0.95,
    "thinkingEffort": "medium",
    "maxOutputTokens": 4096
  }
}
```

---

## Model Capability Gates

Only show controls when model supports them:

| Parameter | Gate |
|-----------|------|
| Temperature | `model.capabilities.temperature === true` |
| Top P | Always (fallback to default) |
| Thinking Effort | `model.capabilities.reasoning === true` |
| Max Output | Always (capped by `model.limit.output`) |

---

## Files to Modify

| File | Changes |
|------|---------|
| `context/local.tsx` | Add parameters store |
| `component/dialog-parameters.tsx` | New dialog component |
| `app.tsx` | Register command |
| `context/keybind.tsx` | Add keybinding |
| `routes/session/sidebar.tsx` | Display current params |
| `routes/session/footer.tsx` | Optional indicator |
| `session/llm.ts` | Accept & merge overrides |

---

## Future Enhancements

1. **Presets** - Save named parameter combinations ("Creative", "Precise", "Code")
2. **Per-Agent Defaults** - Override at agent level, not just session
3. **Slash Command** - `/params temperature=0.8 thinking=high`
4. **Visual Feedback** - Show when non-default params are active
5. **Parameter History** - Track what worked well for specific tasks
