# Alpha Test Status

## Summary

- **Total tests**: 691
- **Passing**: 690
- **Failing**: 0
- **Skipped**: 1
- **Pass rate**: 99.9%

## Current State (2026-01-12)

All tests are passing. The test suite has been fully remediated for the agent-core architecture.

## Test Fixes Applied

### Config File Naming (Fixed)
Tests were using `opencode.json` and `.opencode` directory but the config system was renamed to `agent-core.json` and `.agent-core`.
- Updated 8 test files to use new naming convention

### Agent Architecture (Fixed)
Tests expected old OpenCode agents (build, plan, general, explore) but agent-core uses Personas (zee, stanley, johny).
- Updated `test/agent/agent.test.ts` to test persona agents
- Updated `test/permission-task.test.ts` to use persona agents
- Updated `test/tool/read.test.ts` to use persona agents

### Permission System (Fixed)
Permission rule ordering and edge cases have been addressed:
- Task permission configuration tests passing
- Global permission precedence tests passing
- Permission merge order corrected

### Provider/Model Tests (Fixed)
Model variant generation and provider transform tests now pass:
- `ProviderTransform.variants` for Anthropic and Google
- `getModel` and `getSmallModel` config overrides
- Model variant generation and customization

## Skipped Test

One test is intentionally skipped:
- `skipped test` - Placeholder for future functionality

## Test Commands

```bash
# Run all tests
cd packages/agent-core && bun test

# Run specific test file
bun test test/agent/agent.test.ts

# Run with coverage
bun test --coverage

# Run via turbo (all packages)
bun turbo check
```

## Test Coverage

Key coverage areas:
- Agent configuration and personas
- Permission system (task permissions, global rules)
- Provider transforms (Anthropic, Google, OpenRouter)
- Session management and persistence
- Tool registry and execution
- Config loading and validation
- Keybind parsing
- Worktree management

## Changes Made

| File | Change |
|------|--------|
| `test/agent/agent.test.ts` | Complete rewrite for personas |
| `test/config/config.test.ts` | Replace opencode → agent-core |
| `test/permission-task.test.ts` | Replace opencode, agent names |
| `test/tool/read.test.ts` | Replace agent names |
| `test/provider/*.test.ts` | Replace opencode |
| `test/session/compaction.test.ts` | Replace opencode |
| `test/skill/skill.test.ts` | Replace .opencode |
| `test/mcp/headers.test.ts` | Replace opencode |
| `test/fixture/fixture.ts` | Replace opencode |

---
*Last updated: 2026-01-12*
*Test run: 690 pass, 0 fail, 1 skip (99.9% pass rate)*
