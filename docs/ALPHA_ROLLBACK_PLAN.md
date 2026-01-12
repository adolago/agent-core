# Alpha Launch Rollback Plan

**Document Version:** 1.0
**Created:** 2026-01-12
**Last Updated:** 2026-01-12

This document outlines the rollback procedures for the agent-core alpha launch. Use this plan if critical issues are discovered that require reverting to a known-good state.

---

## Table of Contents

1. [Pre-Launch Checklist](#1-pre-launch-checklist)
2. [Known Working Versions](#2-known-working-versions)
3. [Rollback Procedures](#3-rollback-procedures)
4. [Data Backup](#4-data-backup)
5. [Monitoring](#5-monitoring)
6. [Emergency Contacts/Resources](#6-emergency-contactsresources)
7. [Go/No-Go Criteria](#7-gono-go-criteria)

---

## 1. Pre-Launch Checklist

### Core Services

- [ ] agent-core daemon starts without errors
- [ ] All three personas load correctly (Zee, Stanley, Johny)
- [ ] Qdrant is running and accessible at `localhost:6333`
- [ ] Memory operations (read/write) work correctly

### Messaging Gateway

- [ ] Zee gateway starts without errors
- [ ] WhatsApp connection established (if configured)
- [ ] Telegram bot responding (if configured)
- [ ] Persona routing works (`@stanley`, `@johny` mentions)

### Integration Tests

- [ ] `bun test` passes in agent-core
- [ ] Skills load from `.claude/skills/`
- [ ] Domain tools register correctly
- [ ] Daemon HTTP API responds at `http://127.0.0.1:3210`

### Infrastructure

- [ ] All git repos are clean (no uncommitted changes needed for launch)
- [ ] Binary built and installed: `~/bin/agent-core`
- [ ] Config directories exist: `~/.config/agent-core/`, `~/.zee/`
- [ ] Credentials are in place: `~/.zee/credentials/`

### Backups Completed

- [ ] Qdrant collections backed up
- [ ] Config files backed up
- [ ] Credentials backed up (encrypted)

---

## 2. Known Working Versions

### Git Commit Hashes (Alpha Baseline)

| Repository | Location | Commit Hash | Branch |
|------------|----------|-------------|--------|
| **agent-core** | `~/.local/src/agent-core` | `e02d967acd080f48b26b88a060d5e27c65e77513` | main |
| **tiara** | `~/.local/src/agent-core/vendor/tiara` | `3b82d0f65e8bef971826898dc8f475d7ed469c7e` | - |
| **zee** | `~/Repositories/personas/zee` | `44c73109fb9373f211c813d07d94863f12142330` | - |
| **stanley** | `~/Repositories/personas/stanley` | `0ff523b9daafb8846f24585a76f74013bece709f` | - |
| **johny** | `~/Repositories/personas/johny` | `8fdfa0277f3952e34cd435dcc92c92574abc3e4c` | - |

### Recent Commit Context

**agent-core:**
- `e02d967ac` - chore: update tiara submodule
- `35a6c16ae` - security: comprehensive pre-alpha and beta security fixes
- `979ef345a` - feat(stanley): add GUI launcher script

**tiara:**
- `3b82d0f6` - fix: deprecate legacy CLI spawn, update version references
- `8cf3f219` - refactor: integrate with agent-core daemon, prune dead code
- `7bb83d94` - fix: pre-alpha security and reliability improvements

**zee:**
- `44c73109` - docs: add external gateway mode documentation
- `72d62e1f` - refactor: rename opencode to agent-core naming
- `04d84644` - fix: improve gateway reliability and error handling

**stanley:**
- `0ff523b` - fix(gui): resolve GPUI API compatibility issues
- `4594cb9` - feat(gui): add agent-core daemon client, replace Python agent API
- `949c6b5` - fix(api): use environment variable for API base URL

**johny:**
- `8fdfa02` - Cap mastery history size in memory
- `aa05a80` - feat: implement MathAcademy-inspired learning system
- `2ccade3` - feat: initial Johny structure with learning skills

---

## 3. Rollback Procedures

### 3.1 Stop All Services

```bash
# Stop agent-core daemon
pkill -f "agent-core daemon" || true

# Stop zee gateway
pkill -f "pnpm zee gateway" || true
pkill -f "node.*zee.*gateway" || true

# Verify nothing is running
pgrep -af agent-core
pgrep -af zee
```

### 3.2 Rollback agent-core

```bash
cd ~/.local/src/agent-core

# Stash any local changes
git stash

# Reset to known-good commit
git checkout e02d967acd080f48b26b88a060d5e27c65e77513

# Update submodule
git submodule update --init --recursive

# Rebuild
cd packages/agent-core && bun install && bun run build

# Reinstall binary
cp dist/agent-core-linux-x64/bin/agent-core ~/bin/agent-core
```

### 3.3 Rollback tiara (Submodule)

```bash
cd ~/.local/src/agent-core/vendor/tiara

# Reset to known-good commit
git checkout 3b82d0f65e8bef971826898dc8f475d7ed469c7e

# Return to parent and update reference
cd ../..
git add vendor/tiara
```

### 3.4 Rollback zee

```bash
cd ~/Repositories/personas/zee

# Stash any local changes
git stash

# Reset to known-good commit
git checkout 44c73109fb9373f211c813d07d94863f12142330

# Reinstall dependencies
pnpm install
```

### 3.5 Rollback stanley

```bash
cd ~/Repositories/personas/stanley

# Stash any local changes
git stash

# Reset to known-good commit
git checkout 0ff523b9daafb8846f24585a76f74013bece709f

# Rebuild if necessary
cargo build --release
```

### 3.6 Rollback johny

```bash
cd ~/Repositories/personas/johny

# Stash any local changes
git stash

# Reset to known-good commit
git checkout 8fdfa0277f3952e34cd435dcc92c92574abc3e4c

# Reinstall dependencies if needed
bun install || npm install
```

### 3.7 Restore Services

```bash
# Start agent-core daemon
agent-core daemon --external-gateway --hostname 127.0.0.1 --port 3210 &

# Wait for daemon to initialize
sleep 5

# Start zee gateway
cd ~/Repositories/personas/zee && pnpm zee gateway &

# Verify services are running
curl -s http://127.0.0.1:3210/health || echo "Daemon not responding"
```

### 3.8 Emergency Full Reset Script

Save this as `~/bin/alpha-rollback.sh`:

```bash
#!/bin/bash
set -e

echo "=== Alpha Rollback Script ==="
echo "This will reset all persona repos to known-good alpha versions"
read -p "Are you sure? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo "Stopping services..."
pkill -f "agent-core" || true
pkill -f "zee.*gateway" || true
sleep 2

echo "Rolling back agent-core..."
cd ~/.local/src/agent-core
git stash || true
git checkout e02d967acd080f48b26b88a060d5e27c65e77513
git submodule update --init --recursive

echo "Rolling back zee..."
cd ~/Repositories/personas/zee
git stash || true
git checkout 44c73109fb9373f211c813d07d94863f12142330

echo "Rolling back stanley..."
cd ~/Repositories/personas/stanley
git stash || true
git checkout 0ff523b9daafb8846f24585a76f74013bece709f

echo "Rolling back johny..."
cd ~/Repositories/personas/johny
git stash || true
git checkout 8fdfa0277f3952e34cd435dcc92c92574abc3e4c

echo "Rebuilding agent-core..."
cd ~/.local/src/agent-core/packages/agent-core
bun install
bun run build
cp dist/agent-core-linux-x64/bin/agent-core ~/bin/agent-core

echo "=== Rollback Complete ==="
echo "Start services with:"
echo "  agent-core daemon --external-gateway --hostname 127.0.0.1 --port 3210"
echo "  cd ~/Repositories/personas/zee && pnpm zee gateway"
```

---

## 4. Data Backup

### 4.1 Qdrant Collections

**Location:** Qdrant stores data in its configured storage directory (default: `~/.local/share/qdrant/` or Docker volume).

**Backup procedure:**

```bash
# Create backup directory
mkdir -p ~/.zee/backups/qdrant/$(date +%Y%m%d)

# Using Qdrant snapshots API
curl -X POST "http://localhost:6333/collections/memories/snapshots" \
  -o ~/.zee/backups/qdrant/$(date +%Y%m%d)/memories-snapshot.json

# Or if using Docker, stop and copy volume
docker stop qdrant
cp -r /var/lib/docker/volumes/qdrant_storage ~/.zee/backups/qdrant/$(date +%Y%m%d)/
docker start qdrant
```

**Restore procedure:**

```bash
# Using Qdrant snapshots API
curl -X PUT "http://localhost:6333/collections/memories/snapshots/recover" \
  -H "Content-Type: application/json" \
  -d '{"location": "file:///path/to/snapshot"}'
```

### 4.2 Configuration Files

**Backup:**

```bash
mkdir -p ~/.zee/backups/config/$(date +%Y%m%d)

# agent-core config
cp -r ~/.config/agent-core ~/.zee/backups/config/$(date +%Y%m%d)/agent-core

# Persona state
cp -r ~/.zee/johny ~/.zee/backups/config/$(date +%Y%m%d)/johny
cp -r ~/.zee/stanley ~/.zee/backups/config/$(date +%Y%m%d)/stanley
cp -r ~/.zee/zee ~/.zee/backups/config/$(date +%Y%m%d)/zee-state
```

**Restore:**

```bash
BACKUP_DATE=20260112  # Set to backup date

cp -r ~/.zee/backups/config/$BACKUP_DATE/agent-core ~/.config/agent-core
cp -r ~/.zee/backups/config/$BACKUP_DATE/johny ~/.zee/johny
cp -r ~/.zee/backups/config/$BACKUP_DATE/stanley ~/.zee/stanley
cp -r ~/.zee/backups/config/$BACKUP_DATE/zee-state ~/.zee/zee
```

### 4.3 Credentials (Handle with Care)

**Location:** `~/.zee/credentials/`

**Backup (encrypted):**

```bash
mkdir -p ~/.zee/backups/credentials/$(date +%Y%m%d)

# Encrypt with GPG
tar czf - ~/.zee/credentials | \
  gpg --symmetric --cipher-algo AES256 \
  > ~/.zee/backups/credentials/$(date +%Y%m%d)/credentials.tar.gz.gpg
```

**Restore:**

```bash
BACKUP_DATE=20260112

gpg --decrypt ~/.zee/backups/credentials/$BACKUP_DATE/credentials.tar.gz.gpg | \
  tar xzf - -C /
```

### 4.4 What NOT to Backup

- Build artifacts (`dist/`, `node_modules/`, `target/`)
- Temporary files (`.wwebjs_cache/`)
- Log files (can regenerate)

---

## 5. Monitoring

### 5.1 Health Checks

**agent-core daemon:**

```bash
# Check if daemon is responding
curl -s http://127.0.0.1:3210/health

# Check daemon logs
journalctl -u agent-core -f  # if running as systemd service
# OR
tail -f ~/.local/state/agent-core/daemon.log
```

**Qdrant:**

```bash
# Check Qdrant health
curl -s http://localhost:6333/health

# Check collection stats
curl -s http://localhost:6333/collections/memories
```

### 5.2 Key Metrics to Watch

| Metric | Normal Range | Alert Threshold |
|--------|--------------|-----------------|
| Daemon response time | < 100ms | > 500ms |
| Memory usage | < 2GB | > 4GB |
| Qdrant query time | < 50ms | > 200ms |
| Error rate in logs | 0 | > 5/minute |

### 5.3 Log Locations

| Component | Log Location |
|-----------|--------------|
| agent-core daemon | `~/.local/state/agent-core/daemon.log` |
| agent-core TUI | `~/.local/state/agent-core/` (session logs) |
| zee gateway | stdout/stderr (run in tmux/screen) |
| Qdrant | Docker logs or `~/.local/share/qdrant/logs` |

### 5.4 Warning Signs

**Immediate rollback triggers:**

- Daemon crashes repeatedly (> 3 times in 10 minutes)
- Memory corruption errors in logs
- Qdrant connection failures
- Authentication/credential issues affecting all users

**Investigation needed (not immediate rollback):**

- Slow response times (but still functional)
- Occasional timeouts (< 5% of requests)
- Non-critical feature failures

---

## 6. Emergency Contacts/Resources

### 6.1 Documentation

| Resource | Location |
|----------|----------|
| agent-core CLAUDE.md | `~/.local/src/agent-core/CLAUDE.md` |
| Tiara documentation | `~/.local/src/agent-core/vendor/tiara/docs/` |
| Skills documentation | `~/.local/src/agent-core/docs/SKILLS.md` |
| Architecture docs | `~/.local/src/agent-core/docs/architecture/` |

### 6.2 External Resources

| Resource | URL |
|----------|-----|
| Qdrant documentation | https://qdrant.tech/documentation/ |
| OpenCode upstream | https://github.com/opencode/opencode |
| Bun documentation | https://bun.sh/docs |

### 6.3 Quick Reference Commands

```bash
# Check all service status
pgrep -af "agent-core\|qdrant\|zee"

# View recent errors
grep -i error ~/.local/state/agent-core/*.log | tail -20

# Restart everything
pkill -f agent-core; sleep 2; agent-core daemon --external-gateway &
cd ~/Repositories/personas/zee && pnpm zee gateway &

# Check disk space
df -h ~/.local ~/.config ~/.zee
```

---

## 7. Go/No-Go Criteria

### 7.1 Launch Go Criteria

All of the following must be true:

- [ ] All pre-launch checklist items completed
- [ ] Backups verified and restorable
- [ ] No critical errors in last 24 hours of testing
- [ ] All three personas responding correctly
- [ ] Memory operations (read/write/search) working
- [ ] At least one messaging gateway functional

### 7.2 Rollback Triggers (No-Go / Abort)

**Immediate rollback if ANY of these occur:**

1. **Data loss** - Any indication of memory corruption or lost data
2. **Security breach** - Unauthorized access or credential exposure
3. **Service unavailability** - Daemon down for > 5 minutes
4. **Cascade failures** - One component failure causing others to fail
5. **Critical persona failure** - Zee (primary) persona non-functional

**Consider rollback if:**

1. Error rate exceeds 10% of requests
2. Response times consistently > 5 seconds
3. Multiple non-critical features broken
4. User reports of data inconsistency

### 7.3 Rollback Decision Matrix

| Issue Severity | User Impact | Action |
|----------------|-------------|--------|
| Critical | All users affected | Immediate rollback |
| High | > 50% users affected | Rollback within 1 hour |
| Medium | < 50% users affected | Investigate, rollback if no fix in 4 hours |
| Low | Cosmetic/minor | Continue, fix forward |

### 7.4 Post-Rollback Actions

After executing a rollback:

1. Document what went wrong
2. Identify root cause
3. Create fix in development environment
4. Test fix thoroughly before re-launch
5. Update this rollback plan with lessons learned

---

## Appendix: Quick Rollback Checklist

For rapid response, use this abbreviated checklist:

- [ ] Stop all services: `pkill -f agent-core; pkill -f zee`
- [ ] Run rollback script: `~/bin/alpha-rollback.sh`
- [ ] Verify services start: `curl http://127.0.0.1:3210/health`
- [ ] Test persona response: Send test message
- [ ] Notify stakeholders of rollback
- [ ] Begin incident documentation

---

*End of Alpha Launch Rollback Plan*
