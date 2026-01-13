#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export AGENT_CORE_ROOT="$ROOT"
export AGENT_CORE_SOURCE="$ROOT"

cd "$ROOT/packages/agent-core"
exec bun dev "$@"
