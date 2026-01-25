Fork — This is a fork of [zeebot/zeebot](https://github.com/zeebot/zeebot) with customizations. All credit goes to the brilliant [Zeebot](https://github.com/zeebot) maintainers and contributors for building such a fantastic experience. Please use the [upstream](https://github.com/zeebot/zeebot) repository for official releases and support. Use this fork at your own risk.

<p align="center">
  <a href="https://github.com/adolago/zee/releases/tag/v0.1.0-20260114"><img src="https://img.shields.io/badge/version-0.1.0-20260114-blue?style=for-the-badge" alt="Version"></a>
  <a href="https://github.com/adolago/zee/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/adolago/zee/ci.yml?branch=main&style=for-the-badge" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**Zee** is a *personal AI assistant* you run on your own devices.
It answers you on the providers you already use (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, WebChat), can speak and listen on macOS/iOS/Android, and can render a live Canvas you control. The Gateway is just the control plane — the product is the assistant.

If you want a personal, single-user assistant that feels local, fast, and always-on, this is it.

> **Fork note** — This repo is vendored into agent-core. In the agent-core integration, the Zee gateway is started and supervised by the `agent-core.service` systemd daemon (do not run a separate `zee gateway` process). If you're using agent-core, you typically do not need to install Zee separately; run the agent-core systemd daemon instead.

## Release

- **Version:** v0.1.0-20260114
- **Distribution:** bundled with agent-core

Preferred setup: run the onboarding wizard (`zee onboard`). It walks through gateway, workspace, providers, and skills. The CLI wizard is the recommended path and works on **macOS, Linux, and Windows (via WSL2; strongly recommended)**.
Works with npm, pnpm, or bun.

## Install (recommended)

Runtime: **Node ≥22**.

```bash
npm install -g zee@latest
# or: pnpm add -g zee@latest

zee onboard --install-daemon
```

The wizard installs the Gateway daemon (launchd/systemd user service) so it stays running.

## Security defaults (DM access)

Zee connects to real messaging surfaces. Treat inbound DMs as **untrusted input**.

Default behavior on Telegram/WhatsApp/Signal/iMessage/Discord/Slack:
- **DM pairing** (`dmPolicy="pairing"` / `discord.dm.policy="pairing"` / `slack.dm.policy="pairing"`): unknown senders receive a short pairing code and the bot does not process their message.
- Approve with: `zee pairing approve --provider <provider> <code>` (then the sender is added to a local allowlist store).
- Public inbound DMs require an explicit opt-in: set `dmPolicy="open"` and include `"*"` in the provider allowlist (`allowFrom` / `discord.dm.allowFrom` / `slack.dm.allowFrom`).

Run `zee doctor` to surface risky/misconfigured DM policies.

### Tools + automation
- [Browser control](https://docs.zee.bot/browser): dedicated zee Chrome/Chromium, snapshots, actions, uploads, profiles.
- [Canvas](https://docs.zee.bot/mac/canvas): [A2UI](https://docs.zee.bot/mac/canvas#canvas-a2ui) push/reset, eval, snapshot.
- [Nodes](https://docs.zee.bot/nodes): camera snap/clip, screen record, [location.get](https://docs.zee.bot/location-command), notifications.
- [Cron + wakeups](https://docs.zee.bot/cron); [webhooks](https://docs.zee.bot/webhook); [Gmail Pub/Sub](https://docs.zee.bot/gmail-pubsub).
- [Skills platform](https://docs.zee.bot/skills): bundled, managed, and workspace skills with install gating + UI.

## How it works (short)

```
WhatsApp / Telegram / Slack / Discord / Signal / iMessage / WebChat
               │
               ▼
┌───────────────────────────────┐
│            Gateway            │  ws://127.0.0.1:18789 (loopback default)
│       (control plane)         │  bridge: tcp://0.0.0.0:18790 (optional)
└──────────────┬────────────────┘
               │
               ├─ Pi agent (RPC)
               ├─ CLI (zee …)
               ├─ WebChat UI
               ├─ macOS app
               ├─ iOS node (Gateway WS + auth)
               └─ Android node (Bridge + pairing)
```

## Key subsystems

- **[Gateway WebSocket network](https://docs.zee.bot/architecture)** — single WS control plane for clients, tools, and events (plus ops: [Gateway runbook](https://docs.zee.bot/gateway)).
- **[Tailscale exposure](https://docs.zee.bot/tailscale)** — Serve/Funnel for the Gateway dashboard + WS (remote access: [Remote](https://docs.zee.bot/remote)).
- **[Browser control](https://docs.zee.bot/browser)** — zee‑managed Chrome/Chromium with CDP control.
- **[Canvas + A2UI](https://docs.zee.bot/mac/canvas)** — agent‑driven visual workspace (A2UI host: [Canvas/A2UI](https://docs.zee.bot/mac/canvas#canvas-a2ui)).
- **[Voice Wake](https://docs.zee.bot/voicewake) + [Talk Mode](https://docs.zee.bot/talk)** — always‑on speech and continuous conversation.
- **[Nodes](https://docs.zee.bot/nodes)** — Canvas, camera snap/clip, screen record, `location.get`, notifications, plus macOS‑only `system.run`/`system.notify`.

## Tailscale access (Gateway dashboard)

Zee can auto-configure Tailscale **Serve** (tailnet-only) or **Funnel** (public) while the Gateway stays bound to loopback. Configure `gateway.tailscale.mode`:

- `off`: no Tailscale automation (default).
- `serve`: tailnet-only HTTPS via `tailscale serve` (uses Tailscale identity headers by default).
- `funnel`: public HTTPS via `tailscale funnel` (requires shared password auth).

Notes:
- `gateway.bind` must stay `loopback` when Serve/Funnel is enabled (Zee enforces this).
- Serve can be forced to require a password by setting `gateway.auth.mode: "password"` or `gateway.auth.allowTailscale: false`.
- Funnel refuses to start unless `gateway.auth.mode: "password"` is set.
- Optional: `gateway.tailscale.resetOnExit` to undo Serve/Funnel on shutdown.

Details: [Tailscale guide](https://docs.zee.bot/tailscale) · [Web surfaces](https://docs.zee.bot/web)

## Remote Gateway (Linux is great)

It’s perfectly fine to run the Gateway on a small Linux instance. Clients (macOS app, CLI, WebChat) can connect over **Tailscale Serve/Funnel** or **SSH tunnels**, and you can still pair bridge nodes (macOS/Android) and connect iOS via gateway auth to execute device‑local actions when needed.

- **Gateway host** runs the bash tool and provider connections by default.
- **Device nodes** run device‑local actions (`system.run`, camera, screen recording, notifications) via `node.invoke`.
In short: bash runs where the Gateway lives; device actions run where the device lives.

Details: [Remote access](https://docs.zee.bot/remote) · [Nodes](https://docs.zee.bot/nodes) · [Security](https://docs.zee.bot/security)

## Agent to Agent (sessions_* tools)

- Use these to coordinate work across sessions without jumping between chat surfaces.
- `sessions_list` — discover active sessions (agents) and their metadata.
- `sessions_history` — fetch transcript logs for a session.
- `sessions_send` — message another session; optional reply‑back ping‑pong + announce step (`REPLY_SKIP`, `ANNOUNCE_SKIP`).

Details: [Session tools](https://docs.zee.bot/session-tool)

## Skills registry (ZeeHub)

ZeeHub is a minimal skill registry. With ZeeHub enabled, the agent can search for skills automatically and pull in new ones as needed.

[ZeeHub](https://ZeeHub.com)

## Chat commands

Send these in WhatsApp/Telegram/Slack/WebChat (group commands are owner-only):

- `/status` — health + session info (group shows activation mode)
- `/new` or `/reset` — reset the session
- `/compact` — compact session context (summary)
- `/think <level>` — off|minimal|low|medium|high
- `/verbose on|off`
- `/restart` — restart the gateway (owner-only in groups)
- `/activation mention|always` — group activation toggle (groups only)

### iOS node (optional)

- Connects directly to the Gateway WebSocket with token/password auth.
- Voice trigger forwarding + Canvas surface.
- Controlled via `zee nodes …`.

Runbook: [iOS connect](https://docs.zee.bot/ios).

### Android node (optional)

- Bridge + pairing (Android only).
- Exposes Canvas, Camera, and Screen capture commands.
- Runbook: [Android connect](https://docs.zee.bot/android).
