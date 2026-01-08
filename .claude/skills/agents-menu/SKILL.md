---
name: agents-menu
description: Always-read menu of available personas, handles, and delegation shortcuts.
version: 1.0.0
author: Artur
tags: [menu, personas, delegation]
---

# agents-menu - Persona Menu

Use this as a quick reference to the available personas and how to hand off work.

## Personas

| Persona | Handle | Domain | Notes |
|--------|--------|--------|-------|
| Zee | @zee | Personal, coordination | Default lead persona |
| Stanley | @stanley | Trading, markets | OpenBB + Nautilus |
| Johny | @johny | Learning, study | External persona (CLI bridge) |

## Delegation

```
Ask @zee to schedule a meeting.
Ask @stanley to analyze NVDA fundamentals.
Ask @johny to build a study plan for calculus.
```

## CLI

```
agent-core --agent zee "..."
agent-core --agent stanley "..."
agent-core --agent johny "..."
```
