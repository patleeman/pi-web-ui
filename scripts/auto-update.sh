#!/bin/bash
set -e

# Pi-Deck - Auto Update Script
# Checks for git changes, pulls, rebuilds, and restarts the service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.pi-deck.server"
LOG_FILE="$HOME/Library/Logs/pi-deck/update.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cd "$PROJECT_DIR"

# Fetch latest changes
git fetch origin

# Get current and remote HEAD
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($LOCAL)"
    exit 0
fi

log "Update available: $LOCAL -> $REMOTE"

# Reset to remote (discard local changes)
log "Resetting to remote..."
git reset --hard "$REMOTE"

# Install dependencies if package-lock changed
if git diff --name-only "$LOCAL" "$REMOTE" | grep -q "package-lock.json"; then
    log "Installing dependencies..."
    npm install
fi

# Rebuild
log "Rebuilding..."
npm run build

# Restart service
log "Restarting service..."
launchctl stop "$PLIST_NAME" 2>/dev/null || true
launchctl start "$PLIST_NAME"

log "Update complete! Now running $(git rev-parse --short HEAD)"
