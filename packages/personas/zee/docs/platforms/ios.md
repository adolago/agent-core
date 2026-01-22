---
summary: "iOS app (node): architecture + connection runbook"
read_when:
  - Connecting or reconnecting the iOS node
  - Debugging iOS gateway discovery or auth
  - Sending screen/canvas commands to iOS
  - Designing iOS node + gateway integration
  - Extending the Gateway protocol for node/canvas commands
  - Implementing Bonjour discovery or transport security
---
# iOS App (Node)

Status: prototype implemented (internal) · Date: 2025-12-13

## Support snapshot
- Role: companion node app (iOS does not host the Gateway).
- Gateway required: yes (run it on macOS, Linux, or Windows via WSL2).
- Install: [Getting Started](/start/getting-started).
- Gateway: [Runbook](/gateway) + [Configuration](/gateway/configuration) (set `gateway.bind` + `gateway.auth` for LAN/tailnet access).

## System control
System control (launchd/systemd) lives on the Gateway host. See [Gateway](/gateway).

## Connection Runbook

This is the practical “how do I connect the iOS node” guide:

**iOS app** ⇄ (Bonjour + WebSocket) ⇄ **Gateway**

The Gateway WebSocket must be reachable from the iOS device (LAN/tailnet) and protected with gateway auth (token/password). There is no pairing flow for iOS.

### Prerequisites

- You can run the Gateway on the “master” machine.
- The gateway WebSocket is bound to LAN/tailnet and auth is configured.
- iOS node app can reach the gateway WebSocket:
  - Same LAN with Bonjour/mDNS, **or**
  - Same Tailscale tailnet using Wide-Area Bonjour / unicast DNS-SD (see below), **or**
  - Manual gateway host/port (fallback)
- You can run the CLI (`zee`) on the gateway machine (or via SSH) to set auth/config.

### 1) Start the Gateway (LAN/tailnet bind + auth)

By default the Gateway binds to loopback only. For iOS, bind it to LAN/tailnet and set auth.

```json5
{
  gateway: {
    bind: "lan",
    auth: { mode: "token", token: "replace-me" }
  }
}
```

```bash
zee gateway --port 18789 --verbose
```

For tailnet-only setups (recommended for Vienna ⇄ London), use `gateway.bind: "tailnet"` instead.

### 2) Verify Bonjour discovery (optional but recommended)

From the gateway machine:

```bash
dns-sd -B _zee-gateway._tcp local.
```

You should see your gateway advertising `_zee-gateway._tcp`.

If browse works, but the iOS node can’t connect, try resolving one instance:

```bash
dns-sd -L "<instance name>" _zee-gateway._tcp local.
```

More debugging notes: [`docs/bonjour.md`](/gateway/bonjour).

#### Tailnet (Vienna ⇄ London) discovery via unicast DNS-SD

If the iOS node and the gateway are on different networks but connected via Tailscale, multicast mDNS won’t cross the boundary. Use Wide-Area Bonjour / unicast DNS-SD instead:

1) Set up a DNS-SD zone (example `zee.internal.`) on the gateway host and publish `_zee-gateway._tcp` records.
2) Configure Tailscale split DNS for `zee.internal` pointing at that DNS server.

Details and example CoreDNS config: [`docs/bonjour.md`](/gateway/bonjour).

### 3) Connect from the iOS node app

In the iOS node app:
- Pick the discovered gateway (or hit refresh).
- If auth is enabled, enter the Gateway Token or Gateway Password (Settings → Gateway → Advanced).
- If you are using TLS (`wss://`), enable **Use TLS** in Settings → Gateway → Advanced.
- After the first successful connection, it will auto-reconnect **strictly to the last discovered gateway** on launch (including after reinstall), as long as the iOS Keychain entry is still present.

#### Connection indicator (always visible)

The Settings tab icon shows a small status dot:
- **Green**: connected to the gateway
- **Yellow**: connecting (subtle pulse)
- **Red**: not connected / error

### 4) Confirm gateway auth (token/password)

The iOS app must use the same gateway auth you configured on the Gateway:

