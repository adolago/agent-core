# Environment Variables Reference

Complete reference for environment variables across the agent-core ecosystem.

---

## Agent-Core (Engine)

### Core Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_CORE` | Set to `1` | Automatically set when agent-core is running |
| `AGENT` | Set to `1` | Indicates agent mode is active |
| `OPENCODE` | Set to `1` | Backwards compatibility flag |
| `AGENT_CORE_ROOT` | - | Override the agent-core installation root directory |
| `AGENT_CORE_TEST_HOME` | - | Override home directory for testing |
| `AGENT_CORE_ORIGINAL_PWD` | - | Original working directory before agent-core started |

### Daemon

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_CORE_DAEMON_PORT` | `3456` | HTTP port for the daemon API |
| `AGENT_CORE_URL` | `http://127.0.0.1:3210` | Full URL to daemon |
| `AGENT_CORE_WEZTERM_ENABLED` | - | Enable WezTerm integration (`true`/`false`) |
| `PERSONAS_WEZTERM_ENABLED` | - | Alias for WezTerm integration |
| `PERSONAS_LEAD_PERSONA` | `zee` | Default persona when none specified |

### Shell & Terminal

| Variable | Default | Description |
|----------|---------|-------------|
| `SHELL` | - | User's default shell (used for bash tool) |
| `COMSPEC` | `cmd.exe` | Windows command interpreter |
| `DISPLAY` | - | X11 display (Linux, checked for WezTerm) |
| `WAYLAND_DISPLAY` | - | Wayland display (Linux, checked for WezTerm) |
| `TMUX` | - | Indicates running inside tmux |
| `WEZTERM_PANE` | - | WezTerm pane ID when running in WezTerm |
| `WEZTERM_EXECUTABLE` | - | Path to WezTerm executable |

### Network & Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `HTTP_PROXY` | - | HTTP proxy URL |
| `HTTPS_PROXY` | - | HTTPS proxy URL |
| `http_proxy` | - | HTTP proxy URL (lowercase variant) |
| `https_proxy` | - | HTTPS proxy URL (lowercase variant) |

### XDG Directories

| Variable | Default | Description |
|----------|---------|-------------|
| `XDG_CONFIG_HOME` | `~/.config` | Config directory |
| `XDG_DATA_HOME` | `~/.local/share` | Data directory |
| `XDG_STATE_HOME` | `~/.local/state` | State directory |
| `XDG_CACHE_HOME` | `~/.cache` | Cache directory |

---

## Memory & Embeddings

Prefer `agent-core.json(c)` for Qdrant and embedding settings. Qdrant connection settings are config-only.

### Embedding Providers

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | OpenAI API key for embeddings (text-embedding-3-small) |
| `NEBIUS_API_KEY` | - | Nebius API key for OpenAI-compatible embeddings (Qwen3) |
| `GOOGLE_API_KEY` | - | Google API key for embeddings (text-embedding-004) |
| `GEMINI_API_KEY` | - | Alternate Google API key name |
| `VOYAGE_API_KEY` | - | Voyage AI API key for embeddings (alternative) |

---

## LLM Providers

### Anthropic

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | Anthropic API key for Claude models |

### OpenAI

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | OpenAI API key for GPT models and embeddings |

### OpenRouter

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_API_KEY` | - | OpenRouter API key for multi-model routing |

### GitHub Copilot

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | - | GitHub token for Copilot authentication |
| `GH_TOKEN` | - | Alternative GitHub token |

---

## Zee (Personal Assistant)

### Gateway Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ZEE_GATEWAY_PORT` | - | Gateway HTTP port |
| `ZEE_GATEWAY_LOCK` | - | Lock file path for gateway |
| `ZEE_GATEWAY_PASSWORD` | - | Gateway authentication password |
| `ZEE_SKIP_PROVIDERS` | - | Skip specific messaging providers |
| `ZEE_SKIP_GMAIL_WATCHER` | - | Disable Gmail watcher |
| `ZEE_TEST_HOME` | - | Override home for testing |
| `ZEE_CONTROL_UI_BASE_PATH` | - | Base path for control UI |

