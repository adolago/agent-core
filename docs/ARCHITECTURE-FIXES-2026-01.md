# Architecture Fixes - January 2026

This document summarizes the architectural improvements made to agent-core to address 5 major integration issues in the web→agent-core→tiara→personas→user chain.

## Summary

| Issue | Status | Files Changed |
|-------|--------|---------------|
| Gateway ↔ Surface disconnect | Fixed | New adapter file, types |
| Permission event TODO | Fixed | src/agent/permission.ts |
| Memory persistence TODO | Fixed | src/plugin/builtin/memory-persistence.ts |
| Cross-boundary imports | Fixed | tsconfig.json (root + packages) |
| Tiara underutilization | Fixed | src/personas/tiara.ts, types.ts |

---

## Issue 1: Gateway ↔ Surface Disconnect

**Problem**: Telegram and WhatsApp gateways bypassed the Surface abstraction, directly calling the HTTP API instead of using `MessagingPlatformHandler`.

**Solution**: Created platform adapters that bridge gateways to the Surface abstraction.

**New File**: `packages/agent-core/src/gateway/platform-adapters.ts`

```typescript
// Adapts TelegramGateway.Gateway to MessagingPlatformHandler
export class TelegramPlatformAdapter implements MessagingPlatformHandler { ... }

// Adapts WhatsAppGateway.Gateway to MessagingPlatformHandler
export class WhatsAppPlatformAdapter implements MessagingPlatformHandler { ... }

// Factory functions
export function createTelegramAdapter(gateway): TelegramPlatformAdapter
export function createWhatsAppAdapter(gateway): WhatsAppPlatformAdapter
```

**Usage**:
```typescript
const gateway = new TelegramGateway.Gateway(config);
const adapter = createTelegramAdapter(gateway);
const surface = createMessagingSurface(adapter, surfaceConfig);

// Messages now flow through Surface events
surface.onEvent((event) => {
  if (event.type === 'message') { /* handle via unified Surface API */ }
});
```

---

## Issue 2: Permission Event TODO

**Problem**: At `src/agent/permission.ts:434`, permission requests weren't being emitted to the Bus, preventing UI integration.

**Solution**: Added Bus event emission for permission requests and responses.

**Changes**: `src/agent/permission.ts`

```typescript
// New event definitions
export namespace PermissionEvents {
  export const Requested = BusEvent.define("permission.manager.requested", ...)
  export const Responded = BusEvent.define("permission.manager.responded", ...)
}

// In requestPermission() method (was TODO)
Bus.publish(PermissionEvents.Requested, {
  id, sessionID, type, pattern, title, metadata, createdAt
});

// In respond() method
Bus.publish(PermissionEvents.Responded, {
  sessionID, permissionID, response
});
```

---

## Issue 3: Memory Persistence TODO

**Problem**: At `src/plugin/builtin/memory-persistence.ts:85`, Redis and Qdrant backends were stubbed with TODO.

**Solution**: Implemented full Redis and Qdrant loading/saving.

**Changes**: `src/plugin/builtin/memory-persistence.ts`

```typescript
// loadFromStorage() now handles:
// - Qdrant backend: Uses QdrantVectorStorage, scrolls points
// - Redis backend: Uses redis client, KEYS + GET pattern
// - File backend: Existing JSON file handling

// saveToStorage() now handles:
// - Qdrant backend: Creates collection, inserts with placeholder vectors
// - Redis backend: SET with optional TTL
// - File backend: Existing JSON file handling
```

---

## Issue 4: Cross-Boundary Imports

**Problem**: 40+ imports with 4-6 levels of `../`, making code fragile and hard to maintain.

**Solution**: Added path aliases to both tsconfig.json files.