- Token mode: set `gateway.auth.token` (or `ZEE_GATEWAY_TOKEN`)
- Password mode: set `gateway.auth.password` (or `ZEE_GATEWAY_PASSWORD`)

Paste the same value in Settings → Gateway → Advanced.

### 5) Verify the node is connected

- In the macOS app: **Instances** tab should show something like `iOS Node (...)` with a green “Active” presence dot shortly after connect.
- Via nodes status:
  ```bash
  zee nodes status
  ```
- Via Gateway:
  ```bash
  zee gateway call node.list --params "{}"
  ```
- Via Gateway presence (legacy-ish, still useful):
  ```bash
  zee gateway call system-presence --params "{}"
  ```
  Look for the node `instanceId` (often a UUID).

### 6) Drive the iOS Canvas (draw / snapshot)

The iOS node runs a WKWebView “Canvas” scaffold which exposes:
- `window.__zee.canvas`
- `window.__zee.ctx` (2D context)
- `window.__zee.setStatus(title, subtitle)`

#### Gateway Canvas Host (recommended for web content)

If you want the node to show real HTML/CSS/JS that the agent can edit on disk, point it at the Gateway canvas host.

Note: nodes always use the standalone canvas host on `canvasHost.port` (default `18793`), bound to the gateway interface.

1) Create `~/clawd/canvas/index.html` on the gateway host.

2) Navigate the node to it (LAN):

```bash
zee nodes invoke --node "iOS Node" --command canvas.navigate --params '{"url":"http://<gateway-hostname>.local:18793/__zee__/canvas/"}'
```

Notes:
- The server injects a live-reload client into HTML and reloads on file changes.
- A2UI is hosted on the same canvas host at `http://<gateway-host>:18793/__zee__/a2ui/`.
- Tailnet (optional): if both devices are on Tailscale, use a MagicDNS name or tailnet IP instead of `.local`, e.g. `http://<gateway-magicdns>:18793/__zee__/canvas/`.
- iOS may require App Transport Security allowances to load plain `http://` URLs; if it fails to load, prefer HTTPS or adjust the iOS app’s ATS config.

#### Draw with `canvas.eval`

```bash
zee nodes invoke --node "iOS Node" --command canvas.eval --params "$(cat <<'JSON'
{"javaScript":"(() => { const {ctx,setStatus} = window.__zee; setStatus('Drawing','…'); ctx.clearRect(0,0,innerWidth,innerHeight); ctx.lineWidth=6; ctx.strokeStyle='#ff2d55'; ctx.beginPath(); ctx.moveTo(40,40); ctx.lineTo(innerWidth-40, innerHeight-40); ctx.stroke(); setStatus(null,null); return 'ok'; })()"}
JSON
)"
```

#### Snapshot with `canvas.snapshot`

```bash
zee nodes invoke --node 192.168.0.88 --command canvas.snapshot --params '{"maxWidth":900}'
```

The response includes `{ format, base64 }` image data (default `format="jpeg"`; pass `{"format":"png"}` when you specifically need lossless PNG).

### Common gotchas

- **iOS in background:** all `canvas.*` commands fail fast with `NODE_BACKGROUND_UNAVAILABLE` (bring the iOS node app to foreground).
- **Return to default scaffold:** `canvas.navigate` with `{"url":""}` or `{"url":"/"}` returns to the built-in scaffold page.
- **mDNS blocked:** some networks block multicast; use a different LAN or plan a tailnet-capable gateway (see [`docs/discovery.md`](/gateway/discovery)).
- **Wrong node selector:** `--node` can be the node id (UUID), display name (e.g. `iOS Node`), IP, or an unambiguous prefix. If it’s ambiguous, the CLI will tell you.
- **Auth mismatch:** ensure the gateway token/password in Settings matches `gateway.auth` on the Gateway.
- **Keychain cleared:** if the gateway token/password is missing (or iOS Keychain was wiped), re-enter it in Settings → Gateway → Advanced.

## Design + Architecture

### Goals
- Build an **iOS app** that acts as a **remote node** for Zee:
  - **Voice trigger** (wake-word / always-listening intent) that forwards transcripts to the Gateway `agent` method.
  - **Canvas** surface that the agent can control: navigate, draw/render, evaluate JS, snapshot.
