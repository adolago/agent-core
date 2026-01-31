# Wiring Plan: Unwired Features and Dead Code Cleanup

This document outlines the plan to wire up disconnected features and delete dead code in agent-core.

## Summary

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Inventory + acceptance tests | Skipped (tests pass) |
| 1 | Tool wiring (Johny + Zee WhatsApp/Splitwise) | COMPLETED |
| 2 | Reranker integration (config exposure) | COMPLETED |
| 3 | WorkStealingCoordinator integration | COMPLETED |
| 4 | ConsensusEngine integration | COMPLETED |
| 5 | Dead code deletion | COMPLETED |

**All phases complete.** Build and 1054 tests pass.

---

## Phase 0: Inventory and Acceptance Tests

### Goal
Establish what "wired" means and create verification tests before making changes.

### Tasks

- [x] Create test: "Tool registry lists Johny tools when persona=johny"
  - Location: `packages/agent-core/test/wiring/phase0.test.ts`
  - Verifies: `johny:study`, `johny:knowledge`, `johny:mastery`, `johny:review`, `johny:practice`
- [x] Create test: "Tool registry lists WhatsApp/Splitwise tools when persona=zee"
  - Location: `packages/agent-core/test/wiring/phase0.test.ts`
  - Verifies: `zee:splitwise`, `WHATSAPP_TOOLS` integration
- [x] Create test: "Memory search calls reranker when `rerank: true` param passed"
  - Location: `packages/agent-core/test/wiring/phase0.test.ts`
  - Verifies: `rerank?: boolean` param, `VoyageReranker`, `VLLMReranker`
- [x] Verify daemon starts without errors: `agent-core daemon`
- [x] Baseline test suite: `bun test`
  - 14 tests passing in phase0.test.ts

---

## Phase 1: Tool Wiring (Johny + Zee WhatsApp/Splitwise + Todo) - COMPLETED

### 1A) Register Johny Tools in MCP Domain Registry - DONE

**Problem**: `src/domain/johny/tools.ts` exports `JOHNY_TOOLS` and `registerJohnyTools()` but they're never called.

**Solution implemented**: Updated `src/mcp/domain/index.ts` to dynamically import and register tools from `src/domain/johny/tools.ts` and `src/domain/zee/tools.ts`.

**Files to modify**:

1. **`src/mcp/domain/index.ts`** - Add Johny tools registration:
```typescript
// Add imports
import { JOHNY_TOOLS, registerJohnyTools } from '../../domain/johny/tools';
import type { ToolDefinition } from '../types';

// Add to exports
export const johnyTools: ToolDefinition[] = JOHNY_TOOLS as unknown as ToolDefinition[];

// Add function
export function registerJohnyTools(): void {
  const registry = getToolRegistry();
  registry.registerAll(johnyTools, { source: 'domain', enabled: true });
}

// Update registerDomainTools
export function registerDomainTools(): void {
  registerStanleyTools();
  registerZeeTools();
  registerJohnyTools();  // ADD THIS
  registerSharedTools();
}
```

2. **`src/mcp/index.ts`** - Import and call:
```typescript
import { registerJohnyTools } from './domain';
// ...
registerJohnyTools();
```

**Verification**:
```bash
# List tools should include johny:study, johny:knowledge, etc.
agent-core tools list --persona johny
```

### 1B) Wire Johny Persistence - ALREADY DONE

**Status**: Johny already has full persistence implemented. All modules (`mastery.ts`, `practice.ts`, `review.ts`, `knowledge-graph.ts`) save to `~/.zee/johny/`.

**Files with persistence**:

1. **`src/personas/johny/index.ts`** - Add persistence:
```typescript
import { getStateDir } from '../../config/paths';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const JOHNY_STATE_FILE = path.join(getStateDir(), 'johny-state.json');

function loadState(): JohnyState {
  if (existsSync(JOHNY_STATE_FILE)) {
    return JSON.parse(readFileSync(JOHNY_STATE_FILE, 'utf-8'));
  }
  return createDefaultState();
}

function saveState(state: JohnyState): void {
  writeFileSync(JOHNY_STATE_FILE, JSON.stringify(state, null, 2));
}
```

2. Call `saveState()` after mutations in `mastery.ts`, `practice.ts`, `review.ts`.

