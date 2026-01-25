---
summary: "CLI reference for `zee browser` (profiles, tabs, actions, extension relay, remote serve)"
read_when:
  - You use `zee browser` and want examples for common tasks
  - You want to control a remote browser via `browser.controlUrl`
  - You want to use the Chrome extension relay (attach/detach via toolbar button)
---

# `zee browser`

Manage Zee’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:
- Browser tool + API: [Browser tool](/tools/browser)
- Chrome extension relay: [Chrome extension](/tools/chrome-extension)

## Common flags

- `--url <controlUrl>`: override `browser.controlUrl` for this command invocation.
- `--browser-profile <name>`: choose a browser profile (default comes from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
zee browser --browser-profile chrome tabs
zee browser --browser-profile zee start
zee browser --browser-profile zee open https://example.com
zee browser --browser-profile zee snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:
- `zee`: launches/attaches to a dedicated Zee-managed Chrome instance (isolated user data dir).
- `chrome`: controls your existing Chrome tab(s) via the Chrome extension relay.

```bash
zee browser profiles
zee browser create-profile --name work --color "#FF5A36"
zee browser delete-profile --name work
```

Use a specific profile:

```bash
zee browser --browser-profile work tabs
```

## Tabs

```bash
zee browser tabs
zee browser open https://docs.zee.bot
zee browser focus <targetId>
zee browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
zee browser snapshot
```

Screenshot:

```bash
zee browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
zee browser navigate https://example.com
zee browser click <ref>
zee browser type <ref> "hello"
```

## Chrome extension relay (attach via toolbar button)

This mode lets the agent control an existing Chrome tab that you attach manually (it does not auto-attach).

Install the unpacked extension to a stable path:

```bash
zee browser extension install
zee browser extension path
```

Then Chrome → `chrome://extensions` → enable “Developer mode” → “Load unpacked” → select the printed folder.

Full guide: [Chrome extension](/tools/chrome-extension)

## Remote browser control (`zee browser serve`)

If the Gateway runs on a different machine than the browser, run a standalone browser control server on the machine that runs Chrome:

```bash
zee browser serve --bind 127.0.0.1 --port 18791 --token <token>
```

Then point the Gateway at it using `browser.controlUrl` + `browser.controlToken` (or `ZEE_BROWSER_CONTROL_TOKEN`).

Security + TLS best-practices: [Browser tool](/tools/browser), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
