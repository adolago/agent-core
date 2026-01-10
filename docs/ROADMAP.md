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
- [ ] Auto-refresh OAuth tokens before expiry (not just on-demand)
- [ ] Add provider health checks in TUI

### 1.2 Config Management
- [x] Symlink global config to project config
- [ ] Single source of truth for agent definitions (remove duplication)
- [ ] Config validation on startup
- [ ] Migration tool for config schema changes

---

## Phase 2: Personas

### 2.1 Zee (Personal Assistant)
- [ ] Qdrant memory integration
  - [ ] Store conversation summaries
  - [ ] Semantic search across memories
  - [ ] Key facts extraction
- [ ] Messaging integration
  - [ ] WhatsApp via whatsapp-web.js
  - [ ] Telegram gateway
  - [ ] Discord integration
- [ ] Calendar integration
  - [ ] Google Calendar sync
  - [ ] Smart scheduling

### 2.2 Stanley (Investing)
- [ ] OpenBB integration for market data
- [ ] Portfolio tracking
  - [ ] Position management
  - [ ] P&L tracking
  - [ ] Risk metrics (VaR)
- [ ] SEC filings analysis
- [ ] NautilusTrader backtesting integration

### 2.3 Johny (Learning)
- [ ] Knowledge graph implementation
  - [ ] Topic DAG with prerequisites
  - [ ] Mastery level tracking
- [ ] Spaced repetition (MathAcademy-inspired)
  - [ ] Ebbinghaus decay modeling
  - [ ] FIRe (Fractional Implicit Repetition)
- [ ] Study session management
  - [ ] Deliberate practice
  - [ ] Interleaving

---

## Phase 3: Shared Infrastructure

### 3.1 Memory System
- [ ] Qdrant vector storage setup
- [ ] Conversation continuity across compactions
- [ ] Cross-persona memory sharing
- [ ] Memory search MCP tool

### 3.2 Orchestration (Tiara)
- [ ] Drone spawning via Task tool
- [ ] WezTerm pane management
- [ ] SPARC methodology integration
- [ ] Background task status tracking

### 3.3 MCP Servers
- [ ] Context7 integration (done)
- [ ] Custom MCP for personas
  - [ ] Memory MCP
  - [ ] Calendar MCP
  - [ ] Portfolio MCP

---

## Phase 4: TUI Improvements

### 4.1 Model Selection
- [ ] Favorites system
- [ ] Recently used models
- [ ] Provider status indicators (auth valid/expired)
- [ ] Cost display for non-free models

### 4.2 Agent Experience
- [ ] Agent-specific themes/colors
- [ ] Persistent agent state across sessions
- [ ] Agent handoff (delegate to another persona)

### 4.3 Conversation
- [ ] Better compaction summaries
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
