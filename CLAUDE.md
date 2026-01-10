# Agent-Core - The Engine

This is the **engine** that powers Artur's Agent System. agent-core is a fork of OpenCode with custom personas.

## CRITICAL: Naming Convention

**NEVER use "opencode" in new code, documentation, or user-facing text.**

This project is `agent-core`, not OpenCode. While we're grateful to the original OpenCode maintainers, users must be able to run both projects without confusion:

- CLI command: `agent-core` (not `opencode`)
- Config directory: `~/.config/agent-core/`
- State directory: `~/.local/state/agent-core/`
- Documentation references: "agent-core daemon", not "opencode daemon"
- Variable names, function names: avoid `opencode` prefix

Existing upstream code may still contain "opencode" references - that's fine. But all NEW code and documentation should use "agent-core" naming.

## IMPORTANT: First Steps When Working on This Repo

**ALWAYS read these before making changes:**

1. **Tiara** (`vendor/tiara/`) - The orchestration submodule with claude-flow
   - `vendor/tiara/CLAUDE.md` - SPARC methodology, concurrent execution rules
   - `vendor/tiara/docs/` - Architecture, integrations, roadmaps

2. **The Triad** (`.claude/skills/`) - The three personas:
   - `.claude/skills/zee/SKILL.md` - Personal assistant (memory, messaging, calendar)
   - `.claude/skills/stanley/SKILL.md` - Investing system (markets, portfolio, NautilusTrader)
   - `.claude/skills/johny/SKILL.md` - Learning system (knowledge graph, spaced repetition)

3. **Shared capabilities** (`.claude/skills/shared/`, `.claude/skills/personas/`)
   - Orchestration, WezTerm integration, drone spawning

**Do NOT skip this step** - the personas have specific capabilities and delegation rules.

## The Personas System

You are part of the **Personas** - three AI personas that share a common orchestration layer:

```
┌─────────────────────────────────────────────────────────────┐
│                         PERSONAS                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │     ZEE     │  │   STANLEY   │  │    JOHNY    │         │
│  │  Personal   │  │  Investing  │  │  Learning   │         │
│  │  Assistant  │  │  Platform   │  │  System     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          │                                  │
│              ┌───────────▼───────────┐                     │
│              │   SHARED LAYER        │                     │
│              │ • Memory (Qdrant)     │                     │
│              │ • Orchestration       │                     │
│              │ • WezTerm Integration │                     │
│              │ • Conversation State  │                     │
│              └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Personas Capabilities (ALL Personas Have These)

**1. Spawn Drones** - You can spawn background workers (drones) that:
- Maintain your persona identity (a "Zee drone" acts like Zee)
- Execute tasks in parallel while you continue the conversation
- Report results back to you
- Run in separate WezTerm panes for visibility

**2. Shared Memory** - All personas share:
- Qdrant vector memory for semantic search
- Conversation continuity state (survives compacting)
- Plan and objectives across sessions
- Key facts extracted from conversations

**3. Conversation Continuity** - When context gets compacted:
- A summary is saved to Qdrant automatically
- Key facts are extracted and preserved
- Plan/objectives persist across sessions
- You can restore context from previous sessions

**4. WezTerm Pane Management** - Visual orchestration:
- Each drone gets its own pane
- Status pane shows Personas state
- You can see what all workers are doing

### How to Use Personas Capabilities

**Spawning a Drone:**
```
When you need to do heavy background work, you can spawn a drone:
1. Decide what task needs background processing
2. Use the Task tool to spawn an agent with your persona
3. The drone will work independently and report back
4. You continue the conversation while it works
```

**Preserving Continuity:**
```
Before context is compacted:
1. Summarize the conversation state
2. Extract key facts to remember
3. Save current plan and objectives
4. These persist in Qdrant for restoration
```

**Checking State:**
```
You can always check:
- What drones are running
- Current plan and objectives
- Key facts from previous sessions
- Memory search results
```

## Architecture: agent-core → tiara → personas

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENT-CORE (Engine)                          │
│                ~/Repositories/agent-core/                           │
│                                                                     │
│  packages/agent-core/     ← Fork of OpenCode TUI (built-in agents    │
│                           removed, only triad remains)              │
│  ~/.config/agent-core/  ← Config, auth, plugins                     │
├─────────────────────────────────────────────────────────────────────┤
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    TIARA (Orchestration)                       │  │
│  │                    vendor/tiara/                               │  │
│  │                                                               │  │
│  │  • SPARC methodology (Specification→Pseudocode→Architecture   │  │
│  │    →Refinement→Completion)                                    │  │
│  │  • Claude-Flow swarm coordination                             │  │
│  │  • Concurrent execution patterns                              │  │
│  │  • Agent spawning via Task tool                               │  │
│  │  • Memory coordination                                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    PERSONAS (The Triad)                        │  │
│  │                    .claude/skills/                             │  │
│  │                                                               │  │
│  │  ┌─────────┐     ┌─────────┐     ┌─────────┐                  │  │
│  │  │   ZEE   │     │ STANLEY │     │  JOHNY  │                  │  │
│  │  │ Personal│     │Investing│     │Learning │                  │  │
│  │  └────┬────┘     └────┬────┘     └────┬────┘                  │  │
│  │       └───────────────┼───────────────┘                       │  │
│  │                       ▼                                        │  │
│  │              ┌─────────────────┐                               │  │
│  │              │  SHARED LAYER   │                               │  │
│  │              │  • personas/    │  Orchestration, drones        │  │
│  │              │  • shared/      │  Qdrant, WezTerm, canvas      │  │
│  │              │  • agents-menu/ │  Delegation routing           │  │
│  │              └─────────────────┘                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  src/                                                               │
│  ├── domain/          ← Domain tools (stanley/, zee/)              │
│  ├── personas/        ← Persona logic (knowledge-graph, etc.)      │
│  ├── council/         ← LLM Council multi-model deliberation       │
│  └── memory/          ← Qdrant vector storage types                │
└─────────────────────────────────────────────────────────────────────┘
```

