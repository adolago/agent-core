# Upstream Sync Guide

Agent-core is a fork of [OpenCode](https://github.com/sst/opencode) with persona-specific customizations. This guide documents how to track and merge upstream changes.

## Quick Commands

```bash
# Check upstream status
./scripts/check-upstream.sh --fetch

# Preview what would be merged
./scripts/sync-upstream.sh --preview

# Merge upstream changes
./scripts/sync-upstream.sh --merge
```

## Version Mapping

| agent-core Version | OpenCode Commit | Sync Date | Notes |
|-------------------|-----------------|-----------|-------|
| main (current) | 7cba1ff79 | 2025-01 | Initial fork point |

## Divergence Points

### Low Complexity (Additive)

These are additions that don't conflict with upstream:

| Area | Description | Files |
|------|-------------|-------|
| Persona Skills | Zee, Stanley, Johny skills | `.claude/skills/` |
| Custom Themes | Persona-specific TUI themes | `context/theme/*.json` |
| Tiara Submodule | Orchestration layer | `vendor/tiara/` |
| Anthropic Auth Submodule | Auth plugin tracked separately | `packages/opencode-anthropic-auth/` |
| Memory Types | Qdrant integration types | `src/memory/` |

### Medium Complexity (Modifications)

These modify upstream files and may require conflict resolution:

| Area | Description | Files |
|------|-------------|-------|
| Config Paths | `agent-core` naming | Global path constants |
| Agent Schema | Theme field added | `src/agent/agent.ts` |
| TUI Sidebar | Branch tree, MCP counts | `routes/session/sidebar.tsx` |
| TUI Header | Breadcrumb navigation | `routes/session/header.tsx` |

### High Complexity (Core Changes)

These significantly modify core functionality:

| Area | Description | Files |
|------|-------------|-------|
| Provider System | Custom transforms, antigravity | `src/provider/provider.ts` |
| Built-in Agents | Removed, replaced with personas | Agent loading logic |

## Sync Workflow

### Before Syncing

1. **Check status**: `./scripts/check-upstream.sh --fetch`
2. **Ensure clean state**: Commit or stash all changes
3. **Create sync branch**: `git checkout -b sync/upstream-YYYYMMDD`

### During Sync

1. **Preview changes**: `./scripts/sync-upstream.sh --preview`
2. **Review conflict-prone files** in the preview output
3. **Merge**: `./scripts/sync-upstream.sh --merge`

### Resolving Conflicts

For each conflicted file:

1. Check which divergence category it belongs to (see tables above)
2. For **additive changes**: Keep both, upstream structure + our additions
3. For **modifications**: Prefer upstream logic, re-apply our customizations
4. For **core changes**: Carefully merge, test thoroughly

### After Syncing

1. **Build**: `cd packages/agent-core && bun run build`
2. **Test**: Run with all three personas
3. **Update submodules**: `git submodule update --remote packages/opencode-anthropic-auth` (if needed)
4. **Commit**: Include sync metadata in commit message
5. **Update version mapping** in this document

## Common Conflict Patterns

### Provider Transforms

```typescript
// Upstream adds new provider
// Our change: Custom loader for google-antigravity
// Resolution: Add both, ensure our loader doesn't conflict with new one
```

### Gateway Ownership

```
// Upstream adds standalone gateway or council transport
// Our change: agent-core is the only gateway supervisor
// Resolution: keep agent-core embedded gateway; do not reintroduce standalone gateways
```

### Agent Schema

```typescript
// Upstream adds new field to Agent type
// Our change: Added 'theme' field
// Resolution: Include both fields
```

### TUI Components

```typescript
// Upstream modifies sidebar layout
// Our change: Added branch tree section
// Resolution: Merge layout changes, preserve our sections
```

## Automated Checks

The sync scripts perform these checks:

- [ ] Uncommitted changes detection
- [ ] Merge base identification
- [ ] Conflict-prone file warnings
- [ ] Post-merge build validation (manual)

## Troubleshooting

### "Cannot find merge base"

```bash
git fetch upstream
git merge-base HEAD upstream/dev
```

### Merge conflicts in generated files

Regenerate after resolving source conflicts:
```bash
bun run generate  # SDK types
bun run build     # Compiled output
```

### Theme conflicts

Our custom themes (`zee.json`, `stanley.json`, `johny.json`) are additive. If upstream changes theme structure, update our themes to match new format.

## Links

- [Upstream OpenCode](https://github.com/sst/opencode)
- [Patch Directory](../patches/agent-core/)
- [Roadmap Phase 5](./ROADMAP.md#phase-5-upstream-sync)
