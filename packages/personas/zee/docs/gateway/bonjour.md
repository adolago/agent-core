---
summary: "Bonjour/mDNS discovery + debugging (Gateway beacons, clients, and common failure modes)"
read_when:
  - Debugging Bonjour discovery issues on macOS/iOS
  - Changing mDNS service types, TXT records, or discovery UX
---
# Bonjour / mDNS discovery

Zee uses Bonjour (mDNS / DNS-SD) as a **LAN-only convenience** to discover a running Gateway (and optional bridge transport). It is best-effort and does **not** replace SSH or Tailnet-based connectivity.

## Wide-Area Bonjour (Unicast DNS-SD) over Tailscale

If you want iOS node auto-discovery while the Gateway is on another network (e.g. Vienna ⇄ London), you can keep the `NWBrowser` UX but switch discovery from multicast mDNS (`local.`) to **unicast DNS-SD** (“Wide-Area Bonjour”) over Tailscale.

High level:

1) Run a DNS server on the gateway host (reachable via tailnet IP).
2) Publish DNS-SD records for `_zee-gateway._tcp` (and `_zee-bridge._tcp` if the bridge is enabled) in a dedicated zone (example: `zee.internal.`).
3) Configure Tailscale **split DNS** so `zee.internal` resolves via that DNS server for clients (including iOS).

Zee standardizes on the discovery domain `zee.internal.` for this mode. iOS browses `_zee-gateway._tcp` in both `local.` and `zee.internal.` automatically; Android still uses `_zee-bridge._tcp`.

### Gateway config (recommended)

On the gateway host (the machine running the Gateway), add to `~/.zee/zee.json` (JSON5):

```json5
{
  gateway: { bind: "tailnet" },
  bridge: { bind: "tailnet" }, // optional; Android/legacy
  discovery: { wideArea: { enabled: true } } // enables zee.internal DNS-SD publishing
}
```

Non-loopback gateway binds require auth. Use `gateway.auth.token` or `gateway.auth.password` (or `ZEE_GATEWAY_TOKEN` / `ZEE_GATEWAY_PASSWORD`).

### One-time DNS server setup (gateway host)

On the gateway host (macOS), run:

```bash
zee dns setup --apply
```

This installs CoreDNS and configures it to:
- listen on port 53 **only** on the gateway’s Tailscale interface IPs
- serve the zone `zee.internal.` from the gateway-owned zone file `~/.zee/dns/zee.internal.db`

The Gateway writes/updates that zone file when `discovery.wideArea.enabled` is true.

Validate from any tailnet-connected machine:

```bash
dns-sd -B _zee-gateway._tcp zee.internal.
dig @<TAILNET_IPV4> -p 53 _zee-gateway._tcp.zee.internal PTR +short
```

If the bridge is enabled (Android/legacy), you can also browse:

```bash
dns-sd -B _zee-bridge._tcp zee.internal.
dig @<TAILNET_IPV4> -p 53 _zee-bridge._tcp.zee.internal PTR +short
```

### Tailscale DNS settings

In the Tailscale admin console:

- Add a nameserver pointing at the gateway’s tailnet IP (UDP/TCP 53).
- Add split DNS so the domain `zee.internal` uses that nameserver.

Once clients accept tailnet DNS, iOS nodes can browse `_zee-gateway._tcp` in `zee.internal.` without multicast.
Wide-area beacons also include `tailnetDns` (when available) so the macOS app can auto-fill SSH targets off-LAN.

### Gateway listener security (recommended)

The gateway port (default `18789`) is a WebSocket service. By default it binds to `127.0.0.1`. When you bind it to LAN/tailnet for discovery, require auth and prefer tailnet-only binds.

For a tailnet-only setup:

