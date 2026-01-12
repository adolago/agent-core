#!/usr/bin/env bash
#
# agent-core reload script
# Usage: ./scripts/reload.sh [--no-build] [--no-daemon] [--status]
#
# This script:
# 1. Kills all agent-core processes
# 2. Rebuilds from source (unless --no-build)
# 3. Copies binary to ~/bin/agent-core
# 4. Starts daemon (unless --no-daemon)
# 5. Verifies everything is working
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
PKG_DIR="$REPO_ROOT/packages/agent-core"
BINARY_SRC="$PKG_DIR/dist/agent-core-linux-x64/bin/agent-core"
BINARY_DST="$HOME/bin/agent-core"
DAEMON_PORT="${AGENT_CORE_PORT:-3210}"
DAEMON_HOST="${AGENT_CORE_HOST:-127.0.0.1}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[reload]${NC} $*"; }
ok() { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*"; }

# Parse args
NO_BUILD=false
NO_DAEMON=false
STATUS_ONLY=false

for arg in "$@"; do
  case $arg in
    --no-build) NO_BUILD=true ;;
    --no-daemon) NO_DAEMON=true ;;
    --status) STATUS_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--no-build] [--no-daemon] [--status]"
      echo ""
      echo "Options:"
      echo "  --no-build   Skip rebuilding (just restart)"
      echo "  --no-daemon  Don't start daemon after reload"
      echo "  --status     Show status and diagnostics only"
      exit 0
      ;;
  esac
done

