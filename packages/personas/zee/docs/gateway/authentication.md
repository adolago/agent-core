---
summary: "Model authentication: OAuth, API keys, and Claude Code token reuse"
read_when:
  - Debugging model auth or OAuth expiry
  - Documenting authentication or credential storage
---
# Authentication

Zee supports OAuth and API keys for model providers. For Anthropic
accounts, we recommend using an **API key**. Zee can also reuse Claude Code
credentials, including the long‑lived token created by `claude setup-token`.

See [/concepts/oauth](/concepts/oauth) for the full OAuth flow and storage
layout.

## Recommended Anthropic setup (API key)

If you’re using Anthropic directly, use an API key.

1) Create an API key in the Anthropic Console.
2) Put it on the **gateway host** (the machine running `zee gateway`).

```bash
export ANTHROPIC_API_KEY="..."
zee models status
```

3) If the Gateway runs under systemd/launchd, prefer putting the key in
`~/.zee/.env` so the daemon can read it:

```bash
cat >> ~/.zee/.env <<'EOF'
ANTHROPIC_API_KEY=...
EOF
```

Then restart the daemon (or restart your Gateway process) and re-check:

```bash
zee models status
zee doctor
```

If you’d rather not manage env vars yourself, the onboarding wizard can store
API keys for daemon use: `zee onboard`.

See [Help](/help) for details on env inheritance (`env.shellEnv`,
`~/.zee/.env`, systemd/launchd).

## Anthropic: Claude Code CLI setup-token (supported)

For Anthropic, the recommended path is an **API key**. If you’re already using
Claude Code CLI, the setup-token flow is also supported.
Run it on the **gateway host**:

```bash
claude setup-token
```

Then verify and sync into Zee:

```bash
zee models status
zee doctor
```

This should create (or refresh) an auth profile like `anthropic:claude-cli` in
the agent auth store.

Zee config sets `auth.profiles["anthropic:claude-cli"].mode` to `"oauth"` so
the profile accepts both OAuth and setup-token credentials. Older configs that
used `"token"` are auto-migrated on load.

If you see an Anthropic error like:

```
This credential is only authorized for use with Claude Code and cannot be used for other API requests.
```

…use an Anthropic API key instead.

Alternative: run the wrapper (also updates Zee config):

```bash
zee models auth setup-token --provider anthropic
```

Manual token entry (any provider; writes `auth-profiles.json` + updates config):

```bash
zee models auth paste-token --provider anthropic
zee models auth paste-token --provider openrouter
```

Automation-friendly check (exit `1` when expired/missing, `2` when expiring):

```bash
zee models status --check
```

Optional ops scripts (systemd/Termux) are documented here:
[/automation/auth-monitoring](/automation/auth-monitoring)

`zee models status` loads Claude Code credentials into Zee’s
`auth-profiles.json` and shows expiry (warns within 24h by default).
`zee doctor` also performs the sync when it runs.

> `claude setup-token` requires an interactive TTY.

## Checking model auth status

```bash
zee models status
zee doctor
```

## Controlling which credential is used

### Per-session (chat command)

Use `/model <alias-or-id>@<profileId>` to pin a specific provider credential for the current session (example profile ids: `anthropic:claude-cli`, `anthropic:default`).

Use `/model` (or `/model list`) for a compact picker; use `/model status` for the full view (candidates + next auth profile, plus provider endpoint details when configured).

### Per-agent (CLI override)

Set an explicit auth profile order override for an agent (stored in that agent’s `auth-profiles.json`):

```bash
zee models auth order get --provider anthropic
zee models auth order set --provider anthropic anthropic:claude-cli
zee models auth order clear --provider anthropic
```

Use `--agent <id>` to target a specific agent; omit it to use the configured default agent.

## How sync works

1. **Claude Code** stores credentials in `~/.claude/.credentials.json` (or
   Keychain on macOS).
2. **Zee** syncs those into
   `~/.zee/agents/<agentId>/agent/auth-profiles.json` when the auth store is
   loaded.
3. Refreshable OAuth profiles can be refreshed automatically on use. Static
   token profiles (including Claude Code CLI setup-token) are not refreshable by
   Zee.

## Troubleshooting

### “No credentials found”

If the Anthropic token profile is missing, run `claude setup-token` on the
**gateway host**, then re-check:

```bash
zee models status
```

### Token expiring/expired

Run `zee models status` to confirm which profile is expiring. If the profile
is `anthropic:claude-cli`, rerun `claude setup-token`.

## Requirements

- Claude Max or Pro subscription (for `claude setup-token`)
- Claude Code CLI installed (`claude` command available)
