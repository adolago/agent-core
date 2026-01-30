<!--
  ╔═══════════════════════════════════════════════════════════════════════════╗
  ║  IMPORTANT: CLAUDE.md is a SYMLINK to this file (AGENTS.md)               ║
  ║                                                                           ║
  ║  This ensures all AI agents (Claude, GPT, Gemini, etc.) read the same     ║
  ║  instructions. DO NOT:                                                    ║
  ║    - Delete CLAUDE.md (it will break Claude Code compatibility)           ║
  ║    - Replace the symlink with a separate file                             ║
  ║    - Create conflicting instructions in multiple files                    ║
  ║                                                                           ║
  ║  If you need to edit these instructions, edit THIS file (AGENTS.md).      ║
  ║  The symlink will automatically reflect the changes.                      ║
  ╚═══════════════════════════════════════════════════════════════════════════╝
-->

# Agent-Core - The Engine

This is the **engine** that powers Agent-Core.

## Quick Reference

- To test agent-core in `packages/agent-core`, run `bun dev`.
- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- When creating GitHub issues or PRs, target the fork at `origin` (e.g., `adolago/agent-core`), not upstream or other repos.

### Binary Installation

**Single source of truth**: The `agent-core` binary is installed via `bun link` from `packages/agent-core/`.

To reinstall after building:
```bash
cd packages/agent-core && bun link
```

This creates a symlink at `~/.bun/bin/agent-core` → dev build.

**Do NOT** install agent-core via:
- `~/bin/agent-core` (manual copy)
- `~/.local/bin/agent-core` (separate symlink)
- legacy curl installer

## CRITICAL: Always Verify Binary Version Before Testing

**Before testing any changes, ALWAYS run the verification script:**

```bash
# After building, verify binary is correct
cd packages/agent-core && bun run build
./script/verify-binary.sh
```

The script checks:
1. Installed binary points to local build (not global npm install)
2. Binary is newer than source files
3. Symlink resolves correctly

**If verification fails**, fix with:
```bash
ln -sf /home/artur/.local/src/agent-core/packages/agent-core/dist/@adolago/agent-core-linux-x64/bin/agent-core ~/.bun/bin/agent-core
```

⚠️ **Common pitfall**: `bun run build` compiles to `dist/` but does NOT update the installed binary if the symlink points elsewhere (e.g., global npm install).

## CRITICAL: Naming Convention

**NEVER use the legacy name in new code, documentation, or user-facing text.**

This project is `agent-core`. Users should be able to run different toolchains without confusion:

- CLI command: `agent-core`
- Config directory: `~/.config/agent-core/`
- State directory: `~/.local/state/agent-core/`
- Documentation references: "agent-core daemon"
- Variable names, function names: avoid legacy prefixes

Existing upstream code may still contain legacy references - that's fine. But all NEW code and documentation should use agent-core naming.

## Communication Style

### No Emojis Policy

**Do NOT use emojis** anywhere in this project:

- Commit messages
- PR titles and descriptions
- Code comments
- Documentation (markdown files)
- Log messages
- User-facing text and status messages
- Variable names or identifiers

**Why**: Clean, professional text is easier to read, search, and parse programmatically. Emojis add visual noise without semantic value in technical contexts.

**Exceptions**: 
- Third-party integrations that require emojis (for example, platform reactions or status features)
- User-provided content that may contain emojis
- Skill metadata `emoji` fields used for external platform identity

**Examples**:

```
# Bad
git commit -m "🚀 Add new feature"
git commit -m "✨ Fix bug in parser"

# Good  
git commit -m "Add new feature"
git commit -m "Fix bug in parser"
```

```
# Bad (in code comments)
// TODO: 🔥 Optimize this later

# Good
// TODO: Optimize this later
```

This policy applies to all personas (Zee, Stanley, Johny) and all agents working on this codebase.

## IMPORTANT: First Steps When Working on This Repo

**ALWAYS read these before making changes:**

1. **Tiara** (`packages/tiara/`) - The orchestration submodule
   - `packages/tiara/CLAUDE.md` - SPARC methodology, concurrent execution rules
   - `packages/tiara/docs/` - Architecture, integrations, roadmaps

2. **The Triad** (`.claude/skills/`) - The three personas:
   - `.claude/skills/zee/SKILL.md` - Personal assistant (memory, messaging, calendar, and more)
   - `.claude/skills/stanley/SKILL.md` - Investing assistant with access to a full platform (NautilusTrader, OpenBB, own GUI in rust) of APIS integration
   - `.claude/skills/johny/SKILL.md` - Study assistant focused on diliberate practice, with knowledge graph and spaced repetition
   - Each persona has its own configuration and capabilities, all have access to Tiara's orchestration offers
