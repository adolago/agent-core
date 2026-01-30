---
summary: "Poll sending via gateway + CLI"
read_when:
  - Adding or modifying poll support
  - Debugging poll sends from the CLI or gateway
---
# Polls


## Supported channels
- WhatsApp (web channel)
- MS Teams (Adaptive Cards)

## CLI

```bash
# WhatsApp
zee message poll --target +15555550123 \
  --poll-question "Lunch today?" --poll-option "Yes" --poll-option "No" --poll-option "Maybe"
zee message poll --target 123456789@g.us \
  --poll-question "Meeting time?" --poll-option "10am" --poll-option "2pm" --poll-option "4pm" --poll-multi

  --poll-question "Snack?" --poll-option "Pizza" --poll-option "Sushi"
  --poll-question "Plan?" --poll-option "A" --poll-option "B" --poll-duration-hours 48

# MS Teams
zee message poll --channel msteams --target conversation:19:abc@thread.tacv2 \
  --poll-question "Lunch?" --poll-option "Pizza" --poll-option "Sushi"
```

Options:
- `--poll-multi`: allow selecting multiple options

## Gateway RPC

Method: `poll`

Params:
- `to` (string, required)
- `question` (string, required)
- `options` (string[], required)
- `maxSelections` (number, optional)
- `durationHours` (number, optional)
- `channel` (string, optional, default: `whatsapp`)
- `idempotencyKey` (string, required)

## Channel differences
- WhatsApp: 2-12 options, `maxSelections` must be within option count, ignores `durationHours`.
- MS Teams: Adaptive Card polls (Zee-managed). No native poll API; `durationHours` is ignored.

## Agent tool (Message)
Use the `message` tool with `poll` action (`to`, `pollQuestion`, `pollOption`, optional `pollMulti`, `pollDurationHours`, `channel`).

Teams polls are rendered as Adaptive Cards and require the gateway to stay online
to record votes in `~/.zee/msteams-polls.json`.
