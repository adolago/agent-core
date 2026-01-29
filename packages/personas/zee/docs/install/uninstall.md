---
summary: "Uninstall Zee completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Zee from a machine
  - The gateway service is still running after uninstall
---

# Uninstall

Two paths:
- **Easy path** if `zee` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
zee uninstall
```

Non-interactive (automation / npx):

```bash
zee uninstall --all --yes --non-interactive
npx -y zee uninstall --all --yes --non-interactive
```

Manual steps (same result):

1) Stop the gateway service:

```bash
zee gateway stop
```

2) Uninstall the gateway service (launchd/systemd/schtasks):

```bash
zee gateway uninstall
```

3) Delete state + config:

```bash
rm -rf "${CLAWDBOT_STATE_DIR:-$HOME/.zee}"
```

If you set `CLAWDBOT_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4) Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/zee
```

5) Remove the CLI install (pick the one you used):

```bash
npm rm -g zee
pnpm remove -g zee
bun remove -g zee
```

6) If you installed the macOS app:

```bash
rm -rf /Applications/Zee.app
```

Notes:
- If you used profiles (`--profile` / `CLAWDBOT_PROFILE`), repeat step 3 for each state dir (defaults are `~/.zee-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `zee` is missing.

### macOS (launchd)

Default label is `bot.molt.gateway` (or `bot.molt.<profile>`; legacy `com.zee.*` may still exist):

```bash
launchctl bootout gui/$UID/bot.molt.gateway
rm -f ~/Library/LaunchAgents/bot.molt.gateway.plist
```

If you used a profile, replace the label and plist name with `bot.molt.<profile>`. Remove any legacy `com.zee.*` plists if present.

### Linux (systemd user unit)

Default unit name is `zee-gateway.service` (or `zee-gateway-<profile>.service`):

```bash
systemctl --user disable --now zee-gateway.service
rm -f ~/.config/systemd/user/zee-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Zee Gateway` (or `Zee Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Zee Gateway"
Remove-Item -Force "$env:USERPROFILE\.zee\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.zee-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://molt.bot/install.sh` or `install.ps1`, the CLI was installed with `npm install -g zee@latest`.
Remove it with `npm rm -g zee` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `zee ...` / `bun run zee ...`):

1) Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2) Delete the repo directory.
3) Remove state + workspace as shown above.
