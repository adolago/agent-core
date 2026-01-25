# Backup Script

Complete backup solution for Zeebot including all workspaces, agents, and sandboxes.

## Usage

```bash
./scripts/backup-complete.sh
```

## What Gets Backed Up

The script creates a comprehensive backup in `~/.backup/zeebot/<timestamp>/`:

### Core State
- `~/.zeebot/` - Complete state directory including:
  - Agent configurations
  - Session history (all agents)
  - Sandbox workspaces
  - Credentials
  - Logs
  - Cron jobs
  - Browser state

### Workspaces
All configured agent workspaces are backed up with their original directory names.

The script automatically discovers workspaces by parsing `routing.agents.*.workspace` in your config.

### Docker Volumes (optional)
If Docker is running, the script will also export all `zeebot-*` Docker volumes as `.tar.gz` files.

## Backup Structure

```
~/.backup/zeebot/20260108125916/
├── .zeebot/                    # Complete state
├── zee/                        # Workspace 1
├── zee-agent2/                 # Workspace 2
├── zee-agent3/                 # Workspace 3
└── docker-volumes/               # Docker volumes (if available)
    └── zeebot-sandbox.tar.gz
```

## Restore

The script provides restore commands at the end of the backup. Example:

```bash
# Restore everything
rsync -a ~/.backup/zeebot/<timestamp>/.zeebot/ ~/.zeebot/

# Restore specific workspace
rsync -a ~/.backup/zeebot/<timestamp>/zee/ ~/zee/
```

## Features

- ✅ **Complete**: Backs up all state, workspaces, and sandboxes
- ✅ **Smart**: Auto-discovers workspaces from config
- ✅ **Safe**: Uses rsync for reliable copying
- ✅ **Timestamped**: Each backup has unique timestamp
- ✅ **Summary**: Shows what was backed up with sizes
- ✅ **Restore hints**: Provides ready-to-use restore commands

## Output Example

```
📦 Creating complete Zeebot backup...
Timestamp: 20260108125916
Target: /Users/user/.backup/zeebot/20260108125916

=== Core State Directory ===
📁 Backing up: /Users/user/.zeebot
  ✅ 120M - .zeebot (complete)

=== Workspace Directories ===
📁 zee
   Source: /Users/user/zee
   ✅ 3.1M (114 files)
📁 zee-agent2
   Source: /Users/user/zee-agent2
   ✅  28K (7 files)
📁 zee-agent3
   Source: /Users/user/zee-agent3
   ✅ 2.3M (24 files)

=== Agent Summary ===
🤖 agent1: 47 sessions → /Users/user/zee
🤖 agent2: 2 sessions → /Users/user/zee-agent2
🤖 agent3: 2 sessions → /Users/user/zee-agent3

=== Sandbox Summary ===
🐳 6 sandbox workspace(s) (included in .zeebot backup)

✅ Backup complete!

📊 Backup Structure:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  zee/                                  3.1M (114 files)
  zee-agent2/                            28K (7 files)
  zee-agent3/                           2.3M (24 files)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total: 125M
```

## When to Use

- Before major updates or configuration changes
- Before testing new features
- Regular maintenance backups
- Before migrating to a new machine
- After important agent sessions

## Requirements

- `rsync` (pre-installed on macOS/Linux)
- `jq` (for parsing config)
- Optional: Docker (for volume backups)