- **Dead-simple setup**:
  - Auto-discover the host on the local network via **Bonjour**.
  - One-tap connect after entering the gateway token/password.
  - iOS is **never** a local gateway; it is always a remote node.
- Operational clarity:
  - When iOS is backgrounded, voice may still run; **canvas commands must fail fast** with a structured error.
  - Provide **settings**: node display name, enable/disable voice wake, gateway auth.

Non-goals (v1):
- Exposing the Gateway without auth (or TLS when needed).
- Supporting arbitrary third-party “plugins” on iOS.
- Perfect App Store compliance; this is **internal-only** initially.

### Current repo reality (constraints we respect)
- The Gateway WebSocket server binds to `127.0.0.1:18789` by default; non-loopback binds require gateway auth (token/password) and are used for iOS ([`src/gateway/server.ts`](https://github.com/zee/zee/blob/main/src/gateway/server.ts)).
- The Gateway exposes a Canvas file server (`canvasHost`) on `canvasHost.port` (default `18793`), so nodes can `canvas.navigate` to `http://<lanHost>:18793/__zee__/canvas/` and auto-reload on file changes ([`docs/configuration.md`](/gateway/configuration)).
- macOS “Canvas” is controlled via the Gateway node protocol (`canvas.*`), matching iOS/Android ([`docs/mac/canvas.md`](/platforms/mac/canvas)).
- Voice wake forwards via `GatewayChannel` to Gateway `agent` (mac app: `VoiceWakeForwarder` → `GatewayConnection.sendAgent`).

### Recommended topology: Direct gateway WS
Bind the Gateway to LAN/tailnet and connect directly over WebSocket.

**iOS App** ⇄ (WebSocket + auth) ⇄ **Gateway** (`ws://<gateway-host>:18789`)

Why:
- Keeps auth and orchestration in the Gateway (agent-core remains the source of tokens).
- Uses the same protocol as macOS/CLI and avoids a separate bridge transport.
- Lets discovery use a single Bonjour service (`_zee-gateway._tcp`).

### Security plan (direct gateway)
#### Transport
- LAN/tailnet WebSocket is fine for internal use; prefer TLS when the connection crosses untrusted networks.
- iOS supports TLS pinning (TOFU) via discovery hints (`gatewayTlsSha256`) or manual settings.

#### Auth
- Use `gateway.auth.token` or `gateway.auth.password` (or env) and configure the same value in the iOS app.
- Tokens live in the Gateway; iOS stores them in Keychain.

#### Scope control (node commands)
- Keep node control on `node.invoke` and `node.event` so iOS only executes the node/canvas command surface.
- Avoid exposing broad gateway methods to nodes without explicit intent.

### Protocol unification: add “node/canvas” to Gateway protocol
#### Principle
Unify mac Canvas + iOS Canvas under a single conceptual surface:
- The agent talks to the Gateway using a stable method set (typed protocol).
- The Gateway routes node-targeted requests to:
  - local mac Canvas implementation, or
  - remote iOS node via the gateway WS

#### Minimal protocol additions (v1)
Add to [`src/gateway/protocol/schema.ts`](https://github.com/zee/zee/blob/main/src/gateway/protocol/schema.ts) (and regenerate Swift models):

**Identity**
- Node identity comes from `connect.params.client.instanceId` (stable), and `connect.params.client.mode = "node"` (or `"ios-node"`).

**Methods**
- `node.list` → list nodes + capabilities
- `node.describe` → describe a node (capabilities + supported `node.invoke` commands)
- `node.invoke` → send a command to a specific node
  - Params: `{ nodeId, command, params?, timeoutMs? }`

**Events**
- `node.event` → async node status/errors
  - e.g. background/foreground transitions, voice availability, canvas availability

#### Node command set (canvas)
These are values for `node.invoke.command`:
- `canvas.present` / `canvas.hide`
- `canvas.navigate` with `{ url }` (loads a URL; use `""` or `"/"` to return to the default scaffold)
- `canvas.eval` with `{ javaScript }`
- `canvas.snapshot` with `{ maxWidth?, quality?, format? }`
- A2UI (mobile + macOS canvas):
  - `canvas.a2ui.push` with `{ messages: [...] }` (A2UI v0.8 server→client messages)
  - `canvas.a2ui.pushJSONL` with `{ jsonl: "..." }` (legacy alias)
  - `canvas.a2ui.reset`
  - A2UI is hosted by the Gateway canvas host (`/__zee__/a2ui/`) on `canvasHost.port`. Commands fail if the host is unreachable.

Result pattern:
- Request is a standard `req/res` with `ok` / `error`.
- Long operations (loads, streaming drawing, etc.) may also emit `node.event` progress.

##### Current (implemented)
As of 2025-12-13, the Gateway supports `node.invoke` for gateway-connected nodes.

Example: draw a diagonal line on the iOS Canvas:
```bash
zee nodes invoke --node ios-node --command canvas.eval --params '{"javaScript":"(() => { const {ctx} = window.__zee; ctx.clearRect(0,0,innerWidth,innerHeight); ctx.lineWidth=6; ctx.strokeStyle=\"#ff2d55\"; ctx.beginPath(); ctx.moveTo(40,40); ctx.lineTo(innerWidth-40, innerHeight-40); ctx.stroke(); return \"ok\"; })()"}'
```

### Background behavior requirement
When iOS is backgrounded:
- Voice may still be active (subject to iOS suspension).
- **All `canvas.*` commands must fail** with a stable error code, e.g.:
  - `NODE_BACKGROUND_UNAVAILABLE`
  - Include `retryable: true` and `retryAfterMs` if we want the agent to wait.

## iOS app architecture (SwiftUI)
### App structure
- Single fullscreen Canvas surface (WKWebView).
- One settings entry point: a **gear button** that opens a settings sheet.
- All navigation is **agent-driven** (no local URL bar).

### Components
- `GatewayDiscoveryModel`: Bonjour browse + resolve (Network.framework `NWBrowser`)
- `GatewayConnectionController`: auto-connect + manual host/port, optional TLS pinning
- `GatewayNodeSession` / `GatewayChannel`: WebSocket session, `connect`/`req`/`res`, server events, `node.invoke` callbacks
- `NodeAppModel`:
  - Voice pipeline (wake-word + capture + forward)
  - Canvas pipeline (WKWebView controller + snapshot + eval)
  - Background state tracking; enforces “canvas unavailable in background”

### Voice in background (internal)
- Enable background audio mode (and required session configuration) so the mic pipeline can keep running when the user switches apps.
- If iOS suspends the app anyway, surface a clear node status (`node.event`) so operators can see voice is unavailable.

## Code sharing (macOS + iOS)
Create/expand SwiftPM targets so both apps share:
- `ZeeProtocol` (generated models; platform-neutral)
- `ZeeGatewayClient` (shared WS framing + connect/req/res + seq-gap handling)
- `ZeeKit` (node/canvas command types + deep links + shared utilities)

macOS continues to own:
- local Canvas implementation details (custom scheme handler serving on-disk HTML, window/panel presentation)

iOS owns:
- iOS-specific audio/speech + WKWebView presentation and lifecycle

## Repo layout
- iOS app: `apps/ios/` (XcodeGen `project.yml`)
- Shared Swift packages: `apps/shared/`
- Lint/format: iOS target runs `swiftformat --lint` + `swiftlint lint` using repo configs (`.swiftformat`, `.swiftlint.yml`).

Generate the Xcode project:
```bash
cd apps/ios
xcodegen generate
open Zee.xcodeproj
```

## Storage plan (private by default)
### iOS
- Canvas/workspace files (persistent, private):
  - `Application Support/Zee/canvas/<sessionKey>/...`
- Snapshots / temp exports (evictable):
  - `Library/Caches/Zee/canvas-snapshots/<sessionKey>/...`
- Credentials:
  - Keychain (gateway token/password + TLS pin)

## Related docs

- [`docs/gateway.md`](/gateway) (gateway runbook)
- [`docs/bonjour.md`](/gateway/bonjour) (discovery debugging)
- [`docs/discovery.md`](/gateway/discovery) (LAN vs tailnet vs SSH)
- [`docs/gateway/pairing.md`](/gateway/pairing) (bridge/Android only)