- Set `gateway.bind: "tailnet"` in `~/.zee/zee.json`.
- Set `gateway.auth.token` or `gateway.auth.password` (or use `ZEE_GATEWAY_TOKEN` / `ZEE_GATEWAY_PASSWORD`).
- Restart the Gateway (or restart the macOS menubar app via [`./scripts/restart-mac.sh`](https://github.com/zee/zee/blob/main/scripts/restart-mac.sh) on that machine).

If you also enable the bridge, apply the same bind guidance with `bridge.bind: "tailnet"`.

## What advertises

Only the **Node Gateway** (`clawd` / `zee gateway`) advertises Bonjour beacons.

- Implementation: [`src/infra/bonjour.ts`](https://github.com/zee/zee/blob/main/src/infra/bonjour.ts)
- Gateway wiring: [`src/gateway/server.ts`](https://github.com/zee/zee/blob/main/src/gateway/server.ts)

## Service types

- `_zee-gateway._tcp` — gateway WebSocket beacon (used by iOS and direct clients).
- `_zee-bridge._tcp` — bridge transport beacon (used by Android/legacy nodes; only advertised when enabled).

## TXT keys (non-secret hints)

The Gateway advertises small non-secret hints to make UI flows convenient:

- `role=gateway`
- `lanHost=<hostname>.local`
- `sshPort=<port>` (defaults to 22 when not overridden)
- `gatewayPort=<port>` (Gateway WS port)
- `bridgePort=<port>` (only when bridge is enabled)
- `canvasPort=<port>` (only when the canvas host is enabled + reachable; default `18793`; serves `/__zee__/canvas/`)
- `cliPath=<path>` (optional; absolute path to a runnable `zee` entrypoint or binary)
- `displayName=<name>` (optional; friendly name for UI)
- `tailnetDns=<magicdns>` (optional hint; auto-detected from Tailscale when available; may be absent)
- `gatewayTls=1` (optional; gateway expects TLS)
- `gatewayTlsSha256=<sha256>` (optional; pin for TLS)
- `transport=gateway|bridge` (service hint)

## Debugging on macOS

Useful built-in tools:

- Browse instances:
  - `dns-sd -B _zee-gateway._tcp local.`
  - `dns-sd -B _zee-bridge._tcp local.` (bridge only)
- Resolve one instance (replace `<instance>`):
  - `dns-sd -L "<instance>" _zee-gateway._tcp local.`
  - `dns-sd -L "<instance>" _zee-bridge._tcp local.` (bridge only)

If browsing shows instances but resolving fails, you’re usually hitting a LAN policy / multicast issue.

## Debugging in Gateway logs

The Gateway writes a rolling log file (printed on startup as `gateway log file: ...`).

Look for `bonjour:` lines, especially:

- `bonjour: advertise failed ...` (probing/announce failure)
- `bonjour: ... name conflict resolved` / `hostname conflict resolved`
- `bonjour: watchdog detected non-announced service; attempting re-advertise ...` (self-heal attempt after sleep/interface churn)

## Debugging on iOS node

The iOS node app discovers gateways via `NWBrowser` browsing `_zee-gateway._tcp`.

To capture what the browser is doing:

- Settings → Gateway → Advanced → enable **Discovery Debug Logs**
- Settings → Gateway → Advanced → open **Discovery Logs** → reproduce the “Searching…” / “No gateways found” case → **Copy**

The log includes browser state transitions (`ready`, `waiting`, `failed`, `cancelled`) and result-set changes (added/removed counts).

## Common failure modes

- **Bonjour doesn’t cross networks**: London/Vienna style setups require Tailnet (MagicDNS/IP) or SSH.
- **Multicast blocked**: some Wi‑Fi networks (enterprise/hotels) disable mDNS; expect “no results”.
- **Sleep / interface churn**: macOS may temporarily drop mDNS results when switching networks; retry.
- **Browse works but resolve fails (iOS “NoSuchRecord”)**: make sure the advertiser publishes a valid SRV target hostname.
  - Implementation detail: `@homebridge/ciao` defaults `hostname` to the *service instance name* when `hostname` is omitted. If your instance name contains spaces/parentheses, some resolvers can fail to resolve the implied A/AAAA record.
  - Fix: set an explicit DNS-safe `hostname` (single label; no `.local`) in [`src/infra/bonjour.ts`](https://github.com/zee/zee/blob/main/src/infra/bonjour.ts).

## Escaped instance names (`\\032`)
Bonjour/DNS-SD often escapes bytes in service instance names as decimal `\\DDD` sequences (e.g. spaces become `\\032`).

- This is normal at the protocol level.
- UIs should decode for display (iOS uses `BonjourEscapes.decode` in `apps/shared/ZeeKit`).

## Disabling / configuration

- `ZEE_DISABLE_BONJOUR=1` disables advertising.
- `ZEE_BRIDGE_ENABLED=0` disables the bridge listener (and therefore the `_zee-bridge._tcp` beacon).
- `bridge.bind` / `bridge.port` in `~/.zee/zee.json` control bridge bind/port (preferred).
- `ZEE_BRIDGE_HOST` / `ZEE_BRIDGE_PORT` still work as a back-compat override when `bridge.bind` / `bridge.port` are not set.
- `ZEE_SSH_PORT` overrides the SSH port advertised in `_zee-gateway._tcp` / `_zee-bridge._tcp`.
- `ZEE_TAILNET_DNS` publishes a `tailnetDns` hint (MagicDNS) in `_zee-gateway._tcp` / `_zee-bridge._tcp`. If unset, the gateway auto-detects Tailscale and publishes the MagicDNS name when possible.

## Related docs

- Discovery policy and transport selection: [`docs/discovery.md`](/gateway/discovery)
- Bridge pairing + approvals: [Gateway pairing](/gateway/pairing)