3. **Orchestration** (`.claude/skills/tiara-orchestration/`, `.claude/skills/personas/`)
   - Tiara orchestration, WezTerm integration, drone spawning

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
│               ~/.local/src/agent-core/                              │
│                                                                     │
│  packages/agent-core/     ← Core TUI (built-in agents                │
│                           removed, only triad remains)              │
│  ~/.config/agent-core/  ← Config, auth, plugins                     │
├─────────────────────────────────────────────────────────────────────┤
│                              │                                      │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    TIARA (Orchestration)                       │  │
│  │                    packages/tiara/                               │  │
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
│  │              │  • shared/      │  Qdrant, WezTerm              │  │
│  │              │  • agents-menu/ │  Delegation routing           │  │
│  │              └─────────────────┘                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  src/                                                               │
│  ├── domain/          ← Domain tools (stanley/, zee/)              │
│  ├── personas/        ← Persona logic (knowledge-graph, etc.)      │
│  └── memory/          ← Qdrant vector storage types                │
└─────────────────────────────────────────────────────────────────────┘
```

### Flow Summary

1. **agent-core** = Core engine with built-in agents (build/plan/general/explore) **removed**
2. **tiara** = Orchestration layer providing SPARC methodology and swarm coordination
3. **personas** = The Triad (Zee/Stanley/Johny) + shared capabilities

### Key Principle

No generic "build" or "plan" agents. Every interaction goes through a persona with domain expertise. The personas share orchestration (tiara) and memory (Qdrant) but have distinct purposes.

## Simplified Package Structure

This is a consolidated monolith with just 3 packages:

```
packages/
├── agent-core/      # Core TUI, daemon, SDK, utils (all merged)
├── tiara/           # Orchestration (SPARC methodology)
└── personas/zee/    # Messaging gateway only
```

**Personas:**
- **Zee**: Messaging gateway in `packages/personas/zee/`
- **Stanley**: External Python repo (set `STANLEY_REPO` env var)
- **Johny**: TypeScript implementation in `src/personas/johny/`

## Key Directories

```
agent-core/
├── .claude/skills/           # Agent Skills (Anthropic standard)
│   ├── johny/               # Study assistant
│   ├── stanley/             # Trading assistant
│   └── zee/                 # Personal assistant
├── packages/
│   ├── agent-core/          # Core engine
│   │   └── src/pkg/         # Merged packages (sdk, plugin, util, script)
│   ├── tiara/               # Orchestration
│   └── personas/zee/        # Messaging gateway
├── src/
│   ├── domain/              # Domain-specific tools
│   │   ├── johny/           # 5 learning tools
│   │   ├── stanley/         # 5 financial tools (CLI bridge)
│   │   └── zee/             # 6 personal tools
│   ├── personas/
│   │   └── johny/           # TypeScript learning system
│   │       ├── knowledge-graph.ts  # Topic DAG
│   │       ├── mastery.ts          # Mastery tracking
│   │       ├── review.ts           # Spaced repetition
│   │       └── practice.ts         # Practice sessions
│   └── memory/              # Qdrant vector storage types
└── docs/
    └── SKILLS.md            # Skills documentation
```

## Integration

Skills are loaded from `.claude/skills/` and `~/.config/agent-core/skills/`:

```
.claude/skills/johny/              → Johny persona
.claude/skills/stanley/            → Stanley persona
.claude/skills/zee/                → Zee persona
.claude/skills/personas/           → Persona identities
.claude/skills/tiara-orchestration/→ Orchestration (drones, memory, continuity)
.claude/skills/agents-menu/        → Quick reference
```

## Development Guidelines

1. **Skills go in `.claude/skills/`** - Follow Anthropic Agent Skills standard
2. **Domain tools go in `src/domain/`** - TypeScript implementations
3. **Persona logic goes in `src/personas/`** - Knowledge graphs, strategies
4. **No upstream sync** - This is a standalone monolith for solo development

## Experimental Features

This system has experimental features enabled:

- Knowledge graph with FIRe (Fractional Implicit Repetition)
- Semantic memory via Qdrant
- All experimental flags active

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STANLEY_REPO` | Path to external Stanley Python repo (required for Stanley tools) |
| `JOHNY_DATA_DIR` | Directory for Johny data files (default: `~/.zee/johny`) |
| `AGENT_CORE_ROOT` | Path to agent-core installation (for bundled binaries) |

## State Management

| Data              | Location                        |
| ----------------- | ------------------------------- |
| Johny knowledge   | `~/.zee/johny/knowledge-graph.json` |
| Johny mastery     | `~/.zee/johny/mastery.json`     |
| Johny reviews     | `~/.zee/johny/reviews.json`     |
| Johny practice    | `~/.zee/johny/practice.json`    |
| Stanley portfolio | `~/.zee/stanley/portfolio.json` |
| Zee memories      | `~/.zee/zee/memories.json`      |
| Credentials       | `~/.zee/credentials/`           |

