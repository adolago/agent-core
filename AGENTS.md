- To test agent-core in `packages/agent-core`, run `bun dev`.
- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
## Binary Installation

**Single source of truth**: The `agent-core` binary is installed via `bun link` from `packages/agent-core/`.

To reinstall after building:
```bash
cd packages/agent-core && bun link
```

This creates a symlink at `~/.bun/bin/agent-core` → dev build.

**Do NOT** install agent-core via:
- `~/bin/agent-core` (manual copy)
- `~/.local/bin/agent-core` (separate symlink)
- `curl ... | sh` installer (creates `~/.opencode/bin/`)
