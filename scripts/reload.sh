#!/usr/bin/env bash
#
# agent-core reload script
# Usage: ./scripts/reload.sh [OPTIONS]
#
# This script:
# 1. Kills all agent-core processes
# 2. Optionally cleans build artifacts (--clean or --fresh)
# 3. Rebuilds from source (unless --no-build)
# 4. Copies binary to ~/bin/agent-core
# 5. Starts daemon (unless --no-daemon)
# 6. Verifies everything is working
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
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[reload]${NC} $*"; }
ok() { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*"; }

# Parse args
NO_BUILD=false
NO_DAEMON=false
STATUS_ONLY=false
CLEAN_BUILD=false
FRESH_BUILD=false

for arg in "$@"; do
  case $arg in
    --no-build) NO_BUILD=true ;;
    --no-daemon) NO_DAEMON=true ;;
    --status) STATUS_ONLY=true ;;
    --clean) CLEAN_BUILD=true ;;
    --fresh) FRESH_BUILD=true ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --no-build   Skip rebuilding (just restart)"
      echo "  --no-daemon  Don't start daemon after reload"
      echo "  --status     Show status and diagnostics only"
      echo "  --clean      Clean build artifacts before rebuilding"
      echo "  --fresh      Full fresh build: clean + clear turbo cache + reinstall deps"
      echo ""
      echo "Examples:"
      echo "  $0                  # Normal rebuild and restart"
      echo "  $0 --status         # Just show current status"
      echo "  $0 --clean          # Clean dist/, rebuild, restart"
      echo "  $0 --fresh          # Nuclear option: purge everything, rebuild from scratch"
      echo "  $0 --no-daemon      # Rebuild but don't start daemon"
      exit 0
      ;;
  esac
done

# Clean function
do_clean() {
  log "Cleaning build artifacts..."
  
  # Clean dist directory
  if [[ -d "$PKG_DIR/dist" ]]; then
    rm -rf "$PKG_DIR/dist"
    ok "Removed $PKG_DIR/dist"
  else
    warn "No dist directory to clean"
  fi
}

# Fresh/full clean function
do_fresh_clean() {
  log "Performing FULL fresh clean..."
  
  # Clean dist
  if [[ -d "$PKG_DIR/dist" ]]; then
    rm -rf "$PKG_DIR/dist"
    ok "Removed dist/"
  fi
  
  # Clean turbo cache
  if [[ -d "$REPO_ROOT/.turbo" ]]; then
    rm -rf "$REPO_ROOT/.turbo"
    ok "Removed .turbo/ cache"
  fi
  
  # Clean node_modules/.cache
  if [[ -d "$REPO_ROOT/node_modules/.cache" ]]; then
    rm -rf "$REPO_ROOT/node_modules/.cache"
    ok "Removed node_modules/.cache"
  fi
  
  # Clean bun cache for the package
  if [[ -d "$PKG_DIR/node_modules/.cache" ]]; then
    rm -rf "$PKG_DIR/node_modules/.cache"
    ok "Removed package node_modules/.cache"
  fi
  
  # Optionally reinstall deps
  log "Reinstalling dependencies..."
  cd "$REPO_ROOT"
  if bun install 2>&1 | tail -3; then
    ok "Dependencies reinstalled"
  else
    warn "bun install had warnings (may be ok)"
  fi
}

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

# Step 1: Kill ALL agent-core related processes (be aggressive!)
log "Stopping ALL agent-core processes..."

kill_procs() {
  local pattern="$1"
  local name="$2"
  local pids=$(pgrep -f "$pattern" 2>/dev/null | grep -v $$ | grep -v "reload" || true)
  if [[ -n "$pids" ]]; then
    echo "$pids" | xargs -r kill -9 2>/dev/null || true
    ok "Killed $name (PIDs: $(echo $pids | tr '\n' ' '))"
    return 0
  fi
  return 1
}

# Kill in order of dependency
kill_procs "agent-core daemon" "daemon" || warn "No daemon to kill"
kill_procs "agent-core.*gateway" "gateway" || true
kill_procs "agent-core.*print-logs" "TUI (binary)" || true  
kill_procs "bun.*print-logs" "TUI (dev)" || true
kill_procs "bun.*agent-core" "bun agent-core" || true
kill_procs "/bin/agent-core" "agent-core binary" || true

# Wait for processes to die
sleep 1

# Nuclear option: kill ANYTHING with agent-core in the command
remaining=$(pgrep -af "agent-core" 2>/dev/null | grep -v $$ | grep -v "reload.sh" | grep -v "grep" || true)
if [[ -n "$remaining" ]]; then
  warn "Lingering processes found:"
  echo "$remaining"
  echo ""
  log "Force killing ALL remaining..."
  pgrep -f "agent-core" 2>/dev/null | grep -v $$ | grep -v "reload" | xargs -r kill -9 2>/dev/null || true
  sleep 1
fi

