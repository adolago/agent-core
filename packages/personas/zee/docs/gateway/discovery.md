---
summary: "Node discovery and transports (Bonjour, Tailscale, SSH) for finding the gateway"
read_when:
  - Implementing or changing Bonjour discovery/advertising
  - Adjusting remote connection modes (direct vs SSH)
  - Designing gateway discovery or bridge pairing for nodes
---
# Discovery & transports

Zee has two distinct problems that look similar on the surface:

1) **Operator remote control**: the macOS menu bar app controlling a gateway running elsewhere.
2) **Node access**: iOS/Android (and future nodes) discovering a gateway and authenticating.

The design goal is to keep all network discovery/advertising in the **Node Gateway** (`clawd` / `zee gateway`) and keep clients (mac app, iOS) as consumers.

## Terms

- **Gateway**: the single, long-running gateway process that owns state (sessions, pairing, node registry) and runs providers.
- **Gateway WS (direct)**: the gateway WebSocket endpoint on the configured bind host (loopback by default, LAN/tailnet when enabled).
- **Bridge (legacy transport)**: an optional LAN/tailnet-facing TCP endpoint owned by the gateway for Android/legacy nodes. It exists so the gateway can remain loopback-only.
- **SSH transport (fallback)**: remote control by forwarding `127.0.0.1:18789` over SSH.

## Why we keep both “direct” and SSH

- **Direct gateway** is the best UX on the same network and within a tailnet:
  - auto-discovery on LAN via Bonjour
  - gateway-owned auth (token/password or Tailscale identity)
  - no shell access required; protocol surface can stay tight and auditable
- **Bridge** remains supported for Android/legacy nodes or when you want the gateway loopback-only:
  - pairing tokens + ACLs owned by the gateway
  - separate TCP port scoped to node commands
- **SSH** remains the universal fallback:
  - works anywhere you have SSH access (even across unrelated networks)
  - survives multicast/mDNS issues
  - requires no new inbound ports besides SSH

## Discovery inputs (how clients learn where the gateway is)

### 1) Bonjour / mDNS (LAN only)

Bonjour is best-effort and does not cross networks. It is only used for “same LAN” convenience.

Target direction:
- The **gateway** advertises its WebSocket endpoint via Bonjour.
- If the bridge is enabled, the gateway advertises both the gateway and bridge services.
- Clients browse and show a “pick a gateway” list, then store the chosen endpoint.

Troubleshooting and beacon details: [`docs/bonjour.md`](/gateway/bonjour).

#### Current implementation

- Service types:
  - `_zee-gateway._tcp` (gateway WebSocket beacon)
  - `_zee-bridge._tcp` (bridge transport beacon, bridge-only)
- TXT keys (non-secret):
  - `role=gateway`
  - `lanHost=<hostname>.local`
  - `sshPort=22` (or whatever is advertised)
  - `gatewayPort=18789` (gateway WS port)
  - `bridgePort=18790` (when bridge is enabled)
  - `canvasPort=18793` (default canvas host port; serves `/__zee__/canvas/`)
  - `cliPath=<path>` (optional; absolute path to a runnable `zee` entrypoint or binary)
  - `displayName=<name>` (optional; friendly name for UI)
  - `tailnetDns=<magicdns>` (optional hint; auto-detected when Tailscale is available)
  - `gatewayTls=1` (optional; gateway expects TLS)
  - `gatewayTlsSha256=<sha256>` (optional; pin for TLS)
  - `transport=gateway|bridge` (service hint)

Disable/override:
- `ZEE_DISABLE_BONJOUR=1` disables advertising.
- `ZEE_BRIDGE_ENABLED=0` disables the bridge listener.
- `bridge.bind` / `bridge.port` in `~/.zee/zee.json` control bridge bind/port (preferred).
- `ZEE_BRIDGE_HOST` / `ZEE_BRIDGE_PORT` still work as a back-compat override when `bridge.bind` / `bridge.port` are not set.
- `ZEE_SSH_PORT` overrides the SSH port advertised in gateway/bridge beacons (defaults to 22).
- `ZEE_TAILNET_DNS` publishes a `tailnetDns` hint (MagicDNS) in gateway/bridge beacons (auto-detected if unset).

### 2) Tailnet (cross-network)

For London/Vienna style setups, Bonjour won’t help. The recommended “direct” target is:
- Tailscale MagicDNS name (preferred) or a stable tailnet IP.

If the gateway can detect it is running under Tailscale, it publishes `tailnetDns` as an optional hint for clients (including wide-area beacons).

### 3) Manual / SSH target

When there is no direct route (or direct is disabled), clients can always connect via SSH by forwarding the loopback gateway port.

See [`docs/remote.md`](/gateway/remote).

## Transport selection (client policy)

Recommended client behavior:

1) If a direct endpoint is configured and reachable, use it.
2) Else, if Bonjour finds a gateway on LAN, offer a one-tap “Use this gateway” choice and save it as the direct endpoint.
3) Else, if a tailnet DNS/IP is configured, try direct.
4) Else, fall back to SSH.

## Auth (direct gateway)

The gateway is the source of truth for node/client admission. There is no pairing flow for direct gateway WebSocket access.

- Configure `gateway.auth.token` or `gateway.auth.password` (or `ZEE_GATEWAY_TOKEN` / `ZEE_GATEWAY_PASSWORD`).
- When running inside Tailscale, `gateway.auth.allowTailscale` can accept tailnet identity headers.

## Pairing (bridge transport)

Pairing requests are created/approved/rejected in the gateway (see [`docs/gateway/pairing.md`](/gateway/pairing)). The bridge enforces:
- auth (token / keypair)
- scopes/ACLs (bridge is not a raw proxy to every gateway method)
- rate limits

## Where the code lives (target architecture)

- Node gateway:
  - advertises discovery beacons (Bonjour)
  - owns pairing storage + decisions
  - runs the bridge listener (legacy transport)
- macOS app:
  - UI for picking a gateway, showing pairing prompts, and troubleshooting
  - SSH tunneling only for the fallback path
- iOS node:
  - browses Bonjour (LAN) as a convenience only
  - uses direct gateway WS + auth to connect to the gateway
  - uses manual host/port when discovery is blocked
