# Agent-Core - The Engine

This is the **engine** that powers Artur's Agent System. OpenCode is the **surface** (car), agent-core is the **engine + custom parts**.

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

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OPENCODE (Surface)                       │
│         ~/.config/opencode/ - TUI, auth, plugins            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ symlinks to
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENT-CORE (Engine)                       │
│           ~/Repositories/agent-core/                        │
│                                                             │
│  .claude/skills/     ← Personas (Johny, Stanley, Zee)       │
│  src/domain/         ← Domain tools                         │
│  src/personas/       ← Knowledge graph, trading logic       │
│  src/council/        ← LLM Council multi-model deliberation │
│  src/memory/         ← Qdrant vector storage                │
│  src/personas/          ← Personas orchestration system           │
└─────────────────────────────────────────────────────────────┘
```

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

## Integration with OpenCode

Skills are symlinked globally:
```
~/.config/opencode/skills/johny   → agent-core/.claude/skills/johny
~/.config/opencode/skills/stanley → agent-core/.claude/skills/stanley
~/.config/opencode/skills/zee     → agent-core/.claude/skills/zee
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
