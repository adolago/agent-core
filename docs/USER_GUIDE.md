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

## 4. Usage

### Interactive Mode (TUI)

Start the Terminal User Interface:

```bash
agent-core
```

Type your request. For example:

> "Zee, remind me to check the server logs tomorrow at 9am."

### Using Personas

You can route requests to specific personas:

> "Stanley, what is the P/E ratio of NVDA?"

> "Johny, explain the concept of eigenvectors."

### Daemon Mode

To run Agent-Core in the background (required for external tools like the Mobile App or WhatsApp gateway):

```bash
agent-core daemon
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

1. Clone the Stanley repo to `~/.local/src/agent-core/vendor/personas/stanley`.
2. Set up the Python environment there (`pip install -r requirements.txt`).
3. Agent-Core will automatically detect the CLI.

Run `agent-core` and ask:

> "Stanley, status"
> To verify the connection.
