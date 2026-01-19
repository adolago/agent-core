# Testing

## Automated (Non-UI)

Run from repo root:

```bash
cd packages/agent-core
bun test
bun run typecheck
```

## Manual (TUI / UI)

Run from repo root:

```bash
cd packages/agent-core
bun dev
```

Smoke checklist:

- TUI launches and renders without crashing.
- `Ctrl+X H` toggles `HOLD`/`RELEASE` mode.
- `Ctrl+T` cycles model variants (for models that define variants).
- Provider dialog accepts an API key and shows success toast.
- Canvas tools render in WezTerm: prompt Zee to use `canvas_canvasSpawn` and verify a right-side pane appears/updates (set `AGENT_CORE_CANVAS_WEZTERM=0` to force inline fallback).

## Latest Run (2026-01-17)

- `cd packages/agent-core && bun test` (pass)
- `cd packages/agent-core && bun run typecheck` (pass)
- `cd packages/agent-core && bun dev` (launched TUI)