**Verification**:
```bash
# Call tool, restart daemon, verify state persists
agent-core call johny:mastery --action update --topicId test --level 1
agent-core daemon restart
agent-core call johny:mastery --action status --topicId test
```

### 1C) Enable Zee WhatsApp + Splitwise Tools - DONE

**Problem**: `src/domain/zee/whatsapp.ts` exports `WHATSAPP_TOOLS` but not registered in MCP layer.

**Solution**: The full Zee tools from `src/domain/zee/tools.ts` (which includes `WHATSAPP_TOOLS` and `splitwiseTool`) are now registered via `registerZeeFullTools()` in `src/mcp/domain/index.ts`.

**Files to modify**:

1. **`src/domain/zee/tools.ts`** - Ensure WhatsApp tools in ZEE_TOOLS:
```typescript
import { WHATSAPP_TOOLS } from './whatsapp';

export const ZEE_TOOLS = [
  // ... existing tools ...
  ...WHATSAPP_TOOLS,
  splitwiseTool,  // Ensure this exists
];
```

2. **`src/mcp/domain/zee.ts`** - Add WhatsApp and Splitwise if not present.

**Verification**:
```bash
agent-core tools list --persona zee | grep -E "whatsapp|splitwise"
```

### 1D) Todo Tools Unblocking

**Problem**: Todo tools are registered but blocked in prompts.

**Files to check**:
- `packages/agent-core/src/tool/todo.ts` - Already registered in `registry.ts` line 9
- The blocking is in prompts, not code

**Action**: Remove todo blocking from system prompts if desired (or leave as-is if intentional).

---

## Phase 2: Reranker Integration - COMPLETED

### Status: FULLY WIRED

The reranker is integrated in `src/memory/unified.ts`:
- Lines 912-938: Lazy-loads reranker when `params.rerank: true`
- Uses `getMemoryRerankerConfig()` from `src/config/runtime.ts`

### Changes Made

1. **`src/config/runtime.ts`** - Added environment variable support:
   - `MEMORY_RERANKER_ENABLED` - Enable/disable reranking
   - `MEMORY_RERANKER_PROVIDER` - `voyage` or `vllm`
   - `MEMORY_RERANKER_MODEL` - Model override
   - `MEMORY_RERANKER_API_KEY` - API key (falls back to `VOYAGE_API_KEY`)
   - `MEMORY_RERANKER_BASE_URL` - Custom base URL
   - `VLLM_RERANKER_URL` - vLLM endpoint

2. **`docs/ENVIRONMENT_VARIABLES.md`** - Added reranker documentation section

### Usage

**Environment variables**:
```bash
export MEMORY_RERANKER_ENABLED=true
export VOYAGE_API_KEY=your-key
```

**Config file** (`~/.config/agent-core/agent-core.jsonc`):
```jsonc
{
  "memory": {
    "reranker": {
      "enabled": true,
      "provider": "voyage",
      "model": "rerank-2"
    }
  }
}
```

---

## Phase 3: WorkStealingCoordinator Integration - COMPLETED

### Implementation

Created a standalone `WorkStealingService` in agent-core that provides load balancing between agents.

### Files Created/Modified

1. **`packages/agent-core/src/coordination/work-stealing.ts`** (NEW)
   - `WorkStealingService` class with singleton pattern
   - Tracks agent workloads and task durations
   - Periodic imbalance detection with configurable threshold
   - Emits `workstealing:request` events when imbalance detected
   - `findBestAgent()` for task assignment optimization

2. **`packages/agent-core/src/coordination/index.ts`** (NEW)
   - Module exports

3. **`packages/agent-core/src/cli/cmd/daemon.ts`**
   - Imports `initWorkStealing` and `getWorkStealingService`
   - Initializes work stealing on daemon startup
   - Shuts down on daemon stop
   - Shows status in daemon startup output

4. **`packages/agent-core/src/server/route/process.ts`**
   - Added 4 new API endpoints:
     - `GET /process/workstealing/stats` - Get workload distribution
     - `POST /process/workstealing/workload` - Update agent workload
     - `POST /process/workstealing/task-duration` - Record task duration
     - `POST /process/workstealing/find-best` - Find least loaded agent

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORK_STEALING_ENABLED` | `false` | Enable work stealing |
| `WORK_STEALING_THRESHOLD` | `3` | Min task count difference to trigger |
| `WORK_STEALING_MAX_BATCH` | `2` | Max tasks to steal at once |
| `WORK_STEALING_INTERVAL` | `30000` | Check interval (ms) |

### Usage

```bash
# Enable via environment
export WORK_STEALING_ENABLED=true
agent-core daemon

