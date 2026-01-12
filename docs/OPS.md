# Agent-Core Operations Guide

> **CRITICAL LESSON LEARNED (2026-01-12):** The biggest source of confusion when debugging is **not knowing which binary is running**. Fixes made to source code won't take effect if:
>
> 1. You're running `bun run dev` (dev mode) instead of the compiled binary
> 2. The daemon is still running an old version
> 3. The TUI was started before the binary was updated

## Quick Reference

| Command                          | Purpose                              |
| -------------------------------- | ------------------------------------ |
| `./scripts/reload.sh`            | Full rebuild, restart daemon, verify |
| `./scripts/reload.sh --status`   | Show what's running and diagnostics  |
| `./scripts/reload.sh --no-build` | Restart without rebuild              |
| `agent-core debug status`        | CLI diagnostics (after install)      |

## The Two Execution Modes

### 1. Development Mode (`bun run dev`)

```bash
cd ~/.local/src/agent-core/packages/agent-core
bun run dev --print-logs
```

**Characteristics:**

- Runs directly from TypeScript source
- Changes take effect on restart (no build needed)
- Process shows as: `bun run dev --print-logs` or `bun run --conditions=browser ./src/index.ts`
- Useful for rapid iteration

**How to identify:**

```bash
pgrep -af "bun.*print-logs"
```

### 2. Production Mode (Compiled Binary)

```bash
~/bin/agent-core --print-logs           # TUI
~/bin/agent-core daemon --port 3210     # Daemon
```

**Characteristics:**

- Runs from compiled binary at `~/bin/agent-core`
- Requires rebuild (`bun run build`) and copy to take effect
- Process shows as: `/home/artur/bin/agent-core`
- What gets deployed and used in production

**How to identify:**

```bash
pgrep -af "/bin/agent-core"
```

## Why Fixes "Don't Take Effect"

### Root Cause Analysis

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WHY FIXES DON'T TAKE EFFECT                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  You edit: ~/.local/src/agent-core/packages/agent-core/src/foo.ts      │
│                                                                         │
│  BUT your TUI is running:                                               │
│                                                                         │
│  CASE A: bun run dev (dev mode)                                         │
│  ├── Process: bun run --conditions=browser ./src/index.ts              │
│  ├── Uses: Source files directly                                        │
│  └── Fix: Just restart the TUI                                          │
│                                                                         │
│  CASE B: ~/bin/agent-core (compiled binary)                             │
│  ├── Process: /home/artur/bin/agent-core                                │
│  ├── Uses: Bundled code from WHEN IT WAS BUILT                          │
│  └── Fix: Must rebuild, copy, then restart                              │
│                                                                         │
│  CASE C: Daemon is separate                                             │
│  ├── TUI connects to daemon via HTTP                                    │
│  ├── Daemon runs its own bundled code                                   │
│  └── Fix: Must restart daemon too                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Common Mistakes

| Mistake                                | Why It Happens                        | Fix                                 |
| -------------------------------------- | ------------------------------------- | ----------------------------------- |
| Edit source, but TUI uses old code     | Running compiled binary, not dev mode | Run `./scripts/reload.sh`           |
| Kill daemon but fixes still don't work | TUI has its own embedded code         | Kill TUI too, restart everything    |
| Binary says "Text file busy"           | Process still using the file          | Kill ALL agent-core processes first |
| Version mismatch TUI vs daemon         | Started at different times            | Restart both from same build        |

## The Reload Script

Located at: `~/.local/src/agent-core/scripts/reload.sh`

### What It Does

1. **Kills ALL agent-core processes** (daemon, TUI binary, AND dev mode)
2. **Rebuilds** from source (unless `--no-build`)
3. **Copies** new binary to `~/bin/agent-core`
4. **Starts daemon** (unless `--no-daemon`)
5. **Verifies** everything is working

### Usage

