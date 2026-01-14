# Alpha Release TODO (CLI Scope)

Target: `dev` branch only. Scope is CLI + daemon; desktop/VS Code excluded.

## Release Readiness (Done)

- [x] Align release artifacts with `agent-core` binary naming (publish, Docker, postinstall).
- [x] Update registry publishing targets to `agent-core` (AUR/Homebrew formula naming).
- [x] Update installation/upgrade/uninstall commands to `agent-core` package names.
- [x] Fix user-facing MCP hints to use `agent-core` commands.
- [x] Update bug report template and TUI issue link to `adolago/agent-core`.
- [x] Standardize CLI-generated URLs/docs links to Agent-Core repo docs.
- [x] Refresh Zee coding-agent skill to use `agent-core` binary.
- [x] Update Stanley AI integration docs to reference Agent-Core (fork of OpenCode).

## Cross-Repo Integration (Done)

- [x] Ensure Zee references agent-core daemon usage for CLI scope.
- [x] Ensure Stanley AI architecture docs reference Agent-Core fork.
- [x] Confirm Johny README already points to agent-core daemon.

## Manual Verification (Run When Releasing)

- [x] `cd packages/agent-core && bun run typecheck`
- [x] `cd packages/agent-core && bun test`
- [x] `cd packages/agent-core && bun run build`
- [ ] `cd packages/agent-core && bun run script/publish.ts --preview` (requires npm publish 2FA or a granular token with 2FA bypass; otherwise E403; hit npm rate limit E429 on `agent-core-linux-arm64`, retry later)

## Alpha Scope Notes

- CLI only for alpha; desktop/VS Code are out of scope.
- Upstream references to OpenCode remain for compatibility where required.
- Google Antigravity OAuth requires the `opencode-google-auth` plugin (no built-in flow).

## Always-On Reliability (Done)

- [x] Gateway supervised by agent-core (single source of truth).
- [x] Gateway health probe + backoff restart in daemon.
- [x] Gateway diagnostics in `agent-core status` + `agent-core check`.

## Upstream Move Checklist (Pending)

- [ ] Run `./scripts/check-upstream.sh --fetch` and capture divergence report.
- [ ] Verify upstream does not reintroduce standalone gateway/council code paths.
- [x] Confirm `opencode-google-auth` plugin requirement (no built-in Antigravity OAuth).

## Alpha Release Notes (Draft)

- Always-on daemon owns the messaging gateway with health probes and auto-restart.
- Qdrant + embeddings (including Nebius) are configured via agent-core config, not env scripts.
- Google Antigravity OAuth is plugin-only (`opencode-google-auth`).
- Install: `agent-core plugin install opencode-google-auth` → `agent-core auth login` (select Google).