## Running Processes & Binary Updates

> ⚠️ **CRITICAL: Read `docs/OPS.md` before debugging fixes that "don't take effect"**
>
> The #1 cause of confusion is **not knowing which binary is running**:
>
> - **Dev mode** (`bun run dev`): Uses source files directly, restart takes effect
> - **Production** (`~/bin/agent-core`): Uses compiled binary, must rebuild + copy + restart
>
> Use `./scripts/reload.sh --status` to see what's running and if source is newer than binary.

### Repository Location

**Source code:** The project root (can be customized via `AGENT_CORE_SOURCE` env var)

By default, the canonical location is `~/.local/src/agent-core`, but the project can be cloned anywhere.

### Binary Location

Two installation methods are supported:

1. **Bun global install (recommended):** `~/.bun/bin/agent-core`
   - Installed via `bun install -g agent-core`
   - Wrapper script resolves the actual binary automatically

2. **Manual install:** `~/bin/agent-core` (also `$AGENT_CORE_BIN`)
   - Direct binary copy from build output
   - Used by `reload.sh` script

**Run from anywhere:** The binary can be launched from any directory. Just `cd` to your project folder and run `agent-core`.

### Rebuilding

**For bun global install:**

```bash
# Build and the global install auto-updates
cd packages/agent-core && bun run build
```

**For manual install (reload script):**

```bash
# Full reload - kill all, rebuild, restart daemon
./scripts/reload.sh

# Just check status (what's running, version info)
./scripts/reload.sh --status

# Restart without rebuilding (config changes only)
./scripts/reload.sh --no-build
```

**Manual method** (if script unavailable):

```bash
# Build from repo
cd packages/agent-core && bun run build

# Kill running instances and install (MUST close TUI first)
pkill -f agent-core; sleep 1
cp packages/agent-core/dist/agent-core-linux-x64/bin/agent-core ~/bin/agent-core
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
| Zee Gateway | `~/.local/src/agent-core/packages/personas/zee/` | Node.js messaging gateway (WhatsApp, Telegram, Signal) |

### Gateway Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GATEWAY FLOW                                 │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐
│  │                   Zee Gateway (Transport)                        │
│  │                 ~/.local/src/agent-core/packages/personas/zee/                             │
│  │                                                                 │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  │ WhatsApp │  │ Telegram │                                  │
│  │  │ (Baileys)│  │ (grammY) │                                  │
│  │  └────┬─────┘  └────┬─────┘                                  │
│  │       └──────────────┼──────────────┘                         │
│  │                      ▼                                          │
│  │          ┌─────────────────────────┐                            │
│  │          │  Persona Detection      │                            │
│  │          │  @stanley → stanley     │                            │
│  │          │  @johny → johny         │                            │
│  │          │  default → zee          │                            │
│  │          └───────────┬─────────────┘                            │
│  └──────────────────────┼──────────────────────────────────────────┘
│                         │ HTTP POST /session/:id/message
│                         │ + agent: persona
│                         ▼
│  ┌─────────────────────────────────────────────────────────────────┐
│  │              agent-core daemon (spawns gateway)                  │
│  │                   http://127.0.0.1:3210                         │
│  │                                                                 │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  │     ZEE     │  │   STANLEY   │  │    JOHNY    │              │
│  │  │  Persona    │  │   Persona   │  │   Persona   │              │
│  │  │  Skills,    │  │   Skills,   │  │   Skills,   │              │
│  │  │  Memory,    │  │   Markets,  │  │   Learning, │              │
│  │  │  Tools      │  │   Tools     │  │   Tools     │              │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │
│  └─────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────┘
```

**Key Points:**

- **Zee Gateway** = Transport layer only (handles WhatsApp/Telegram/Signal connections)
- **agent-core daemon** = All agent logic, personas, memory, tools
- **Persona routing** = Messages mentioning `@stanley` or `@johny` are routed to those personas
- **Daemon-only mode** = Zee REQUIRES agent-core daemon to be running

### Running the Embedded Gateway

1. **Start agent-core daemon (gateway auto-starts):**

   ```bash
   agent-core daemon --hostname 127.0.0.1 --port 3210
   ```

2. **Send a message** via WhatsApp/Telegram mentioning a persona:
   - "Hello" → routes to Zee (default)
   - "@stanley What's the market doing?" → routes to Stanley
   - "@johny Help me study" → routes to Johny

### Architecture Decision

Messaging transport remains in Zee, but the gateway is launched by agent-core to:

1. Avoid duplication with the Zee gateway transport layer
2. Keep agent-core clean for upstream sync
3. Centralize messaging transport in one place

All messaging flows through the Zee gateway at `~/.local/src/agent-core/packages/personas/zee/`, managed by the daemon.