# Status/diagnostics function
show_status() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "                    AGENT-CORE STATUS"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  # Binary info
  echo "Binary: $BINARY_DST"
  if [[ -f "$BINARY_DST" ]]; then
    local mod_time=$(stat -c "%Y" "$BINARY_DST" 2>/dev/null || stat -f "%m" "$BINARY_DST" 2>/dev/null)
    local mod_date=$(date -d "@$mod_time" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -r "$mod_time" "+%Y-%m-%d %H:%M:%S" 2>/dev/null)
    ok "Exists (modified: $mod_date)"
  else
    err "Not found"
  fi
  echo ""

  # Running processes
  echo "Processes:"
  local procs=$(pgrep -af "agent-core|bun.*print-logs" 2>/dev/null | grep -v "reload.sh" | grep -v "pgrep" || true)
  if [[ -n "$procs" ]]; then
    echo "$procs" | while read -r line; do
      local pid=$(echo "$line" | awk '{print $1}')
      local cmd=$(echo "$line" | cut -d' ' -f2-)
      if [[ "$cmd" == *"daemon"* ]]; then
        ok "Daemon: PID $pid"
      elif [[ "$cmd" == *"bun"*"print-logs"* ]]; then
        ok "TUI (dev): PID $pid"
      elif [[ "$cmd" == *"print-logs"* ]] || [[ "$cmd" == *"/bin/agent-core" ]]; then
        ok "TUI:    PID $pid"
      else
        echo "  Other:  PID $pid - $cmd"
      fi
    done
  else
    warn "No agent-core processes running"
  fi
  echo ""

  # Daemon health
  echo "Daemon API: http://$DAEMON_HOST:$DAEMON_PORT"
  local health=$(curl -sf "http://$DAEMON_HOST:$DAEMON_PORT/global/health" 2>/dev/null || echo "")
  if [[ -n "$health" ]]; then
    local version=$(echo "$health" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    ok "Healthy (version: $version)"
  else
    warn "Not responding"
  fi
  echo ""

  # Tool directories
  echo "Tool directories:"
  for dir in "$HOME/.config/agent-core/tool" "$REPO_ROOT/.agent-core/tool"; do
    if [[ -d "$dir" ]]; then
      local count=$(ls -1 "$dir"/*.ts 2>/dev/null | wc -l || echo 0)
      ok "$dir ($count tools)"
      ls -1 "$dir"/*.ts 2>/dev/null | while read -r f; do
        echo "      - $(basename "$f")"
      done
    else
      echo "  $dir (not found)"
    fi
  done
  echo ""

  # Source vs binary timestamps
  echo "Source timestamps:"
  local src_files=(
    "$PKG_DIR/src/provider/transform.ts"
    "$PKG_DIR/src/provider/provider.ts"
    "$PKG_DIR/src/server/server.ts"
    "$PKG_DIR/src/session/llm.ts"
  )
  local binary_time=$(stat -c "%Y" "$BINARY_DST" 2>/dev/null || echo 0)
  for src in "${src_files[@]}"; do
    if [[ -f "$src" ]]; then
      local src_time=$(stat -c "%Y" "$src" 2>/dev/null || echo 0)
      local src_date=$(date -d "@$src_time" "+%H:%M:%S" 2>/dev/null || date -r "$src_time" "+%H:%M:%S" 2>/dev/null)
      local name=$(basename "$src")
      if [[ $src_time -gt $binary_time ]]; then
        warn "$name ($src_date) - NEWER than binary, rebuild needed!"
      else
        ok "$name ($src_date)"
      fi
    fi
  done
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
}

if $STATUS_ONLY; then
  show_status
  exit 0
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                   AGENT-CORE RELOAD"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Kill all agent-core processes
log "Stopping all agent-core processes..."

# Kill daemon
if pgrep -f "agent-core daemon" > /dev/null 2>&1; then
  pkill -9 -f "agent-core daemon" 2>/dev/null
  ok "Killed daemon"
else
  warn "No daemon to kill"
fi

# Kill TUI processes (compiled binary)
if pgrep -f "agent-core.*print-logs" > /dev/null 2>&1; then
  pkill -9 -f "agent-core.*print-logs" 2>/dev/null
  ok "Killed TUI (binary)"
else
  warn "No binary TUI to kill"
fi

# Kill dev mode TUI (bun run dev)
if pgrep -f "bun.*print-logs" > /dev/null 2>&1; then
  pkill -9 -f "bun.*print-logs" 2>/dev/null
  ok "Killed TUI (dev mode)"
else
  warn "No dev TUI to kill"
fi

# Give processes time to die
sleep 1

# Verify nothing is running
remaining=$(pgrep -f "agent-core" 2>/dev/null | grep -v $$ | grep -v "reload" || true)
if [[ -n "$remaining" ]]; then
  warn "Some processes still running, force killing..."
  echo "$remaining" | xargs -r kill -9 2>/dev/null || true
  sleep 1
fi
ok "All processes stopped"

# Step 2: Rebuild
if ! $NO_BUILD; then
  log "Rebuilding agent-core..."
  cd "$PKG_DIR"
  if bun run build 2>&1 | tail -5; then
    ok "Build complete"
  else
    err "Build failed!"
    exit 1
  fi
else
  warn "Skipping build (--no-build)"
fi

# Step 3: Copy binary
log "Installing binary..."
if [[ -f "$BINARY_SRC" ]]; then
  cp "$BINARY_SRC" "$BINARY_DST"
  chmod +x "$BINARY_DST"
  ok "Installed to $BINARY_DST"
else
  err "Binary not found at $BINARY_SRC"
  exit 1
fi

# Step 4: Start daemon
if ! $NO_DAEMON; then
  log "Starting daemon..."
  nohup "$BINARY_DST" daemon --hostname "$DAEMON_HOST" --port "$DAEMON_PORT" --gateway > /tmp/agent-core-daemon.log 2>&1 &
  DAEMON_PID=$!
  sleep 2

  # Verify daemon started
  if kill -0 "$DAEMON_PID" 2>/dev/null; then
    # Check health endpoint
    for i in {1..5}; do
      health=$(curl -sf "http://$DAEMON_HOST:$DAEMON_PORT/global/health" 2>/dev/null || echo "")
      if [[ -n "$health" ]]; then
        version=$(echo "$health" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        ok "Daemon started (PID: $DAEMON_PID, version: $version)"
        break
      fi
      sleep 1
    done
    if [[ -z "$health" ]]; then
      warn "Daemon started but health check failed"
    fi
  else
    err "Daemon failed to start! Check /tmp/agent-core-daemon.log"
    tail -20 /tmp/agent-core-daemon.log
    exit 1
  fi
else
  warn "Skipping daemon start (--no-daemon)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "                      RELOAD COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
show_status
