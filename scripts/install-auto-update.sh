#!/bin/bash
set -e

# Install auto-update as a launchd scheduled job
# Checks for updates every 5 minutes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.pi-deck.auto-update"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

# Default interval: 300 seconds (5 minutes)
INTERVAL=${1:-300}

echo "π Pi-Deck Auto-Update Installer"
echo "=================================="
echo ""
echo "Check interval: $INTERVAL seconds"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$PROJECT_DIR/scripts/auto-update.sh</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    
    <key>StartInterval</key>
    <integer>$INTERVAL</integer>
    
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/pi-deck/update.log</string>
    
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/pi-deck/update-error.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "✓ Auto-update installed! Checking every $INTERVAL seconds."
echo ""
echo "Commands:"
echo "  View logs:  tail -f ~/Library/Logs/pi-deck/update.log"
echo "  Disable:    launchctl unload $PLIST_PATH"
echo "  Remove:     rm $PLIST_PATH"
