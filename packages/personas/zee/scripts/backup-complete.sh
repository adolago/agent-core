#!/bin/bash
set -e

TIMESTAMP=$(date +"%Y%m%d%H%M%S")
BACKUP_DIR="$HOME/.backup/zeebot/$TIMESTAMP"
CONFIG_FILE="$HOME/.zeebot/zeebot.json"

echo "📦 Creating complete Zeebot backup..."
echo "Timestamp: $TIMESTAMP"
echo "Target: $BACKUP_DIR"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "=== Core State Directory ==="
echo "📁 Backing up: $HOME/.zeebot"
rsync -a "$HOME/.zeebot/" "$BACKUP_DIR/.zeebot/" 2>/dev/null
size=$(du -sh "$BACKUP_DIR/.zeebot" 2>/dev/null | cut -f1)
echo "  ✅ $size - .zeebot (complete)"

echo ""
echo "=== Workspace Directories ==="

# Parse config and backup all workspace directories with original names
if [ -f "$CONFIG_FILE" ]; then
  jq -r '.routing.agents // {} | to_entries[] | select(.value.workspace) | .value.workspace' "$CONFIG_FILE" 2>/dev/null | while read -r workspace_path; do
    # Expand tilde
    workspace_path="${workspace_path/#\~/$HOME}"
    
    if [ -d "$workspace_path" ]; then
      # Get directory name
      dir_name=$(basename "$workspace_path")
      
      echo "📁 $dir_name"
      echo "   Source: $workspace_path"
      
      # Backup with original directory name
      backup_path="$BACKUP_DIR/$dir_name"
      rsync -a "$workspace_path/" "$backup_path/" 2>/dev/null
      
      size=$(du -sh "$backup_path" 2>/dev/null | cut -f1)
      file_count=$(find "$backup_path" -type f 2>/dev/null | wc -l | tr -d ' ')
      echo "   ✅ $size ($file_count files)"
    fi
  done
fi

# Also check for common workspace locations
for common_ws in "$HOME/zee" "$HOME/projects/zee"; do
  if [ -d "$common_ws" ]; then
    dir_name=$(basename "$common_ws")
    backup_path="$BACKUP_DIR/$dir_name"
    
    # Only backup if not already done
    if [ ! -d "$backup_path" ]; then
      echo "📁 $dir_name (additional)"
      echo "   Source: $common_ws"
      rsync -a "$common_ws/" "$backup_path/" 2>/dev/null
      size=$(du -sh "$backup_path" 2>/dev/null | cut -f1)
      file_count=$(find "$backup_path" -type f 2>/dev/null | wc -l | tr -d ' ')
      echo "   ✅ $size ($file_count files)"
    fi
  fi
done

echo ""
echo "=== Agent Summary ==="
if [ -d "$HOME/.zeebot/agents" ]; then
  for agent_dir in "$HOME/.zeebot/agents"/*; do
    agent_name=$(basename "$agent_dir")
    session_count=0
    if [ -d "$agent_dir/sessions" ]; then
      session_count=$(find "$agent_dir/sessions" -type f 2>/dev/null | wc -l | tr -d ' ')
    fi
    
    workspace=$(jq -r ".routing.agents.\"$agent_name\".workspace // \"~/.zeebot/agents/$agent_name/agent\"" "$CONFIG_FILE" 2>/dev/null)
    echo "🤖 $agent_name: $session_count sessions → $workspace"
  done
fi

echo ""
echo "=== Sandbox Summary ==="
if [ -d "$HOME/.zeebot/sandboxes" ]; then
  sandbox_count=$(find "$HOME/.zeebot/sandboxes" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  echo "🐳 $sandbox_count sandbox workspace(s) (included in .zeebot backup)"
fi

echo ""
echo "✅ Backup complete!"
echo ""
echo "📊 Backup Structure:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ls -1 "$BACKUP_DIR" | while read -r item; do
  if [ -d "$BACKUP_DIR/$item" ]; then
    size=$(du -sh "$BACKUP_DIR/$item" 2>/dev/null | cut -f1)
    count=$(find "$BACKUP_DIR/$item" -type f 2>/dev/null | wc -l | tr -d ' ')
    printf "  %-35s %8s (%s files)\n" "$item/" "$size" "$count"
  fi
done
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "  Total: $total_size"
echo ""
echo "💾 Location: $BACKUP_DIR"
echo ""
echo "🔄 Restore Commands:"
echo "  # State & config:"
echo "  rsync -a $BACKUP_DIR/.zeebot/ ~/.zeebot/"
echo ""
echo "  # Workspaces:"
for ws in "$BACKUP_DIR"/zee*; do
  if [ -d "$ws" ]; then
    ws_name=$(basename "$ws")
    echo "  rsync -a $BACKUP_DIR/$ws_name/ ~/$ws_name/"
  fi
done