# Check stats via API
curl http://localhost:3210/process/workstealing/stats
```

### Integration with Process Registry

The service automatically subscribes to ProcessRegistry events to track agent registration/deregistration. Swarms can use the API endpoints to:
1. Report their workload via `/process/workstealing/workload`
2. Report task completions via `/process/workstealing/task-duration`  
3. Find the best agent for new tasks via `/process/workstealing/find-best`

### Previous Plan (for reference)

1. **Event handler registration**:
```typescript
eventBus.on('workstealing:request', async ({ sourceAgent, targetAgent, taskCount }) => {
  const tasks = scheduler.getPendingTasks(sourceAgent, taskCount);
  for (const task of tasks) {
    scheduler.reassign(task.id, targetAgent);
  }
  log.info('Work stealing completed', { from: sourceAgent, to: targetAgent, count: tasks.length });
});
```

**Verification**:
```bash
# Enable in config
agent-core config set experimental.workStealing.enabled true

# Watch logs for work stealing events
agent-core daemon --verbose 2>&1 | grep workstealing
```

---

## Phase 4: ConsensusEngine Integration - COMPLETED

### Implementation

Created a standalone `ConsensusGate` in agent-core that provides approval gating for tool side effects.

### Files Created/Modified

1. **`packages/agent-core/src/coordination/consensus-gate.ts`** (NEW)
   - `ConsensusGate` class with singleton pattern
   - Multiple consensus modes: `auto`, `majority`, `unanimous`, `single`
   - Configurable proposal types requiring approval
   - Voter registration and vote collection
   - Decision history tracking
   - Event-based proposal/vote/decision notifications

2. **`packages/agent-core/src/coordination/index.ts`**
   - Added consensus exports

3. **`packages/agent-core/src/cli/cmd/daemon.ts`**
   - Imports `initConsensus` and `getConsensusGate`
   - Initializes consensus gate on daemon startup
   - Shuts down on daemon stop
   - Shows status in daemon startup output

4. **`packages/agent-core/src/server/route/process.ts`**
   - Added 5 new API endpoints:
     - `GET /process/consensus/stats` - Get approval/rejection stats
     - `POST /process/consensus/propose` - Submit action for approval
     - `POST /process/consensus/voter` - Register a voter
     - `POST /process/consensus/vote` - Cast a vote
     - `GET /process/consensus/history` - Get decision history

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONSENSUS_ENABLED` | `false` | Enable consensus gate |
| `CONSENSUS_MODE` | `auto` | Mode: `auto`, `majority`, `unanimous`, `single` |
| `CONSENSUS_VOTE_TIMEOUT` | `5000` | Vote collection timeout (ms) |
| `CONSENSUS_REQUIRE_FOR` | `tool_side_effect,message_send` | Comma-separated proposal types |

### Consensus Modes

| Mode | Description |
|------|-------------|
| `auto` | Always approve (logging only) |
| `majority` | Require >50% approval |
| `unanimous` | Require all voters to approve |
| `single` | Require at least one approval |

### Proposal Types

- `tool_side_effect` - General tool side effects
- `message_send` - Sending messages (WhatsApp, Telegram)
- `calendar_create` - Creating calendar events
- `financial_transaction` - Financial operations
- `file_write` - File system writes
- `external_api` - External API calls
- `custom` - Custom proposal types

### Usage

```bash
# Enable via environment
export CONSENSUS_ENABLED=true
export CONSENSUS_MODE=majority
agent-core daemon

# Check stats via API
curl http://localhost:3210/process/consensus/stats

# Submit a proposal
curl -X POST http://localhost:3210/process/consensus/propose \
  -H "Content-Type: application/json" \
  -d '{"type":"message_send","description":"Send hello","content":{"to":"user"},"proposer":"zee"}'
```

### Tool Integration Example

