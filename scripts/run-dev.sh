#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Clear stale daemon socket
unset AGENT_CORE_IPC_SOCKET

# Point everything to the repo - no external config needed
export AGENT_CORE_ROOT="$ROOT"
export AGENT_CORE_SOURCE="$ROOT"
export XDG_CONFIG_HOME="$ROOT/.dev-config"

# Create minimal dev config that uses repo paths
mkdir -p "$XDG_CONFIG_HOME/agent-core"
cat > "$XDG_CONFIG_HOME/agent-core/config.json" << EOF
{
  "plugin": [
    "opencode-antigravity-auth@1.2.8",
    "file://$ROOT/packages/anthropic-auth/index.mjs"
  ]
}
EOF

# Symlink to real auth tokens
ln -sf "$HOME/.local/share/agent-core/auth.json" "$XDG_CONFIG_HOME/agent-core/auth.json" 2>/dev/null || true

cd "$ROOT/packages/agent-core"
exec bun dev "$@"