**Root tsconfig.json**:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@agent-core/*": ["./packages/agent-core/src/*"],
      "@log": ["./packages/agent-core/src/util/log"],
      "@session/*": ["./packages/agent-core/src/session/*"],
      "@hooks/*": ["./packages/agent-core/src/hooks/*"],
      "@provider/*": ["./packages/agent-core/src/provider/*"],
      "@bus/*": ["./packages/agent-core/src/bus/*"]
    }
  }
}
```

**packages/agent-core/tsconfig.json**:
```json
{
  "paths": {
    "@/*": ["./src/*"],
    "@tui/*": ["./src/cli/cmd/tui/*"],
    "@root/*": ["../../src/*"],
    "@personas/*": ["../../src/personas/*"]
  }
}
```

---

## Issue 5: Tiara Underutilization

**Problem**: Only 15-20% of Tiara's capabilities were used. Topology was hardcoded to "star".

**Solution**: Added dynamic topology selection based on task type and persona.

**Changes**:

1. **Enhanced config** (`src/personas/types.ts`):
```typescript
tiara: {
  enabled: true,
  topology: "auto", // Now supports: mesh, hierarchical, star, adaptive, auto
  sparcEnabled: false,
  neuralTrainingEnabled: false,
}
```

2. **Dynamic topology selection** (`src/personas/tiara.ts`):
```typescript
function selectTopology(
  persona: PersonaId,
  taskDescription: string,
  configuredTopology: string
): TopologyType {
  // Auto-selects based on:
  // - Johny: mesh for research, hierarchical for curriculum
  // - Stanley: hierarchical for analysis, mesh for backtests
  // - Zee: hierarchical for coordination, mesh for search
  // - Task keywords: plan→hierarchical, parallel→mesh, complex→adaptive
}
```

3. **Worker metadata** (`src/personas/types.ts`):
```typescript
Worker = z.object({
  // ... existing fields ...
  metadata: z.record(z.string(), z.unknown()).optional(),
});
```

**Topology Selection Rules**:
| Topology | Use Case |
|----------|----------|
| star | Simple tasks, single coordinator (default) |
| mesh | Parallel research, backtests, multiple independent workers |
| hierarchical | Multi-step planning, portfolio analysis, curriculum design |
| adaptive | Complex unknown tasks that may need adjustment |

---

## Files Changed

```
src/agent/permission.ts              - Permission event emission
src/plugin/builtin/memory-persistence.ts - Redis/Qdrant backends
src/personas/tiara.ts                - Dynamic topology selection
src/personas/types.ts                - Worker metadata, topology options
tsconfig.json                        - Root path aliases
packages/agent-core/tsconfig.json    - Package path aliases
packages/agent-core/src/gateway/platform-adapters.ts - NEW: Gateway adapters
```

---

## Migration Notes

### For Gateway Users
If you want messages to flow through the Surface abstraction:

```typescript
// Before: Gateway calls HTTP API directly
const gateway = new TelegramGateway.Gateway(config);
await gateway.start();

// After: Use adapter + Surface
const gateway = new TelegramGateway.Gateway(config);
const adapter = createTelegramAdapter(gateway);
const surface = createMessagingSurface(adapter, surfaceConfig);
await surface.connect();
```

### For Permission UI Subscribers
```typescript
import { Bus } from "@bus";
import { PermissionEvents } from "@/agent/permission";

// Subscribe to permission requests
Bus.subscribe(PermissionEvents.Requested, (event) => {
  // Show permission UI
});
```

### For Memory Plugin Users
```typescript
// Now supports backend config:
memory: {
  backend: "qdrant",  // or "redis" or "file"
  qdrantUrl: "http://localhost:6333",
  redisUrl: "redis://localhost:6379",
  namespace: "my-session",
}
```

---

## Phase 2: Tiara Enhancements

After the initial fixes, four major enhancements were implemented to fully leverage Tiara's capabilities.

### Enhancement 1: SPARC Workflow Engine

**Purpose**: Structured 5-phase methodology for complex task execution.

**Changes**: `src/personas/tiara.ts`

```typescript
// SPARC Phases: Specification → Pseudocode → Architecture → Refinement → Completion
type SPARCPhase = "specification" | "pseudocode" | "architecture" | "refinement" | "completion";

// Execute a task using SPARC methodology
async executeWithSPARC(options: SPARCWorkflowOptions): Promise<SPARCWorkflowResult> {
  // Each phase spawns a drone with phase-specific prompts
  // Outputs chain: each phase receives the previous phase's output
}

// Smart task execution - auto-selects SPARC for complex tasks
async executeTask(options): Promise<DroneResult | SPARCWorkflowResult> {
  const useSPARC = shouldUseSPARC(task, config);
  // Complex tasks like "implement", "design", "architect" → SPARC
  // Simple tasks → direct spawn
}
```

**Usage**:
```typescript
const orchestrator = await getOrchestrator({ tiara: { sparcEnabled: true } });

// Explicit SPARC workflow
const result = await orchestrator.executeWithSPARC({
  persona: "johny",
  task: "Design a learning curriculum for TypeScript",
  prompt: "Create a comprehensive curriculum...",
  skipPhases: [], // Optional: skip phases for simpler tasks
  phaseTimeoutMs: 120000, // 2 min per phase
});

// Auto-selection
const result = await orchestrator.executeTask({
  persona: "stanley",
  task: "Implement a portfolio rebalancing algorithm",
  prompt: "...",
  forceSPARC: false, // Let the system decide
});
```

---

### Enhancement 2: Neural Pattern Training

**Purpose**: Learn from successful task executions to optimize topology selection.

**Changes**: `src/personas/tiara.ts`

```typescript
// Tracks successful patterns
interface TaskPattern {
  keywords: string[];        // Task fingerprint
  persona: PersonaId;
  topology: TopologyType;
  avgDurationMs: number;
  successRate: number;       // 0-1
  sampleCount: number;
}

class NeuralPatternTrainer {
  recordExecution(task, persona, topology, durationMs, success): void
  suggestTopology(task, persona): TopologyType | null
  getStats(): { totalPatterns, avgSamples, avgSuccessRate }
}
```

**How it works**:
1. After each task completion, patterns are recorded
2. Similar tasks (keyword similarity > 0.5) update existing patterns
3. Topology selection first checks neural suggestions before rule-based heuristics
4. Patterns with >3 samples and >70% success rate are used for suggestions

**Usage**:
```typescript
const orchestrator = await getOrchestrator({
  tiara: { neuralTrainingEnabled: true }
});

// After many tasks, check learning stats
const stats = orchestrator.getNeuralStats();
// { totalPatterns: 42, avgSamples: 5.2, avgSuccessRate: 0.85 }
```

---

### Enhancement 3: Expanded Agent Type Mappings (90+ agents)

**Purpose**: Comprehensive routing of 90+ agent types to the three personas.

**Changes**: `src/tiara.ts`

```typescript
// Zee - Personal Assistant (35 agent types)
const ZEE_AGENT_TYPES = new Set([
  "inbox_manager", "scheduler", "task_coordinator",
  "email_assistant", "calendar_manager", "contact_manager",
  "travel_planner", "shopping_assistant", "habit_tracker",
  "music_curator", "news_aggregator", "personal_assistant",
  // ... 23 more
]);

// Johny - Learning & Research (28 agent types)
const JOHNY_AGENT_TYPES = new Set([
  "research_assistant", "knowledge_synthesizer", "fact_checker",
  "curriculum_designer", "study_planner", "quiz_maker",
  "code_tutor", "math_helper", "essay_writer",
  // ... 19 more
]);

// Stanley - Finance & Investing (32 agent types)
const STANLEY_AGENT_TYPES = new Set([
  "market_analyst", "portfolio_manager", "fundamental_analyst",
  "technical_analyst", "stock_screener", "risk_assessor",
  "crypto_analyst", "backtest_runner", "tax_optimizer",
  // ... 23 more
]);

// Helper functions
export function getSupportedAgentTypes(): { zee, johny, stanley }
export function getAgentPersonaWithConfidence(agentType): { persona, confidence }
```

**Fallback heuristics**:
- Keywords "market", "invest", "trade" → Stanley
- Keywords "learn", "study", "research" → Johny
- Unknown → Zee (default general assistant)

---

### Enhancement 4: Tiara Hooks System

**Purpose**: Allow external code to hook into orchestrator lifecycle events.

**Changes**: `src/personas/tiara.ts`

```typescript
// Hook types
export type TiaraHookType =
  | "beforeSpawn" | "afterSpawn"
  | "beforeTask" | "afterTask"
  | "beforeSPARC" | "afterSPARC"
  | "onError"
  | "onTopologySelected"
  | "onWorkerComplete"
  | "onPatternLearned";

// Hook context
export interface TiaraHookContext {
  type: TiaraHookType;
  timestamp: number;
  persona?: PersonaId;
  workerId?: WorkerId;
  task?: string;
  topology?: TopologyType;
  sparcPhase?: SPARCPhase;
  success?: boolean;
  error?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

// Register hooks (returns unsubscribe function)
export function registerTiaraHook(
  type: TiaraHookType,
  handler: TiaraHookHandler,
  priority?: number
): () => void;
```

**Usage**:
```typescript
import { registerTiaraHook } from "@/personas/tiara";

// Log all spawns
const unsubscribe = registerTiaraHook("afterSpawn", (ctx) => {
  console.log(`Spawned ${ctx.persona} drone for: ${ctx.task}`);
});

// Cancel expensive operations
registerTiaraHook("beforeSPARC", (ctx) => {
  if (ctx.task?.includes("heavy")) {
    console.log("Cancelling heavy SPARC workflow");
    return false; // Cancel
  }
});

// Track metrics
registerTiaraHook("onWorkerComplete", async (ctx) => {
  await metrics.record({
    persona: ctx.persona,
    duration: ctx.durationMs,
    success: ctx.success,
  });
});
```

---

## Phase 2 Files Changed

```
src/personas/tiara.ts       - SPARC workflow, neural training, hooks
src/tiara.ts                - Expanded agent type mappings (90+ types)
src/surface/messaging.ts    - Fixed override modifiers
```

---

## Summary

| Enhancement | Status | Description |
|-------------|--------|-------------|
| SPARC Workflow | Implemented | 5-phase structured task execution |
| Neural Training | Implemented | Learn from successful executions |
| Agent Mappings | Implemented | 90+ agent types → personas |
| Hooks System | Implemented | Lifecycle event hooks |
| Typecheck Fixes | Fixed | Override modifiers in messaging.ts |
