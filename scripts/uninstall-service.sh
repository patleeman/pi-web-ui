#!/bin/bash

# Pi Web UI - macOS Service Uninstaller

PLIST_NAME="com.pi-web-ui.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "π Pi Web UI Service Uninstaller"
echo "================================"
echo ""

if [ -f "$PLIST_PATH" ]; then
    echo "Stopping and unloading service..."
    launchctl stop "$PLIST_NAME" 2>/dev/null || true
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    rm "$PLIST_PATH"
    echo "✓ Service uninstalled"
else
    echo "Service not installed (plist not found)"
fi
