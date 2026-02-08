#!/bin/bash

# Pi-Deck - Start in Background (without launchd)
# Use this for quick testing. For persistent service, use install-service.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.pi-deck.pid"
LOG_FILE="$PROJECT_DIR/.pi-deck.log"

case "${1:-start}" in
    start)
        if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "Pi-Deck is already running (PID: $(cat $PID_FILE))"
            exit 1
        fi
        
        echo "Starting Pi-Deck server..."
        cd "$PROJECT_DIR"
        
        # Build if needed
        if [ ! -f "packages/server/dist/index.js" ]; then
            echo "Building..."
            npm run build
        fi
        
        # Start in background
        NODE_ENV=production nohup node packages/server/dist/index.js > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        
        sleep 1
        if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "✓ Server started (PID: $(cat $PID_FILE))"
            echo "  URL: http://localhost:3001"
            echo "  Logs: tail -f $LOG_FILE"
            echo "  Stop: $0 stop"
        else
            echo "✗ Failed to start server. Check logs:"
            tail -20 "$LOG_FILE"
            rm -f "$PID_FILE"
            exit 1
        fi
        ;;
        
    stop)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                echo "Stopping Pi-Deck (PID: $PID)..."
                kill "$PID"
                rm -f "$PID_FILE"
                echo "✓ Stopped"
            else
                echo "Process not running, cleaning up PID file"
                rm -f "$PID_FILE"
            fi
        else
            echo "Pi-Deck is not running (no PID file)"
        fi
        ;;
        
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
        
    status)
        if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "Pi-Deck is running (PID: $(cat $PID_FILE))"
        else
            echo "Pi-Deck is not running"
        fi
        ;;
        
    logs)
        if [ -f "$LOG_FILE" ]; then
            tail -f "$LOG_FILE"
        else
            echo "No log file found"
        fi
        ;;
        
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
