# Upstream Triage: Commits 122-221 (opencode/dev)

Batch 2 of 100 commits from opencode/dev to triage for agent-core.

## Summary

| Category | Count |
|----------|-------|
| **HIGH PRIORITY (Apply)** | 20 |
| **MEDIUM PRIORITY (Review)** | 8 |
| **SKIP (App/Desktop/Web/CI/Chore)** | 72 |

---

## HIGH PRIORITY - Apply These

These commits are TUI/Core relevant and should be applied:

| # | Commit | Description | Files |
|---|--------|-------------|-------|
| 122 | 2125dc11c7 | fix: show all provider models when no providers connected | dialog-model.tsx |
| 124 | fdd484d2c1 | feat: expose acp thinking variants | transform.ts, acp/session.ts |
| 132 | 45ec3105b1 | feat: support config skill registration | config.ts |
| 134 | aa92ef37fd | tweak: add 'skill' to permissions config section | config.ts |
| 136 | 301895c7f7 | fix: kimi k2.5 temperature for fireworks/coding | transform.ts |
| 145 | 33c5c100ff | fix: frontmatter newlines causing invalid model ids | markdown.ts |
| 146 | 0fabdccf11 | fix: ensure kimi doesnt have fake variants | transform.ts |
| 147 | 41ea4694db | more timeout race guards | prompt/index.tsx |
| 148 | e84d92da28 | feat: Sequential numbering for forked session titles | session/index.ts |
| 149 | 58ba486375 | guard destroyed input field in timeout | dialog-select.tsx |
| 151 | f40bdd1ac3 | feat(cli): include cache tokens in stats | stats.ts |
| 156 | 870c38a6aa | fix: maxOutputTokens accidentally hardcoded undefined | llm.ts |
| 157 | b937fe9450 | fix(provider): include providerID in SDK cache key | provider.ts |
| 158 | 427ef95f7d | fix: allow media-src data: URL for small audio files | server.ts |
| 163 | 4d2696e027 | tweak: add ctx.abort to grep tool | grep.ts |
| 166 | e5b33f8a5e | fix: add AbortSignal support to Ripgrep.files and GlobTool | ripgrep.ts |
| 176 | 8c05eb22b1 | fix(markdown): Add streaming prop to markdown element | session/index.tsx |
| 179 | 26e14ce628 | fix: add SubtaskPart with metadata reference | message-v2.ts |
| 196 | 558590712d | fix: ensure parallel tool calls dont double load AGENTS.md | instruction.ts |
| 201 | 63f5669eb5 | fix: ensure unsub(PartUpdated) always called in TaskTool | task.ts |
| 203 | aedd760141 | fix(cli): restore brand integrity of CLI wordmark | logo.tsx |
| 210 | 898118bafb | feat: support headless authentication for chatgpt/codex | plugin/codex.ts |

---

## MEDIUM PRIORITY - Review Individually

These have both opencode and app changes - need selective application:

| # | Commit | Description | Note |
|---|--------|-------------|------|
| 123 | cd4075faf6 | feat: add beta branch sync workflow | .github/workflows - may not need |
| 126 | cf5cf7b23e | chore: consolidate workflow files | .github/workflows - may not need |
| 161 | 8cdb82038a | docs: update experimental env vars in CLI docs | docs only - skip per policy |
| 172 | 9424f829eb | fix(ui): allow KaTeX inline math punctuation | UI package - may have CSS |
| 182 | 775d288027 | feat(i18n): add th locale support | i18n - probably skip |
| 188 | bdfd8f8b0f | feat(app): custom provider | Has opencode changes too |
| 207 | 7988f52231 | feat(app): use opentui markdown component | Has TUI changes |
| 219 | b8e726521d | fix(tui): handle 4-5 codes in c to copy logic | TUI specific |

---

## SKIP - Do Not Apply

### CI/Chores/Releases (48)
124, 125, 127, 128, 129, 130, 131, 135, 137, 138, 139, 140, 141, 143, 152, 153, 154, 159, 162, 165, 167, 168, 169, 170, 171, 173, 174, 175, 177, 178, 180, 181, 183, 184, 185, 186, 187, 189, 190, 191, 192, 193, 197, 198, 199, 200, 202, 204

### Desktop Specific (3)
142, 144, 180

### App/UI Only Changes (17)
Various app UI fixes, responsiveness, i18n translations, file tree, etc.

### Copilot/Telemetry (2)
144 - Copilot changes (skip per policy)
137 - Telemetry (skip per policy)

### Zen Model Updates (6)
These are marketing/config changes for free models - skip unless needed:
133, 6cc739701b, 5a56e8172f, 427cc3e153

---

## Detailed Bring List (Apply in Order)

```
# Provider/Model fixes
2125dc11c7 fix: show all provider models when no providers connected
301895c7f7 fix: kimi k2.5 temperature for fireworks/coding
0fabdccf11 fix: ensure kimi doesnt have fake variants
870c38a6aa fix: maxOutputTokens accidentally hardcoded undefined
b937fe9450 fix(provider): include providerID in SDK cache key

# Session/Message improvements
fdd484d2c1 feat: expose acp thinking variants
e84d92da28 feat: Sequential numbering for forked session titles
26e14ce628 fix: add SubtaskPart with metadata reference

# Config/Markdown fixes
33c5c100ff fix: frontmatter newlines causing invalid model ids
45ec3105b1 feat: support config skill registration
aa92ef37fd tweak: add 'skill' to permissions config section

# Tool improvements
4d2696e027 tweak: add ctx.abort to grep tool
e5b33f8a5e fix: add AbortSignal support to Ripgrep.files and GlobTool
63f5669eb5 fix: ensure unsub(PartUpdated) always called in TaskTool
558590712d fix: ensure parallel tool calls dont double load AGENTS.md

# TUI/CLI improvements
41ea4694db more timeout race guards
58ba486375 guard destroyed input field in timeout
f40bdd1ac3 feat(cli): include cache tokens in stats
8c05eb22b1 fix(markdown): Add streaming prop to markdown element
aedd760141 fix(cli): restore brand integrity of CLI wordmark

# Server/Security
427ef95f7d fix: allow media-src data: URL for small audio files

# Authentication
898118bafb feat: support headless authentication for chatgpt/codex
```

---

## Constraints Reminder

- **NO** web UI changes (packages/web)
- **NO** desktop app changes (packages/desktop)  
- **NO** telemetry (packages/telemetry)
- **NO** Copilot integration
- **NO** i18n translations (unless core functionality)
- **NO** CI workflows (unless critical for build)
- **NO** docs changes (per policy)

TUI and Rust GPUI are the targets.
