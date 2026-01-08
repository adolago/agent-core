---
name: shared
description: Shared tools powered by Zee (Telegram, contacts, calendar) usable by all personas.
version: 1.0.0
author: Artur
tags: [shared, telegram, contacts, calendar]
---

# shared - Zee-Powered Tools

Shared tools backed by the Zee runtime (clawdbot). Use these from any persona.

## Telegram

```bash
# Bot token (default)
npx tsx scripts/shared-telegram.ts send --to @handle --message "Hi"

# User account (Zee)
npx tsx scripts/shared-telegram.ts send --to @handle --message "Hi" --mode user
```

## Contacts

```bash
npx tsx scripts/shared-contacts.ts add --name "Sarah" --platform telegram --topic "follow up"
npx tsx scripts/shared-contacts.ts list --limit 20
npx tsx scripts/shared-contacts.ts last --name "Sarah"
npx tsx scripts/shared-contacts.ts dormant --days 30
```

## Calendar (Google)

```bash
npx tsx scripts/shared-calendar.ts list --max 5
npx tsx scripts/shared-calendar.ts create --summary "Call" --start 2026-01-07T10:00:00Z --end 2026-01-07T10:30:00Z
npx tsx scripts/shared-calendar.ts delete --event-id <id>
```

## Delegation (Inter-Persona)

Hand off tasks to other personas via the central daemon.

```bash
npx tsx scripts/delegate-cli.ts --to stanley --task "Analyze AAPL" --context "User interested in tech sector"
```

## Planning

Strict planning mode. All plans are saved to `~/.agent-core/plan/`.

```bash
npx tsx scripts/shared-plan.ts list
npx tsx scripts/shared-plan.ts create --title "Project Alpha" --content "1. Phase 1\n2. Phase 2"
npx tsx scripts/shared-plan.ts read 2026-01-07-10-00-00-project_alpha.md
```

## Environment

- `ZEE_REPO` (default: `~/Repositories/personas/zee`)
- `ZEE_RUNTIME` (default: `bun`)

Telegram (user mode):
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_USER_SESSION`
  (or `ZEE_TELEGRAM_API_ID`, `ZEE_TELEGRAM_API_HASH`, `ZEE_TELEGRAM_USER_SESSION`)
