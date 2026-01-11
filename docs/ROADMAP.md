# Agent-Core Roadmap

## Current State

Agent-core is a fork of OpenCode with three personas (Zee, Stanley, Johny) sharing orchestration and memory layers.

### What Works
- [x] Provider system with Antigravity, Cerebras, OpenRouter
- [x] Three personas with Tab switching
- [x] Config symlinks for global access
- [x] OAuth auth for Anthropic and Google
- [x] Built-in antigravity models (Claude, Gemini)

---

## Phase 1: Foundation (Current)

### 1.1 Provider Stability
- [x] Fix Antigravity model registration (use built-in `antigravity-*` models)
- [x] Disable redundant Vertex providers
- [x] Document provider setup (`docs/PROVIDERS.md`)
- [x] Auto-refresh OAuth tokens before expiry (not just on-demand)
- [x] Add provider health checks in TUI

### 1.2 Config Management
- [x] Symlink global config to project config
- [x] Single source of truth for agent definitions (remove duplication)
  - Agent files (`.agent-core/agent/*.md`) have concise config + identity
  - Skill files (`.claude/skills/*/SKILL.md`) have detailed capabilities
  - Agent files reference skills via `skill:` frontmatter field
- [x] Config validation on startup (already implemented via zod schemas + FormatError)
- [x] Migration tool for config schema changes (`agent-core debug migrate`)

---

## Phase 2: Personas

### 2.1 Zee (Personal Assistant) - COMPLETE
- [x] Qdrant memory integration
  - [x] Store conversation summaries (`zee:memory-store` tool wired to Qdrant)
  - [x] Semantic search across memories (`zee:memory-search` tool wired)
  - [x] MemoryStore service created (`src/memory/store.ts`)
  - [x] Local BGE-M3 embeddings (1024d) via vLLM instead of OpenAI
  - [x] Fixed Qdrant collection selection bug (currentCollection)
  - [x] Key facts extraction (`src/personas/fact-extractor.ts`)
    - Heuristic + LLM extraction options
    - Automatic categorization (personal, preference, decision, technical)
    - Session lifecycle hook for auto-extraction
