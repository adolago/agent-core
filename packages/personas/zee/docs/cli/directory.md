---
summary: "CLI reference for `zee directory` (self, peers, groups)"
read_when:
  - You want to look up contacts/groups/self ids for a channel
  - You are developing a channel directory adapter
---

# `zee directory`

Directory lookups for channels that support it (contacts/peers, groups, and “me”).

## Common flags
- `--channel <name>`: channel id/alias (required when multiple channels are configured; auto when only one is configured)
- `--account <id>`: account id (default: channel default)
- `--json`: output JSON

## Notes
- `directory` is meant to help you find IDs you can paste into other commands (especially `zee message send --target ...`).
- For many channels, results are config-backed (allowlists / configured groups) rather than a live provider directory.
- Default output is `id` (and sometimes `name`) separated by a tab; use `--json` for scripting.

## Using results with `message send`

```bash
```

## ID formats (by channel)

- WhatsApp: `+15551234567` (DM), `1234567890-1234567890@g.us` (group)
- Telegram: `@username` or numeric chat id; groups are numeric ids
- Matrix (plugin): `user:@user:server`, `room:!roomId:server`, or `#alias:server`
- Microsoft Teams (plugin): `user:<id>` and `conversation:<id>`
- Zalo (plugin): user id (Bot API)
- Zalo Personal / `zalouser` (plugin): thread id (DM/group) from `zca` (`me`, `friend list`, `group list`)

## Self (“me”)

```bash
zee directory self --channel zalouser
```

## Peers (contacts/users)

```bash
zee directory peers list --channel zalouser
zee directory peers list --channel zalouser --query "name"
zee directory peers list --channel zalouser --limit 50
```

## Groups

```bash
zee directory groups list --channel zalouser
zee directory groups list --channel zalouser --query "work"
zee directory groups members --channel zalouser --group-id <id>
```