### Flow Summary

1. **agent-core** = Fork of OpenCode with built-in agents (build/plan/general/explore) **removed**
2. **tiara** = Orchestration layer providing SPARC methodology and swarm coordination
3. **personas** = The Triad (Zee/Stanley/Johny) + shared capabilities

### Key Principle

No generic "build" or "plan" agents. Every interaction goes through a persona with domain expertise. The personas share orchestration (tiara) and memory (Qdrant) but have distinct purposes.

## Personas

| Persona | Inspiration | Domain | Skills Location |
|---------|-------------|--------|-----------------|
| **Johny** | von Neumann | Study, learning | `.claude/skills/johny/` |
| **Stanley** | Druckenmiller | Trading, markets | `.claude/skills/stanley/` |
| **Zee** | Personal | Memory, messaging | `.claude/skills/zee/` |

## Key Directories

```
agent-core/
├── .claude/skills/           # Agent Skills (Anthropic standard)
│   ├── johny/               # Study assistant
│   ├── stanley/             # Trading assistant
│   └── zee/                 # Personal assistant
├── src/
│   ├── domain/              # Domain-specific tools
│   │   ├── stanley/         # 5 financial tools
│   │   └── zee/             # 6 personal tools
│   ├── personas/
│   │   └── johny/
│   │       └── knowledge-graph/  # MathAcademy-inspired learning system
│   ├── council/             # LLM Council implementation
│   └── memory/              # Qdrant vector storage types
└── docs/
    └── SKILLS.md            # Skills documentation
```

## Integration

Skills are loaded from `.claude/skills/` and `~/.config/agent-core/skills/`:
```
.claude/skills/johny/     → Johny persona
.claude/skills/stanley/   → Stanley persona
.claude/skills/zee/       → Zee persona
.claude/skills/personas/  → Shared orchestration
.claude/skills/shared/    → Shared tools (Qdrant, WezTerm, canvas)
```

## Development Guidelines

1. **Skills go in `.claude/skills/`** - Follow Anthropic Agent Skills standard
2. **Domain tools go in `src/domain/`** - TypeScript implementations
3. **Persona logic goes in `src/personas/`** - Knowledge graphs, strategies
4. **Keep upstream sync** - This repo tracks upstream changes

## Experimental Features

This system has experimental features enabled:
- LLM Council for multi-model deliberation
- Knowledge graph with FIRe (Fractional Implicit Repetition)
- Semantic memory via Qdrant
- All OpenCode experimental flags active

## State Management

| Data | Location |
|------|----------|
| Johny profile | `~/.zee/johny/profile.json` |
| Stanley portfolio | `~/.zee/stanley/portfolio.json` |
| Zee memories | `~/.zee/zee/memories.json` |
| Credentials | `~/.zee/credentials/` |

## Running Processes & Binary Updates

### Repository Location
**Source code:** `~/.local/src/agent-core`

This hidden location prevents accidentally running from the repo directory (which can cause config confusion).

### Binary Location
**Installed binary:** `~/bin/agent-core` (also `$AGENT_CORE_BIN`)

**Run from anywhere:** The binary can be launched from any directory. Just `cd` to your project folder and run `agent-core`.

### Rebuilding

```bash
# Build from repo
cd ~/.local/src/agent-core/packages/agent-core && bun run build

# Kill running instances and install (MUST close TUI first)
pkill -f agent-core; sleep 1
cp ~/.local/src/agent-core/packages/agent-core/dist/agent-core-linux-x64/bin/agent-core ~/bin/agent-core
```

### Common Processes
When updating the binary, you may encounter "Text file busy". Check for:

```bash
pgrep -af agent-core
```

**Typical processes:**
| Process | Description | Safe to kill? |
|---------|-------------|---------------|
| `/home/artur/bin/agent-core --print-logs` | TUI instance | Yes (close TUI first) |
| `bun run ... src/index.ts` | Dev server | Yes |

**Related but separate (don't kill):**
| Process | Location | Description |
|---------|----------|-------------|
| Zee Gateway | `~/Repositories/personas/zee/` | Node.js Telegram/messaging gateway |

The Zee Gateway runs from a separate repo (`personas/zee`) and does NOT use the agent-core binary.

### Gateways
Zee has a gateway for messaging platforms (Telegram, etc.):
- **Location**: `~/Repositories/personas/zee/`
- **Start**: `pnpm zee gateway`
- **Processes**: Multiple Node.js workers (tsx)
- **Independent**: Does not depend on agent-core binary
