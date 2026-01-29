# Zee — Personal AI Assistant

<p align="center">
  <img src="README-header.png" alt="Zee" width="600">
</p>

**Zee** is a personal AI assistant you run on your own devices.
It answers on the channels you already use (WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, Microsoft Teams, WebChat), plus extension channels like BlueBubbles, Matrix, Zalo, and Zalo Personal.
The Zee Gateway is the control plane for sessions, channels, tools, and events.

If you want a single-user assistant that feels local, fast, and always-on, this is it.

- Docs: `packages/personas/zee/docs` (Mintlify config)
- Upstream policy: `docs/UPSTREAM_POLICY.md`

## Quick start

Runtime: **Node ≥22**.

```bash
npm install -g zee@latest
# or: pnpm add -g zee@latest

zee onboard --install-daemon
zee gateway --port 18789 --verbose

# Send a message
zee message send --to +1234567890 --message "Hello from Zee"

# Talk to the assistant
zee agent --message "Ship checklist" --thinking high
```

Notes:
- The onboarding wizard is the recommended path and works on **macOS, Linux, and Windows (via WSL2)**.
- Mobile apps (iOS/Android) are not shipped in this repo.

## Development

```bash
git clone <your-fork>
cd agent-core/packages/personas/zee

pnpm install
pnpm ui:build
pnpm build

# Dev loop (auto-reload on TS changes)
pnpm gateway:watch
```

## Security defaults (DM access)

Zee connects to real messaging surfaces. Treat inbound DMs as **untrusted input**.

Default behavior on Telegram/WhatsApp/Signal/iMessage/Microsoft Teams/Discord/Google Chat/Slack:
- **DM pairing** (`dmPolicy="pairing"` / `channels.discord.dm.policy="pairing"` / `channels.slack.dm.policy="pairing"`): unknown senders receive a short pairing code and the bot does not process their message.
- Approve with: `zee pairing approve <channel> <code>` (then the sender is added to a local allowlist store).
- Public inbound DMs require an explicit opt-in: set `dmPolicy="open"` and include `"*"` in the channel allowlist (`allowFrom` / `channels.discord.dm.allowFrom` / `channels.slack.dm.allowFrom`).

## Highlights

- **Zee Gateway** — single control plane for sessions, channels, tools, and events.
- **Multi-channel inbox** — WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, BlueBubbles, Microsoft Teams, Matrix, Zalo, Zalo Personal, WebChat.
- **Multi-agent routing** — route inbound channels/accounts/peers to isolated agents (workspaces + per-agent sessions).
- **Live Canvas** — agent-driven visual workspace with A2UI.
- **First-class tools** — browser, canvas, nodes, cron, sessions, and Discord/Slack actions.
- **Control UI** — hosted directly from the Gateway.

## How it works (short)

```
WhatsApp / Telegram / Slack / Discord / Google Chat / Signal / iMessage / BlueBubbles / Microsoft Teams / Matrix / Zalo / Zalo Personal / WebChat
               │
               ▼
┌───────────────────────────────┐
│         Zee Gateway           │
│       (control plane)         │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ Pi agent (RPC)
               ├─ CLI (zee …)
               ├─ Control UI
               └─ macOS app
```

## Remote Gateway

It is fine to run the Gateway on a small Linux instance. Clients (macOS app, CLI, WebChat) can connect over **Tailscale Serve/Funnel** or **SSH tunnels**, and you can still pair device nodes (macOS) to execute device‑local actions when needed.

- **Gateway host** runs the exec tool and channel connections by default.
- **Device nodes** run device‑local actions (`system.run`, camera, screen recording, notifications) via `node.invoke`.
In short: exec runs where the Gateway lives; device actions run where the device lives.