# Also kill any process listening on the daemon port
port_pid=$(lsof -ti:$DAEMON_PORT 2>/dev/null || true)
if [[ -n "$port_pid" ]]; then
  kill -9 $port_pid 2>/dev/null || true
  ok "Killed process on port $DAEMON_PORT (PID: $port_pid)"
fi

# Final verification
final_check=$(pgrep -af "agent-core" 2>/dev/null | grep -v $$ | grep -v "reload" || true)
if [[ -n "$final_check" ]]; then
  err "WARNING: Some processes may still be running:"
  echo "$final_check"
else
  ok "All processes stopped"
fi

# Extra wait to ensure file handles are released
sleep 2

# Step 2: Clean if requested
if $FRESH_BUILD; then
  do_fresh_clean
elif $CLEAN_BUILD; then
  do_clean
fi

# Step 3: Rebuild
if ! $NO_BUILD; then
  log "Rebuilding agent-core..."
  cd "$PKG_DIR"
  if bun run build 2>&1 | tail -10; then
    ok "Build complete"
  else
    err "Build failed!"
    exit 1
  fi
else
  warn "Skipping build (--no-build)"
fi

# Step 4: Copy binary (with retry for "Text file busy")
log "Installing binary..."
if [[ -f "$BINARY_SRC" ]]; then
  # Remove old binary first to avoid "Text file busy"
  if [[ -f "$BINARY_DST" ]]; then
    rm -f "$BINARY_DST" 2>/dev/null || true
    sleep 0.5
  fi

  # Retry copy with increasing delays
  for attempt in 1 2 3 4 5; do
    if cp "$BINARY_SRC" "$BINARY_DST" 2>/dev/null; then
      chmod +x "$BINARY_DST"
      ok "Installed to $BINARY_DST"
      break
    else
      if [[ $attempt -eq 5 ]]; then
        err "Failed to copy binary after 5 attempts (Text file busy?)"
        err "Try: rm -f $BINARY_DST && then re-run this script"
        exit 1
      fi
      warn "Copy attempt $attempt failed, retrying in ${attempt}s..."
      sleep $attempt
    fi
  done

  # Also update bun global install if it exists
  BUN_GLOBAL_BIN="$HOME/.bun/install/global/node_modules/agent-core-linux-x64/bin/agent-core"
  if [[ -f "$BUN_GLOBAL_BIN" ]]; then
    log "Updating bun global install..."
    if cp "$BINARY_SRC" "$BUN_GLOBAL_BIN" 2>/dev/null; then
      chmod +x "$BUN_GLOBAL_BIN"
      ok "Updated bun global install"
    else
      warn "Could not update bun global install (may need manual: cp $BINARY_SRC $BUN_GLOBAL_BIN)"
    fi

    # Sync .agent-core configs to bun global install
    # Use SOURCE config (not dist) because dist strips MCP command arrays for distribution
    BUN_GLOBAL_CONFIG="$HOME/.bun/install/global/node_modules/agent-core-linux-x64/.agent-core"
    SOURCE_CONFIG="$REPO_ROOT/.agent-core"
    if [[ -d "$SOURCE_CONFIG" ]] && [[ -d "$BUN_GLOBAL_CONFIG" ]]; then
      # Copy config file (preserves full MCP commands for local dev)
      cp "$SOURCE_CONFIG/agent-core.jsonc" "$BUN_GLOBAL_CONFIG/" 2>/dev/null && ok "Synced agent-core.jsonc (from source)"
      # Copy tools if they exist
      if [[ -d "$SOURCE_CONFIG/tool" ]]; then
        mkdir -p "$BUN_GLOBAL_CONFIG/tool"
        cp -r "$SOURCE_CONFIG/tool"/* "$BUN_GLOBAL_CONFIG/tool/" 2>/dev/null && ok "Synced tools"
      fi
      # Copy agents if they exist
      if [[ -d "$SOURCE_CONFIG/agent" ]]; then
        mkdir -p "$BUN_GLOBAL_CONFIG/agent"
        cp -r "$SOURCE_CONFIG/agent"/* "$BUN_GLOBAL_CONFIG/agent/" 2>/dev/null && ok "Synced agents"
      fi
    else
      warn "Could not sync configs (source: $SOURCE_CONFIG, dest: $BUN_GLOBAL_CONFIG)"
    fi
  fi
else
  err "Binary not found at $BINARY_SRC"
  exit 1
fi

# Step 5: Start daemon
if ! $NO_DAEMON; then
  # Kill any daemon that may have started during build
  log "Ensuring no daemon is running..."
  "$BINARY_DST" daemon-stop 2>/dev/null || true
  sleep 1
  
  # Kill by port as final measure
  port_pid=$(lsof -ti:$DAEMON_PORT 2>/dev/null || true)
  if [[ -n "$port_pid" ]]; then
    kill -9 $port_pid 2>/dev/null || true
    ok "Killed process on port $DAEMON_PORT"
    sleep 1
  fi
  
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
