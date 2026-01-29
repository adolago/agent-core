---
summary: "Platform support overview (Gateway only)"
read_when:
  - Looking for OS support or install paths
  - Deciding where to run the Gateway
---
# Platforms

Zee core is written in TypeScript. **Node is the recommended runtime**.
Bun is not recommended for the Gateway (WhatsApp/Telegram bugs).

No native desktop or mobile apps are shipped in this repo. The Gateway is fully
supported today, and the Control UI provides the browser interface across
platforms.

Mobile apps are intentionally not shipped in this repo. Do not sync or reintroduce
mobile app code from external sources.

## Choose your OS

- macOS: [macOS](/platforms/macos)
- Windows: [Windows](/platforms/windows)
- Linux: [Linux](/platforms/linux)

## VPS & hosting

- VPS hub: [VPS hosting](/vps)
- Fly.io: [Fly.io](/platforms/fly)
- Hetzner (Docker): [Hetzner](/platforms/hetzner)
- GCP (Compute Engine): [GCP](/platforms/gcp)
- exe.dev (VM + HTTPS proxy): [exe.dev](/platforms/exe-dev)

## Common links

- Install guide: [Getting Started](/start/getting-started)
- Gateway runbook: [Gateway](/gateway)
- Gateway configuration: [Configuration](/gateway/configuration)
- Service status: `zee gateway status`

## Gateway service install (CLI)

Use one of these (all supported):

- Wizard (recommended): `zee onboard --install-daemon`
- Direct: `zee gateway install`
- Configure flow: `zee configure` → select **Gateway service**
- Repair/migrate: `zee doctor` (offers to install or fix the service)

The service target depends on OS:
- macOS: LaunchAgent (`bot.zee.gateway` or `bot.zee.<profile>`; legacy labels still unload cleanly)
- Linux/WSL2: systemd user service (`zee-gateway[-<profile>].service`)
