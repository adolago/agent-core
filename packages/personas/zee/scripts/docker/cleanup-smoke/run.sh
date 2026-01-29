#!/usr/bin/env bash
set -euo pipefail

cd /repo

export CLAWDBOT_STATE_DIR="/tmp/zee-test"
export CLAWDBOT_CONFIG_PATH="${CLAWDBOT_STATE_DIR}/zee.json"

echo "==> Seed state"
mkdir -p "${CLAWDBOT_STATE_DIR}/credentials"
mkdir -p "${CLAWDBOT_STATE_DIR}/agents/main/sessions"
echo '{}' >"${CLAWDBOT_CONFIG_PATH}"
echo 'creds' >"${CLAWDBOT_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${CLAWDBOT_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm zee reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${CLAWDBOT_CONFIG_PATH}"
test ! -d "${CLAWDBOT_STATE_DIR}/credentials"
test ! -d "${CLAWDBOT_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${CLAWDBOT_STATE_DIR}/credentials"
echo '{}' >"${CLAWDBOT_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm zee uninstall --state --yes --non-interactive

test ! -d "${CLAWDBOT_STATE_DIR}"

echo "OK"