- [x] Messaging integration
  - [x] WhatsApp via whatsapp-web.js (`src/gateway/whatsapp.ts`)
  - [x] Telegram gateway (`src/gateway/telegram.ts`)
  - [x] `zee:messaging` tool wired to daemon endpoints
  - [x] `zee:whatsapp-react` tool for message reactions
  - [x] Proactive messaging (send without prior message)
  - [x] Multi-persona Telegram (Stanley/Johny bots via Zee's account)
  - [x] Discord integration removed (not needed)
- [x] Calendar integration
  - [x] Google Calendar sync (`zee:calendar` tool working)
  - [x] Smart scheduling
    - [x] Event creation/update/delete via Google Calendar API
    - [x] Find free time slots with business hours awareness
    - [x] Meeting time suggestions with scoring (prefer morning/afternoon)
    - [x] Natural language quick-add via Google's NLP
    - [x] Conflict detection

### 2.2 Stanley (Investing) - COMPLETE
- [x] OpenBB integration for market data
  - [x] CLI bridge created (`stanley_cli.py` → `tools.ts`)
  - [x] 5 domain tools: market-data, portfolio, sec-filings, research, nautilus
  - [x] **FIXED**: OpenBB version mismatch → yfinance fallback implemented
  - [x] `OpenBBAdapter` auto-detects OpenBB issues and uses direct yfinance
- [x] Portfolio tracking
  - [x] Position management (`~/.zee/stanley/portfolio.json`)
  - [x] Holdings status via `portfolio status` command
  - [x] P&L tracking with live price fallback
  - [x] Risk metrics (VaR, Sharpe, Sortino)
- [x] SEC filings analysis
  - [x] EdgarAdapter created (`stanley/accounting/edgar_adapter.py`)
  - [x] **FIXED**: pyarrow compatibility → convert to list before slicing
  - [x] 10-K, 10-Q, 8-K, 13F filings working
- [x] NautilusTrader backtesting integration
  - [x] Strategy-info command works
  - [x] Backtest command works with yfinance data
  - [x] Built-in strategies: momentum (EMA cross), mean-reversion (SMA threshold)
  - [x] **FIXED**: Indicator import path for nautilus_trader 1.200+

**Files modified in Stanley Python repo:**
- `stanley/accounting/edgar_adapter.py` - pyarrow compatibility fix
- `stanley/data/providers/openbb_provider.py` - yfinance fallback
- `stanley/integrations/nautilus/indicators/*.py` - import fix
- `requirements-lock.txt` - created with pinned versions

### 2.3 Johny (Learning) - COMPLETE
- [x] Knowledge graph implementation
  - [x] Topic DAG with prerequisites (`johny/knowledge/graph.py`)
  - [x] Learning path generation (topological sort)
  - [x] Mastery level tracking (6 levels: Unknown → Fluent)
- [x] Spaced repetition (MathAcademy-inspired)
  - [x] Ebbinghaus decay modeling (R = e^(-t/S))
  - [x] FIRe (Fractional Implicit Repetition) for prerequisite review credit
  - [x] Priority-based review queue
- [x] Study session management
  - [x] Session lifecycle (start, pause, resume, end)
  - [x] Time tracking with pause support
- [x] CLI bridge (`scripts/johny_cli.py`)
  - [x] JSON stdio output for agent-core integration
  - [x] 5 domain tools: study, knowledge, mastery, review, practice

**Files created in Johny Python repo:**
- `johny/knowledge/` - DAG, topics, learning paths
- `johny/mastery/` - levels, tracker, retention calculation
- `johny/review/` - scheduler, Ebbinghaus curves
- `johny/practice/` - session management
- `scripts/johny_cli.py` - CLI bridge

**Files created in agent-core:**
- `src/domain/johny/tools.ts` - TypeScript domain tools

---

## Phase 3: Shared Infrastructure

### 3.1 Memory System - COMPLETE
- [x] Qdrant vector storage setup (`src/memory/qdrant.ts`, `store.ts`)
  - [x] QdrantVectorStorage with full CRUD operations
  - [x] MemoryStore high-level API for save/search/list
  - [x] Collection management with auto-creation
- [x] Embedding generation (`src/memory/embedding.ts`)
  - [x] **Qwen3-Embedding-8B via Nebius API** (4096d, #1 on MTEB)
  - [x] Voyage AI provider support
  - [x] OpenAI/local fallback options
- [x] Conversation continuity across compactions (`src/personas/continuity.ts`)
  - [x] ContinuityManager with session lifecycle
  - [x] Key fact extraction (heuristic + LLM ready)
  - [x] Summary generation
  - [x] Context restoration from previous sessions
- [x] Cross-persona memory sharing
  - [x] Namespace-based isolation
  - [x] Shared Qdrant collections
  - [x] Memory bridge for persona state (`src/personas/memory-bridge.ts`)
- [x] Memory search MCP tool (`personas-memory` server)

### 3.2 Orchestration (Tiara) - COMPLETE
- [x] Drone spawning via Task tool (`src/personas/tiara.ts`)
  - [x] Orchestrator class with full worker lifecycle
  - [x] Task submission and assignment
  - [x] Worker status tracking (spawning, working, idle, terminated)
- [x] WezTerm pane management (`src/personas/wezterm.ts`)
  - [x] WeztermPaneBridge for pane creation/management
  - [x] Layout setup (horizontal/vertical/grid)
  - [x] Status pane updates
- [x] SPARC methodology integration (`vendor/tiara/`)
  - [x] Tiara submodule with claude-flow
- [x] Background task status tracking
  - [x] DroneWaiter for async completion notifications
  - [x] Event subscription system
  - [x] State persistence to Qdrant
- [x] Fact extraction hooks (`src/personas/hooks/`)
  - [x] Session lifecycle hook for auto-extraction
  - [x] Heuristic and LLM-based extraction

### 3.3 MCP Servers - COMPLETE
- [x] Context7 integration
- [x] Custom MCP for personas (`src/mcp/servers/`)
  - [x] Memory MCP (`personas-memory`) - store, search, list, delete, stats
  - [x] Calendar MCP (`personas-calendar`) - events, create, update, delete, free-time
  - [x] Portfolio MCP (`personas-portfolio`) - status, positions, market-data, SEC, backtest

---

## Phase 4: TUI Improvements

### 4.1 Model Selection - COMPLETE
- [x] Favorites system (`dialog-model.tsx` favorites support)
- [x] Recently used models (`local.model.recent()`)
- [x] Provider status indicators (auth valid/expired) - shows ✗/△ in model dialog
- [x] Cost display for non-free models (shows "Free" badge)

### 4.2 Agent Experience - COMPLETE
- [x] Agent-specific themes/colors (agent YAML `theme` field, auto-switch on agent change)
- [x] Persistent agent state across sessions (via ContinuityManager)
- [x] Agent handoff (delegate to another persona via `<leader>d` or command palette)

### 4.3 Conversation
- [x] Better compaction summaries (via continuity.ts generateSummary)
- [ ] Conversation branching
- [ ] Export conversations

---

## Phase 5: Upstream Sync

### 5.1 Merge Strategy
- [ ] Track upstream OpenCode releases
- [ ] Maintain patch set for agent-core customizations
- [ ] Automated conflict detection

### 5.2 Divergence Points
- Built-in agents removed (only personas)
- Config paths changed to agent-core
- Custom provider transforms
- Persona-specific skills

---

## Backlog

### Nice to Have
- [ ] Voice input/output
- [ ] Mobile companion app
- [ ] Multi-user support
- [ ] Plugin marketplace for personas

### Technical Debt
- [ ] Remove "opencode" references in new code
- [ ] Type safety for persona configs
- [ ] Test coverage for provider transforms
- [ ] E2E tests for auth flows

---

## Contributing

When working on roadmap items:
1. Create a branch: `feat/phase-X.Y-description`
2. Update this roadmap with progress
3. Add documentation to `docs/`
4. Test with all three personas
