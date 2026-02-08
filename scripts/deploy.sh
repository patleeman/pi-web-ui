#!/bin/bash

# Pi-Deck - Build and Restart Service
# Quick deploy script for development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="com.pi-deck.server"
LOG_DIR="$HOME/Library/Logs/pi-deck"

cd "$PROJECT_DIR"

echo "π Pi-Deck Deploy"
echo "=================="
echo ""

# Build
echo "→ Building..."
npm run build

echo ""
echo "→ Restarting service..."
launchctl stop "$SERVICE_NAME" 2>/dev/null || true
sleep 1
launchctl start "$SERVICE_NAME"

# Wait a moment and check if it started
sleep 2
if launchctl list | grep -q "$SERVICE_NAME"; then
    echo ""
    echo "✓ Deployed successfully!"
    echo "  URL: http://localhost:3001"
    echo "  Logs: tail -f $LOG_DIR/stdout.log"
else
    echo ""
    echo "✗ Service may have failed to start. Check logs:"
    echo "  tail -20 $LOG_DIR/stderr.log"
    exit 1
fi
