---
name: wacli
description: Send WhatsApp messages FROM THE USER'S PERSONAL NUMBER to other people, or search/sync WhatsApp history via the wacli CLI.
version: 1.0.0
author: Artur
tags: [messaging, whatsapp, cli, zee]
homepage: https://wacli.sh
metadata: {"zee":{"emoji":"📱","requires":{"bins":["wacli"]},"install":[{"id":"brew","kind":"brew","formula":"steipete/tap/wacli","bins":["wacli"],"label":"Install wacli (brew)"},{"id":"go","kind":"go","module":"github.com/steipete/wacli/cmd/wacli@latest","bins":["wacli"],"label":"Install wacli (go)"}]}}
---

# wacli

## Important: Two WhatsApp Channels

| Channel | Number | Purpose |
|---------|--------|---------|
| **Zee Gateway (Baileys)** | Zee's own number | User chats WITH Zee |
| **wacli** | User's personal number | Zee messages others ON BEHALF of user |

Use `wacli` when the user asks you to:
- Message someone else from their personal WhatsApp ("Tell John I'm running late")
- Search their WhatsApp history ("Find invoices from last month")
- Sync/backfill chat history

Do NOT use `wacli` for normal user chats with Zee - those go through the Zee gateway automatically.

Safety
- Require explicit recipient + message text.
- Confirm recipient + message before sending.
- If anything is ambiguous, ask a clarifying question.

Auth + sync
- `wacli auth` (QR login + initial sync)
- `wacli sync --follow` (continuous sync)
- `wacli doctor`

Find chats + messages
- `wacli chats list --limit 20 --query "name or number"`
- `wacli messages search "query" --limit 20 --chat <jid>`
- `wacli messages search "invoice" --after 2025-01-01 --before 2025-12-31`

History backfill
- `wacli history backfill --chat <jid> --requests 2 --count 50`

Send
- Text: `wacli send text --to "+14155551212" --message "Hello! Are you free at 3pm?"`
- Group: `wacli send text --to "1234567890-123456789@g.us" --message "Running 5 min late."`
- File: `wacli send file --to "+14155551212" --file /path/agenda.pdf --caption "Agenda"`

Notes
- Store dir: `~/.wacli` (override with `--store`).
- Use `--json` for machine-readable output when parsing.
- Backfill requires your phone online; results are best-effort.
- WhatsApp CLI is not needed for routine user chats; it’s for messaging other people.
- JIDs: direct chats look like `<number>@s.whatsapp.net`; groups look like `<id>@g.us` (use `wacli chats list` to find).
