#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Clear stale daemon socket to ensure standalone mode
unset AGENT_CORE_IPC_SOCKET

export AGENT_CORE_ROOT="$ROOT"
export AGENT_CORE_SOURCE="$ROOT"

cd "$ROOT/packages/agent-core"
exec bun dev "$@"