```bash
# Full reload (recommended after code changes)
./scripts/reload.sh

# Just check status
./scripts/reload.sh --status

# Restart without rebuilding (for config changes only)
./scripts/reload.sh --no-build

# Rebuild but don't start daemon
./scripts/reload.sh --no-daemon
```

### Status Output Explained

```
═══════════════════════════════════════════════════════════════
                    AGENT-CORE STATUS
═══════════════════════════════════════════════════════════════

Binary: /home/artur/bin/agent-core
[  OK  ] Exists (modified: 2026-01-12 20:17:35)    ← When binary was last updated

Processes:
[  OK  ] Daemon: PID 2454325                       ← Daemon running
[  OK  ] TUI (dev): PID 656637                     ← Dev mode TUI (bun run dev)
[  OK  ] TUI:    PID 123456                        ← Binary TUI

Daemon API: http://127.0.0.1:3210
[  OK  ] Healthy (version: 0.0.0-main-202601121917) ← Daemon version

Tool directories:
[  OK  ] /home/artur/.config/agent-core/tool (1 tools)
      - canvas.ts                                  ← Custom tools loaded

Source timestamps:
[  OK  ] transform.ts (19:05:23)                   ← Source file modification times
[ WARN ] llm.ts (19:17:00) - NEWER than binary, rebuild needed!  ← Source newer than binary!
```

## Process Hierarchy

```
When running bun run dev:

  shell
    └── bun run dev --print-logs              (PID: 656637)
          └── bun run ./src/index.ts          (PID: 656638, child)

When running compiled binary:

  shell
    └── /home/artur/bin/agent-core --print-logs  (PID: 123456)

Daemon (always compiled binary):

  nohup
    └── /home/artur/bin/agent-core daemon       (PID: 234567)
          └── (gateway subprocess if --gateway)  (PID: 234568)
```

## Debugging Checklist

When a fix doesn't take effect, check in order:

- [ ] **1. Which mode am I running?**

  ```bash
  pgrep -af "bun.*print-logs"      # Dev mode
  pgrep -af "/bin/agent-core"      # Compiled binary
  ```

- [ ] **2. What version is the daemon?**

  ```bash
  curl -s http://127.0.0.1:3210/global/health | jq .version
  ```

- [ ] **3. When was the binary built?**

  ```bash
  ls -la ~/bin/agent-core
  ```

- [ ] **4. When was the source file modified?**

  ```bash
  ls -la ~/.local/src/agent-core/packages/agent-core/src/path/to/file.ts
  ```

- [ ] **5. Is source newer than binary?**

  ```bash
  ./scripts/reload.sh --status    # Shows warnings for newer source files
  ```

- [ ] **6. Nuclear option - kill everything and restart**
  ```bash
  ./scripts/reload.sh
  ```

## Location Reference

| What              | Path                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| Source repository | `~/.local/src/agent-core`                                                              |
| Package source    | `~/.local/src/agent-core/packages/agent-core/src/`                                     |
| Compiled binary   | `~/bin/agent-core`                                                                     |
| Build output      | `~/.local/src/agent-core/packages/agent-core/dist/agent-core-linux-x64/bin/agent-core` |
| Reload script     | `~/.local/src/agent-core/scripts/reload.sh`                                            |
| Config directory  | `~/.config/agent-core/`                                                                |
| Custom tools      | `~/.config/agent-core/tool/`                                                           |
| Daemon logs       | `/tmp/agent-core-daemon.log`                                                           |

## MCP Servers Note

MCP servers (memory, calendar, portfolio) connect when the **daemon** starts. If they show "Connection closed":

1. The daemon was restarted and MCP connections were lost
2. The TUI still has stale connection handles
3. **Fix:** Restart the TUI after restarting the daemon

## Version Strings

Version format: `0.0.0-main-YYYYMMDDHHMM`

- Built from git commit at build time
- Can identify exactly when binary was built
- Compare TUI version vs daemon version to spot mismatches
