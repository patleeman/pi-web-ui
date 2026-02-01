#!/bin/bash
set -e

# Pi Web UI - macOS Service Installer
# This script installs the Pi Web UI server as a launchd service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.pi-web-ui.server"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/Library/Logs/pi-web-ui"

echo "π Pi Web UI Service Installer"
echo "=============================="
echo ""

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    exit 1
fi

NODE_PATH=$(which node)
echo "Using Node.js: $NODE_PATH"

# Build the project first
echo ""
echo "Building project..."
cd "$PROJECT_DIR"
npm run build

# Create log directory
mkdir -p "$LOG_DIR"

# Create the plist file
echo ""
echo "Creating launchd service..."

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$PROJECT_DIR/packages/server/dist/index.js</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$NODE_PATH")</string>
    </dict>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <true/>
    
    <key>StandardOutPath</key>
    <string>$LOG_DIR/stdout.log</string>
    
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/stderr.log</string>
    
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
EOF

echo "Created: $PLIST_PATH"

# Load the service
echo ""
echo "Loading service..."
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "✓ Pi Web UI service installed and started!"
echo ""
echo "Service commands:"
echo "  Start:   launchctl start $PLIST_NAME"
echo "  Stop:    launchctl stop $PLIST_NAME"
echo "  Restart: launchctl stop $PLIST_NAME && launchctl start $PLIST_NAME"
echo "  Status:  launchctl list | grep pi-web-ui"
echo "  Logs:    tail -f $LOG_DIR/stdout.log"
echo "  Errors:  tail -f $LOG_DIR/stderr.log"
echo ""
echo "Uninstall:"
echo "  launchctl unload $PLIST_PATH"
echo "  rm $PLIST_PATH"
echo ""
echo "The server will start automatically on login."
echo "Open http://localhost:3001 in your browser."
