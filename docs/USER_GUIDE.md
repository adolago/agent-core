# Agent-Core User Guide

Welcome to **Agent-Core**, the engine behind the Personas system (Zee, Stanley, Johny).
This guide will get you from "zero" to "fully operational AI assistant".

## 1. Installation

### Prerequisites

- **Docker Desktop** (or Docker Engine + Compose)
- **Bun** (v1.1+) or Node.js

### Install

```bash
# Clone the repo
git clone https://github.com/yourusername/agent-core.git

# Install dependencies and build
cd agent-core
./install
```

## 2. Setup Infrastructure

Agent-Core relies on **Qdrant** for long-term memory. We provide a one-command setup:

```bash
agent-core setup
```

This will:

1. Check for Docker.
2. Spin up the Qdrant database container.
3. Verify connection.

## 3. Configuration

### Authentication

You need an LLM provider (Anthropic is recommended for best results).
Google Antigravity OAuth is available via the `opencode-google-auth` plugin (not built in).

```bash
agent-core plugin install opencode-google-auth
```

```bash
agent-core auth login
```

Select **Google** to complete the OAuth flow.

Select "Anthropic" or "OpenAI" and paste your API key.

### Personas

Agent-Core comes with three built-in personas:

- **Zee:** Your personal assistant (Calendar, Tasks, Memory).
- **Stanley:** Financial research (requires the `stanley` repository).
- **Johny:** Learning and Knowledge graphs.

### Memory (required mode)

If memory is a hard requirement for your workflow, enforce it in config:

```json
{
  "memory": {
    "required": true
  }
}
```

When enabled, prompts fail fast if the memory backend or memory MCP is unavailable.

### Dictation (TUI)

Configure Inworld STT and a keybind in `agent-core.jsonc`:

```json
{
  "keybinds": {
    "input_dictation_toggle": "f4"
  },
  "tui": {
    "dictation": {
      "endpoint": "https://api.inworld.ai/cloud/workspaces/<workspace>/graphs/<graph>/v1/graph:start",
      "api_key": "<BASE64_API_KEY>",
      "sample_rate": 16000,
      "auto_submit": false
    }
  }
}
```

You can also set `INWORLD_API_KEY` and `INWORLD_STT_ENDPOINT` as environment variables instead of storing secrets in config.
Use `tui.dictation.record_command` to override the recorder command if `arecord` is unavailable.
The dictation payload is sent as `GraphTypes.Audio` with a float PCM array (`data`) and `sampleRate`; by default it is sent as the root input (`input_key: "__root__"`). Set `tui.dictation.input_key` if your graph expects a nested key.
Use `tui.dictation.runtime_mode` to control runtime fallback: `auto` (default) tries the graph then falls back to runtime STT on input mismatch, `force` skips the graph and uses runtime STT, and `disable` turns off the fallback.

Example recorder commands:

macOS (ffmpeg + avfoundation):
```json
{
  "tui": {
    "dictation": {
      "record_command": ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", "none:0", "-ac", "1", "-ar", "16000", "-f", "wav", "-"]
    }
  }
}
```

Windows (ffmpeg + dshow):
```json
{
  "tui": {
    "dictation": {
      "record_command": ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "dshow", "-i", "audio=default", "-ac", "1", "-ar", "16000", "-f", "wav", "-"]
    }
  }
}
```

macOS/Windows (sox/rec):
```json
{
  "tui": {
    "dictation": {
      "record_command": ["rec", "-q", "-r", "16000", "-c", "1", "-b", "16", "-e", "signed-integer", "-t", "wav", "-"]
    }
  }
}
```

## 4. Usage

### Interactive Mode (TUI)

Start the Terminal User Interface:

```bash
agent-core
```

The TUI attaches to a running daemon. If you want local-only mode without a daemon, use:

```bash
agent-core --no-daemon
```

Type your request. For example:

> "Zee, remind me to check the server logs tomorrow at 9am."

### Using Personas

You can route requests to specific personas:

> "Stanley, what is the P/E ratio of NVDA?"

> "Johny, explain the concept of eigenvectors."

### Daemon Mode

To run Agent-Core in the background (Zee messaging gateway is opt-in). Manual daemon is for development only:

```bash
agent-core daemon
agent-core daemon --gateway
```

### Always-On Messaging (systemd)

For "PC on, no login" messaging, run the daemon as a systemd service:

```bash
sudo ./scripts/systemd/install.sh --polkit --systemd-only
sudo systemctl enable agent-core
sudo systemctl start agent-core
```

The install script will prompt for sudo if needed. With `--polkit`, you can run start/stop/restart and enable/disable without sudo:

```bash
systemctl restart agent-core
systemctl enable agent-core
```

The systemd unit disables `ProtectHome` so the daemon can read/write projects in any directory under your home.

The `--systemd-only` flag writes `daemon.systemd_only=true` to enforce a systemd-only policy.

This service starts the gateway; systemd owns restarts and lifecycle. When using the TUI on a machine that already has the daemon running, prefer:

```bash
agent-core --no-daemon
```

TUI ergonomics directive: keep the TUI as the shared surface for both operators and agents so they experience the same workflows.

To enforce a systemd-only policy, set:

```json
{
  "daemon": {
    "systemd_only": true
  }
}
```

## 5. Troubleshooting

### Diagnostics

If something isn't working:

```bash
agent-core debug status
```

### Bug Report

To generate a zip file with logs for support:

```bash
agent-core bug-report
```

### Logs

Logs are stored in `~/.local/state/agent-core/logs/`.
The system keeps the last 5 sessions automatically.

## 6. Advanced: Connecting Stanley

To unlock the full power of the Investment Persona:

1. Clone the Stanley repo to `~/.local/src/agent-core/packages/personas/stanley`.
2. Set up the Python environment there (`pip install -r requirements.txt`).
3. Agent-Core will automatically detect the CLI.

Run `agent-core` and ask:

> "Stanley, status"
> To verify the connection.
