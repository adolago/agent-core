#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Clear stale daemon socket to ensure standalone mode
unset AGENT_CORE_IPC_SOCKET

TARGET="${AGENT_CORE_TARGET:-}"
if [[ -z "$TARGET" ]]; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$os" in
    linux|darwin) ;;
    msys*|mingw*|cygwin*) os="windows" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
  esac

  TARGET="${os}-${arch}"
fi

DIST_DIR="${AGENT_CORE_DIST:-$ROOT/packages/agent-core/dist/agent-core-${TARGET}}"
BIN_PATH="${AGENT_CORE_BIN:-$DIST_DIR/bin/agent-core}"

if [[ ! -x "$BIN_PATH" ]]; then
  echo "Binary not found: $BIN_PATH" >&2
  echo "Build it first, or set AGENT_CORE_TARGET/AGENT_CORE_DIST/AGENT_CORE_BIN." >&2
  exit 1
fi

export AGENT_CORE_ROOT="$DIST_DIR"
exec "$BIN_PATH" "$@"
