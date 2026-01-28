# Clawdbot → Zee Upstream Sync Plan

> **Goal**: Cherry-pick valuable upstream changes without duplicating functionality that now lives in agent-core or tiara.

## Current State

- **Upstream**: `clawdbot/main` (https://github.com/clawdbot/clawdbot.git) — recently rebranded to "moltbot"
- **Local fork**: `packages/personas/zee/` — transport layer only
- **No merge-base**: Histories diverged (separate git trees)

## Architecture Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYNC FROM UPSTREAM (zee)                      │
├─────────────────────────────────────────────────────────────────┤
│  ✅ Transport layers:                                            │
│     • src/telegram/     (Telegram bot, stickers, vision)        │
│     • src/whatsapp/     (Baileys WebSocket)                     │
│     • src/signal/       (signal-cli bridge)                     │
│     • src/discord/      (Discord.js)                            │
│     • src/slack/        (Slack API)                             │
│     • src/line/         (LINE Messaging API)                    │
│     • src/imessage/     (BlueBubbles integration)               │
│                                                                  │
│  ✅ Media pipeline:                                              │
│     • src/media/        (download, transcode, upload)           │
│     • src/tts/          (Edge TTS, ElevenLabs)                  │
│     • src/media-understanding/ (vision, stickers)               │
│                                                                  │
│  ✅ Gateway utilities:                                           │
│     • src/gateway/      (HTTP server, webhooks, heartbeat)      │
│     • src/browser/      (browser automation, evaluate gate)     │
│     • src/security/     (fs-safe, PATH injection fixes)         │
│     • src/commands/     (/help, /commands formatting)           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              DO NOT SYNC (lives in agent-core/tiara)             │
├─────────────────────────────────────────────────────────────────┤
│  ❌ src/agents/         → agent-core handles agent lifecycle    │
│  ❌ src/memory/         → src/memory/ + tiara QdrantStore       │
│  ❌ src/sessions/       → src/session/ in agent-core            │
│  ❌ src/routing/        → persona routing in daemon             │
│  ❌ src/auto-reply/     → reply logic now in daemon             │
│  ❌ src/tui/            → agent-core TUI                        │
│  ❌ src/daemon/         → agent-core daemon                     │
│  ❌ src/plugins/        → agent-core plugin system              │
│  ❌ src/config/         → agent-core config (different schema)  │
│  ❌ src/hooks/          → tiara hooks system                    │
└─────────────────────────────────────────────────────────────────┘
```

## Recent Upstream Changes Worth Cherry-Picking

### High Priority (Jan 2026)

| Commit | Description | Files | Effort |
|--------|-------------|-------|--------|
| `506bed5a` | Telegram sticker support with vision caching | `src/telegram/`, `src/media-understanding/` | Medium |
| `34fea720` | Improve sticker vision + cache | `src/telegram/` | Low |
| `cc80495b` | Send sticker pixels to vision models | `src/telegram/` | Low |
| `d7a00dc8` | Gate sticker vision on image input | `src/media-understanding/` | Low |
| `d91b4a30` | Improve /help and /commands formatting | `src/commands/` | Medium |
| `78f0bc3e` | Gate browser evaluate behind config flag | `src/browser/` | Low |
| `771f23d3` | Prevent PATH injection in docker sandbox | `src/security/` | **Critical** |
| `5eee9919` | Harden file serving | `src/security/` | **Critical** |
| `6c451f47` | Fix modelDefault with provider=auto | `src/providers/` | Low |
| `3b0c80ce` | Per-sender group tool policies | `src/config/`, `src/gateway/` | Medium |

### Moltbot Rebrand (Skip)

These are just namespace changes we don't need:
- `6d16a658` rename clawdbot to moltbot
- `735aea9e` align skills with moltbot rename
- `83460df9` update molt.bot domains

## Sync Strategy

### Option A: File-by-file cherry-pick (Recommended)

For transport-only directories, diff specific files:

```bash
# Example: Telegram sticker support
git show clawdbot/main:src/telegram/bot-message.ts > /tmp/upstream.ts
diff src/telegram/bot-message.ts /tmp/upstream.ts

# Cherry-pick specific functions/patches manually
```

### Option B: Directory replacement (Risky)

For directories with no local modifications:
```bash
git checkout clawdbot/main -- src/line/
```

### Option C: Create patch files

```bash
git format-patch clawdbot/main~20..clawdbot/main -- src/telegram/ src/security/
# Review and apply selectively
```

## Implementation Phases

### Phase 1: Security Fixes (Immediate)

1. **PATH injection fix** (`771f23d3`)
   - Check `src/security/` for fs-safe hardening
   - Compare with agent-core `packages/agent-core/src/pkg/util/`

2. **File serving hardening** (`5eee9919`)
   - Review gateway static file handlers

### Phase 2: Telegram Enhancements

1. **Sticker vision pipeline** (`506bed5a`, `34fea720`, `cc80495b`, `d7a00dc8`)
   - New feature, low conflict risk
   - Touches: `src/telegram/`, `src/media-understanding/`

2. **Vision caching**
   - Ensure cache doesn't conflict with Qdrant memory

### Phase 3: Command UX

1. **/help and /commands** (`d91b4a30`, `2ad550ab`)
   - Formatting improvements
   - Pagination for Telegram

### Phase 4: Config/Policy

1. **Per-sender tool policies** (`3b0c80ce`)
   - May conflict with agent-core tool permissions
   - Review carefully

## Files to Ignore

These exist in upstream but are superseded by agent-core:

```
src/agents/agent-*.ts          → agent-core daemon
src/agents/embedded-*.ts       → agent-core embedded runner
src/sessions/session-*.ts      → src/session/
src/memory/*.ts                → src/memory/, tiara QdrantStore
src/tui/*.ts                   → packages/agent-core/src/tui/
src/daemon/*.ts                → packages/agent-core/src/daemon/
src/config/config.ts           → different schema entirely
src/routing/session-key.ts     → keep local (routing logic differs)
```

## Testing After Sync

```bash
cd packages/personas/zee

# Type check
pnpm build

# Unit tests
pnpm test

# Integration (requires credentials)
pnpm test:e2e
```

## Tracking

- [x] Phase 1: Security fixes (PATH injection + file serving hardening)
- [x] Phase 2: Telegram sticker vision (complete)
- [x] Phase 3: /help formatting (complete)
- [x] Phase 4: Per-sender tool policies (complete)

### Implementation Details

**Phase 1A: PATH Injection Prevention**
- Created `src/security/env-sanitize.ts` with validation functions
- Updated `src/agents/bash-tools.exec.ts` to validate user-provided env
- Added final sanitization pass after PATH manipulation

**Phase 1B: File Serving Hardening**
- Created `src/security/fs-safe.ts` with:
  - `isValidMediaId()` - Character whitelist validation
  - `safeReadFile()` - Inode-verified reads with size limits
  - `resolveMediaPath()` - Path traversal protection
- Updated `src/media/server.ts` to use safe file operations

**Phase 4: Per-Sender Tool Policies**
- Added `SenderToolPolicyConfig` type in `src/config/types.tools.ts`
- Added `senders` field to group configs in Telegram, WhatsApp, Discord types
- Implemented `resolveSenderToolsPolicy()` in `src/config/group-policy.ts`
- Integrated in `src/agents/pi-tools.policy.ts`

---

*Last updated: 2026-01-28*
