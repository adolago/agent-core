#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
IMAGE_NAME="${ZEEBOT_IMAGE:-zeebot:local}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

require_cmd docker
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose not available (try: docker compose version)" >&2
  exit 1
fi

mkdir -p "${ZEEBOT_CONFIG_DIR:-$HOME/.zeebot}"
mkdir -p "${ZEEBOT_WORKSPACE_DIR:-$HOME/zee}"

export ZEEBOT_CONFIG_DIR="${ZEEBOT_CONFIG_DIR:-$HOME/.zeebot}"
export ZEEBOT_WORKSPACE_DIR="${ZEEBOT_WORKSPACE_DIR:-$HOME/zee}"
export ZEEBOT_GATEWAY_PORT="${ZEEBOT_GATEWAY_PORT:-18789}"
export ZEEBOT_BRIDGE_PORT="${ZEEBOT_BRIDGE_PORT:-18790}"
export ZEEBOT_GATEWAY_BIND="${ZEEBOT_GATEWAY_BIND:-lan}"
export ZEEBOT_IMAGE="$IMAGE_NAME"

if [[ -z "${ZEEBOT_GATEWAY_TOKEN:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    ZEEBOT_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  else
    ZEEBOT_GATEWAY_TOKEN="$(python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)"
  fi
fi
export ZEEBOT_GATEWAY_TOKEN

ENV_FILE="$ROOT_DIR/.env"
upsert_env() {
  local file="$1"
  shift
  local -a keys=("$@")
  local tmp
  tmp="$(mktemp)"
  declare -A seen=()

  if [[ -f "$file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      local key="${line%%=*}"
      local replaced=false
      for k in "${keys[@]}"; do
        if [[ "$key" == "$k" ]]; then
          printf '%s=%s\n' "$k" "${!k}" >>"$tmp"
          seen["$k"]=1
          replaced=true
          break
        fi
      done
      if [[ "$replaced" == false ]]; then
        printf '%s\n' "$line" >>"$tmp"
      fi
    done <"$file"
  fi

  for k in "${keys[@]}"; do
    if [[ -z "${seen[$k]:-}" ]]; then
      printf '%s=%s\n' "$k" "${!k}" >>"$tmp"
    fi
  done

  mv "$tmp" "$file"
}

upsert_env "$ENV_FILE" \
  ZEEBOT_CONFIG_DIR \
  ZEEBOT_WORKSPACE_DIR \
  ZEEBOT_GATEWAY_PORT \
  ZEEBOT_BRIDGE_PORT \
  ZEEBOT_GATEWAY_BIND \
  ZEEBOT_GATEWAY_TOKEN \
  ZEEBOT_IMAGE

echo "==> Building Docker image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo ""
echo "==> Onboarding (interactive)"
echo "When prompted:"
echo "  - Gateway bind: lan"
echo "  - Gateway auth: token"
echo "  - Gateway token: $ZEEBOT_GATEWAY_TOKEN"
echo "  - Tailscale exposure: Off"
echo "  - Install Gateway daemon: No"
echo ""
docker compose -f "$COMPOSE_FILE" run --rm zeebot-cli onboard

echo ""
echo "==> Provider setup (optional)"
echo "WhatsApp (QR):"
echo "  docker compose -f $COMPOSE_FILE run --rm zeebot-cli providers login"
echo "Telegram (bot token):"
echo "  docker compose -f $COMPOSE_FILE run --rm zeebot-cli providers add --provider telegram --token <token>"
echo "Discord (bot token):"
echo "  docker compose -f $COMPOSE_FILE run --rm zeebot-cli providers add --provider discord --token <token>"
echo "Docs: https://docs.zee.bot/providers"

echo ""
echo "==> Starting gateway"
docker compose -f "$COMPOSE_FILE" up -d zeebot-gateway

echo ""
echo "Gateway running with host port mapping."
echo "Access from tailnet devices via the host's tailnet IP."
echo "Config: $ZEEBOT_CONFIG_DIR"
echo "Workspace: $ZEEBOT_WORKSPACE_DIR"
echo "Token: $ZEEBOT_GATEWAY_TOKEN"
echo ""
echo "Commands:"
echo "  docker compose -f $COMPOSE_FILE logs -f zeebot-gateway"
echo "  docker compose -f $COMPOSE_FILE exec zeebot-gateway node dist/index.js health --token \"$ZEEBOT_GATEWAY_TOKEN\""
