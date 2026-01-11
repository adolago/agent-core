#!/bin/bash
# Install agent-core as a systemd service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/agent-core.service"
TARGET="/etc/systemd/system/agent-core.service"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)"
   exit 1
fi

# Check if service file exists
if [[ ! -f "$SERVICE_FILE" ]]; then
    echo "Error: Service file not found at $SERVICE_FILE"
    exit 1
fi

# Copy service file
echo "Installing service file to $TARGET..."
cp "$SERVICE_FILE" "$TARGET"

# Create environment file directory if needed
mkdir -p /home/artur/.config/agent-core

# Create environment file template if it doesn't exist
ENV_FILE="/home/artur/.config/agent-core/daemon.env"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Creating environment file template at $ENV_FILE..."
    cat > "$ENV_FILE" << 'EOF'
# Agent Core Daemon Environment Configuration
# Add your API keys here (uncomment and fill in)

# =============================================================================
# LLM Provider Keys (at least one required)
# =============================================================================

# Anthropic API key (recommended)
# ANTHROPIC_API_KEY=your-key-here

# OpenAI API key (optional)
# OPENAI_API_KEY=your-key-here

# =============================================================================
# Tool API Keys
# =============================================================================

# EXA API key (for web search)
# EXA_API_KEY=your-key-here

# =============================================================================
# Telegram Gateway (Phase 2: Remote Access)
# =============================================================================

# Get your bot token from @BotFather on Telegram
# TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Restrict access to specific Telegram user IDs (comma-separated)
# Find your ID by messaging @userinfobot on Telegram
# Leave empty to allow all users (not recommended for public bots)
# TELEGRAM_ALLOWED_USERS=123456789,987654321

# =============================================================================
# Discord Gateway (Future - Phase 2)
# =============================================================================

# DISCORD_BOT_TOKEN=your-discord-token-here
EOF
    chown artur:artur "$ENV_FILE"
    chmod 600 "$ENV_FILE"
fi

# Create state directories
echo "Creating state directories..."
mkdir -p /home/artur/.local/state/agent-core
chown -R artur:artur /home/artur/.local/state/agent-core

# Reload systemd
echo "Reloading systemd..."
systemctl daemon-reload

echo ""
echo "Installation complete!"
echo ""
echo "The daemon starts both:"
echo "  - agent-core (AI agent engine)"
echo "  - zee gateway (WhatsApp/Telegram/Signal messaging)"
echo ""
echo "Next steps:"
echo "  1. Edit your API keys in: $ENV_FILE"
echo "  2. Install agent-core binary: ~/bin/agent-core"
echo "  3. Ensure zee gateway is set up: ~/Repositories/personas/zee"
echo "  4. Enable the service:    sudo systemctl enable agent-core"
echo "  5. Start the service:     sudo systemctl start agent-core"
echo "  6. Check status:          sudo systemctl status agent-core"
echo "  7. View logs:             journalctl -u agent-core -f"
echo ""
echo "Or use the CLI commands:"
echo "  agent-core daemon         # Start in foreground (with gateway)"
echo "  agent-core daemon --no-gateway  # Start without gateway"
echo "  agent-core daemon-status  # Check if running"
echo "  agent-core daemon-stop    # Stop the daemon"
