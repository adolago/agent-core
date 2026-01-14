#!/usr/bin/env bash
set -euo pipefail

AGENT_BIN="${AGENT_BIN:-$HOME/.local/bin/agent-core}"
AGENT_CORE_BIN_PATH="${AGENT_CORE_BIN_PATH:-$HOME/.local/src/agent-core/packages/agent-core/dist/agent-core-linux-x64/bin/agent-core}"
REPORT_DIR="${REPORT_DIR:-/tmp/agent-core-beta}"
REPORT_FILE="$REPORT_DIR/report.txt"
BUG_REPORT_PATH="$REPORT_DIR/bug-report.tar.gz"

mkdir -p "$REPORT_DIR"
: > "$REPORT_FILE"

log() {
  printf '%s\n' "$*" | tee -a "$REPORT_FILE"
}

log "Agent-Core beta readiness"
log "date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "agent_bin: $AGENT_BIN"
log "agent_core_bin_path: $AGENT_CORE_BIN_PATH"
log "report_dir: $REPORT_DIR"
log ""

if [[ ! -x "$AGENT_BIN" ]]; then
  log "ERROR: agent-core binary not found or not executable: $AGENT_BIN"
  exit 1
fi
if [[ ! -x "$AGENT_CORE_BIN_PATH" ]]; then
  log "ERROR: agent-core native binary not found or not executable: $AGENT_CORE_BIN_PATH"
  exit 1
fi

log "# Version"
AGENT_CORE_BIN_PATH="$AGENT_CORE_BIN_PATH" "$AGENT_BIN" --version | tee -a "$REPORT_FILE"
log ""

log "# Config & repo checks"
log "config.json: $HOME/.config/agent-core/config.json"
log "agent-core.jsonc: $HOME/.config/agent-core/agent-core.jsonc"
log "skills root: $HOME/.config/agent-core/skills -> $(readlink -f "$HOME/.config/agent-core/skills")"
log "personas root: $HOME/.local/src/agent-core/vendor/personas"
log ""

log "# Diagnostic check (runtime + config only)"
AGENT_CORE_BIN_PATH="$AGENT_CORE_BIN_PATH" "$AGENT_BIN" check --category runtime --category config --minimal --timeout 5000 | tee -a "$REPORT_FILE"
log ""

log "# Bug report (non-interactive, diagnostics skipped)"
AGENT_CORE_BIN_PATH="$AGENT_CORE_BIN_PATH" "$AGENT_BIN" bug-report --skip-diagnostics --non-interactive --log-lines 5 -o "$BUG_REPORT_PATH" | tee -a "$REPORT_FILE"
log ""

log "# Done"
log "report: $REPORT_FILE"
log "bug_report: $BUG_REPORT_PATH"