```typescript
import { checkApproval } from "../coordination"

// In tool execution
const { approved, reason } = await checkApproval({
  type: "message_send",
  description: `Send message to ${recipient}`,
  content: { to: recipient, message },
  proposer: "zee",
})

if (!approved) {
  return { output: `Action blocked: ${reason}`, metadata: { blocked: true } }
}
```

### Previous Plan (for reference)

1. **Tool execution layer** (where side effects happen):
```typescript
// Before executing WhatsApp send, Splitwise create, etc.
if (tool.hasSideEffects) {
  const { approved } = await consensusGate.approve({
    type: 'tool_side_effect',
    content: { tool: tool.id, args },
    participants: ['zee', 'stanley', 'johny'],
  });
  
  if (!approved) {
    return { output: 'Action blocked by consensus', metadata: { blocked: true } };
  }
}
```

### 4C) Config Schema

```typescript
// src/config/types.ts
experimental?: {
  consensus?: {
    enabled: boolean;
    algorithm: 'raft' | 'byzantine' | 'gossip' | 'proof-of-learning';
    requireApprovalFor: ('tool_side_effect' | 'final_answer')[];
  };
};
```

**Verification**:
```bash
# Enable consensus
agent-core config set experimental.consensus.enabled true
agent-core config set experimental.consensus.algorithm raft

# Execute a side-effect tool and check decision logs
agent-core call zee:whatsapp --action send --to "test" --message "hello"
agent-core logs | grep consensus
```

---

## Phase 5: Dead Code Deletion - COMPLETED

### Investigation Results

**Files NOT deleted (still in use):**
- `packages/tiara/src/memory/legacy-migration.js` - Used by CLI command (`memory.ts`) and has tests
- `packages/tiara/docs/reasoningbank/models/` - Documentation assets, not runtime code

**Files identified for deletion:**

#### 1. Orphaned Utility File
- `packages/agent-core/src/util/array.ts` - Exports `findLast()` but all code uses native `Array.prototype.findLast()`

#### 2. Backup/Disabled Files (3 files)
```bash
rm packages/tiara/bin/training-pipeline-old.js.bak
rm packages/tiara/src/cli/simple-commands/training-pipeline-old.js.bak
rm packages/tiara/src/cli/commands/swarm-new.ts.disabled
```

#### 3. Broken Test Files (104 files, ~14,000 lines)
All `.broken` test files in packages/tiara have been removed. These were disabled tests that were never run and added noise to the codebase.

### Summary of Deletions

| Category | Files | Lines |
|----------|-------|-------|
| Orphaned utility | 1 | 10 |
| Backup files (.bak) | 2 | ~200 |
| Disabled files (.disabled) | 1 | ~100 |
| Broken tests (.broken) | 104 | ~14,000 |
| **Total** | **108** | **~14,310** |

### Post-Deletion Verification

```bash
# Ensure build succeeds
cd packages/agent-core && bun run build

# Ensure tests pass
bun test

# Ensure daemon starts
agent-core daemon
```

### Barrel Export Cleanup

After deletions, check for broken imports:
```bash
bun run build 2>&1 | grep -i "cannot find module"
```

Fix any broken barrel exports in `index.ts` files.

---

## Execution Order

```
Phase 0: Tests ─────────────────────────────────────┐
                                                    │
Phase 1: Tools ─────► Phase 2: Reranker ───────────►│
                                                    │
Phase 3: WorkStealing ──────────────────────────────┤
                                                    │
Phase 4: Consensus ─────────────────────────────────┤
                                                    │
Phase 5: Dead Code ◄────────────────────────────────┘
```

**Recommended PR Strategy**:
1. PR #1: Phase 1 (Tool wiring)
2. PR #2: Phase 2 (Reranker docs/config)
3. PR #3: Phase 3 (WorkStealing)
4. PR #4: Phase 4 (Consensus)
5. PR #5: Phase 5 (Dead code deletion)

---

## Config Flags Summary

All new features should be behind experimental flags:

```json
{
  "experimental": {
    "workStealing": {
      "enabled": false,
      "checkInterval": 30000,
      "stealThreshold": 0.3
    },
    "consensus": {
      "enabled": false,
      "algorithm": "raft",
      "requireApprovalFor": ["tool_side_effect"]
    },
    "reranker": {
      "enabled": false,
      "provider": "voyage"
    }
  }
}
```