### Messaging Providers

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_TOKEN` | - | WhatsApp Business API token |
| `WHATSAPP_PHONE_ID` | - | WhatsApp phone ID |
| `TELEGRAM_BOT_TOKEN` | - | Telegram bot token |

### Search

| Variable | Default | Description |
|----------|---------|-------------|
| `BRAVE_API_KEY` | - | Brave Search API key |

---

## Stanley (Financial Platform)

### API Server

| Variable | Default | Description |
|----------|---------|-------------|
| `STANLEY_API_URL` | `http://localhost:8000` | Stanley API base URL |
| `STANLEY_DEV_MODE` | `false` | Enable development mode (relaxed auth) |
| `STANLEY_REDIS_URL` | - | Redis URL for caching |
| `REDIS_URL` | - | Alternative Redis URL |
| `DEBUG` | - | Enable debug mode (exposes error details) |

### Authentication (JWT)

| Variable | Default | Description |
|----------|---------|-------------|
| `STANLEY_AUTH_JWT_SECRET_KEY` | - | JWT signing key (production) |
| `JWT_SECRET_KEY` | - | Alternative JWT signing key |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `JWT_ISSUER` | `stanley-api` | JWT issuer claim |
| `JWT_AUDIENCE` | `stanley-client` | JWT audience claim |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token TTL |
| `STANLEY_AUTH_RATE_LIMIT_ENABLED` | `true` | Enable auth rate limiting |

### Wide Events (Observability)

| Variable | Default | Description |
|----------|---------|-------------|
| `STANLEY_WIDE_EVENTS_ENABLED` | `1` | Enable wide event logging |
| `STANLEY_WIDE_EVENTS_SAMPLE_RATE` | `0.02` | Sample rate (2%) |
| `STANLEY_WIDE_EVENTS_SLOW_MS` | `2000` | Slow request threshold (ms) |
| `STANLEY_WIDE_EVENTS_PAYLOADS` | `debug` | Payload logging level |
| `STANLEY_WIDE_EVENTS_DIR` | - | Custom events directory |
| `STANLEY_WIDE_EVENTS_FILE` | - | Custom events file |

### Financial Data Providers

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENBB_API_KEY` | - | OpenBB API key |
| `OPENBB_PAT` | - | OpenBB personal access token |
| `OPENBB_TOKEN` | - | Alternative OpenBB token |
| `STANLEY_OPENBB_PROVIDER` | `yfinance` | Default OpenBB data provider |
| `ALPHA_VANTAGE_API_KEY` | - | Alpha Vantage API key |
| `YAHOO_FINANCE_KEY` | - | Yahoo Finance API key |
| `PLAID_CLIENT_ID` | - | Plaid client ID |
| `PLAID_SECRET` | - | Plaid secret |
| `TERRAPIN_API_KEY` | - | Terrapin bonds API key |

### Prediction Markets

| Variable | Default | Description |
|----------|---------|-------------|
| `DOME_API_KEY` | - | Dome prediction markets API key |
| `DOME_API_TOKEN` | - | Alternative Dome token |
| `DOME_API_BASE_URL` | `https://api.domeapi.io/v1` | Dome API base URL |
| `DOME_API_TIMEOUT` | `20` | Request timeout (seconds) |

### SEC Filings

| Variable | Default | Description |
|----------|---------|-------------|
| `SEC_IDENTITY` | `stanley-research@example.com` | SEC EDGAR identity |

### Portfolio

| Variable | Default | Description |
|----------|---------|-------------|
| `STANLEY_PORTFOLIO_FILE` | `~/.zee/stanley/portfolio.json` | Portfolio file path |
| `STANLEY_REPO` | `~/.local/src/agent-core/vendor/personas/stanley` | Stanley repo path |
| `STANLEY_CLI` | `$STANLEY_REPO/scripts/stanley_cli.py` | CLI script path |
| `STANLEY_PYTHON` | Auto-detect venv or `python3` | Python interpreter |

---

## Johny (Learning System)

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JOHNY_REPO` | `~/.local/src/agent-core/vendor/personas/johny` | Johny repo path |
| `JOHNY_CLI` | `$JOHNY_REPO/scripts/johny_cli.py` | CLI script path |
| `JOHNY_PYTHON` | Auto-detect venv or `python3` | Python interpreter |

---

## Tiara (Orchestration - vendor/tiara)

### Debug & Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_FLOW_DEBUG` | `false` | Enable debug logging |
| `LOG_LEVEL` | `info` | Log level: `error`, `warn`, `info`, `debug` |
| `NODE_ENV` | `development` | Environment: `development`, `production`, `test` |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_FLOW_DB_PATH` | `.swarm/memory.db` | SQLite database path |
| `AGENTDB_PATH` | - | AgentDB database path |

### Features

| Variable | Default | Description |
|----------|---------|-------------|
| `FEATURE_AGENTDB` | `false` | Enable AgentDB feature |
| `CLAUDE_FLOW_SEMANTIC_SEARCH` | `false` | Enable semantic search |
| `FORCE_TRANSFORMERS` | `false` | Force transformer initialization |
| `REASONINGBANK_ENABLED` | - | Enable reasoning bank |

### MCP Registry

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_REGISTRY_ENABLED` | `false` | Enable MCP registry |
| `MCP_REGISTRY_URL` | - | MCP registry URL |
| `MCP_REGISTRY_API_KEY` | - | MCP registry API key |

### API Keys (Tiara context)

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_API_KEY` | - | Alternative Anthropic key name |
| `CLAUDE_FLOW_API_KEY` | - | Claude Flow specific API key |

---

## Peekaboo (Zee submodule - macOS screenshots)

### Runner Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RUNNER_DEBUG` | `0` | Enable debug logs (`1` to enable) |
| `RUNNER_SUMMARY_STYLE` | - | Summary output style |
| `RUNNER_THE_USER_GAVE_ME_CONSENT` | `0` | Consent override |
| `RUNNER_SWIFT_PACKAGE` | - | Custom Swift package path |
| `RUNNER_TMUX` | - | Force/disable tmux mode |
| `PEEKABOO_REQUIRE_UNIVERSAL` | `0` | Require universal binary |
| `HOMEBREW_PREFIX` | `/opt/homebrew` | Homebrew installation prefix |

---

## Usage Examples

### Minimal Production Setup

```bash
# Required for LLM functionality
export ANTHROPIC_API_KEY="sk-ant-..."

# Embeddings (example: Nebius Qwen3)
export NEBIUS_API_KEY="..."

# Configure memory in ~/.config/agent-core/agent-core.jsonc
# (Qdrant config is config-only; API keys come from env)

# Start daemon
agent-core daemon
```

### Development Setup

```bash
# LLM providers
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# Local services

# Debug mode
export CLAUDE_FLOW_DEBUG=true
export LOG_LEVEL=debug

# Persona routing
export PERSONAS_LEAD_PERSONA=zee
```

### Stanley Financial API

```bash
# Core auth
export STANLEY_AUTH_JWT_SECRET_KEY="your-32-char-secret-key"
export JWT_ALGORITHM="HS256"

# Data providers
export OPENBB_API_KEY="..."
export ALPHA_VANTAGE_API_KEY="..."

# Optional caching
export STANLEY_REDIS_URL="redis://localhost:6379"
```

### Zee Gateway

```bash
# Messaging
export TELEGRAM_BOT_TOKEN="..."
export WHATSAPP_TOKEN="..."
export WHATSAPP_PHONE_ID="..."

# Search
export BRAVE_API_KEY="..."

# Gateway config
export ZEE_GATEWAY_PASSWORD="secure-password"
```

---

## Security Notes

1. **Never commit API keys** - Use environment variables or `.env` files
2. **JWT secrets** must be at least 32 characters for HS256
3. **Production** should set `NODE_ENV=production` and `STANLEY_DEV_MODE=false`
4. **.env files** are blocked from agent reading by default (security feature)
5. **Rate limiting** is enabled by default for auth endpoints

---

## Configuration Architecture Notes

### Port Assignments

The system uses distinct ports for different services:

| Port | Service | Location |
|------|---------|----------|
| 3210 | TUI/Web Server | `packages/agent-core/src/server/server.ts` |
| 3456 | Daemon API | `src/config/constants.ts` |
| 6333 | Qdrant (default) | External service |

### Constants Organization

- **Centralized constants**: `src/config/constants.ts` - Infrastructure constants for the daemon
- **Package constants**: `packages/agent-core/src/` - OpenCode fork maintains its own constants
- **Both read from environment variables** ensuring runtime configurability

---

*Generated: 2026-01-12*
