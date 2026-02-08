#!/bin/bash

# Client Rendering Performance Profiler
# Usage: ./scripts/profile-client.sh [test-name]
# Examples:
#   ./scripts/profile-client.sh                    # Run all tests
#   ./scripts/profile-client.sh baseline           # Run baseline test only
#   ./scripts/profile-client.sh streaming          # Run streaming test only
#   ./scripts/profile-client.sh memory             # Run memory leak test only

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_NAME="${1:-}"

echo "🔍 Pi-Deck - Client Performance Profiler"
echo "=========================================="

# Check if dev server is running
check_server() {
  if curl -s http://localhost:9741 > /dev/null 2>&1; then
    echo "✓ Dev server detected at http://localhost:9741"
    return 0
  else
    echo "✗ Dev server not running at http://localhost:9741"
    echo "  Please start it first: npm run dev"
    return 1
  fi
}

# Install playwright if needed
ensure_playwright() {
  if ! npx playwright --version > /dev/null 2>&1; then
    echo "Installing Playwright..."
    npm install -D @playwright/test
    npx playwright install chromium
  fi
}

# Run performance tests
run_tests() {
  local filter=""
  
  if [ -n "$TEST_NAME" ]; then
    case "$TEST_NAME" in
      baseline) filter="baseline idle performance" ;;
      streaming) filter="streaming text rendering performance" ;;
      paint|animation) filter="detect animation-related repaints" ;;
      memory|leak) filter="memory leak detection" ;;
      layout|thrashing) filter="layout thrashing detection" ;;
      mobile) filter="mobile viewport performance" ;;
      messagelist|component) filter="MessageList render efficiency" ;;
      *)
        echo "Unknown test: $TEST_NAME"
        echo "Available tests: baseline, streaming, animation, memory, layout, mobile, component"
        exit 1
        ;;
    esac
  fi

  cd "$PROJECT_ROOT"
  
  echo ""
  echo "Running performance tests..."
  
  if [ -n "$filter" ]; then
    echo "Filter: $filter"
    npx playwright test packages/client/tests/performance/render-profiling.spec.ts \
      --grep "$filter" \
      --reporter=list
  else
    npx playwright test packages/client/tests/performance/render-profiling.spec.ts \
      --reporter=list
  fi
}

# Main execution
main() {
  ensure_playwright
  
  if ! check_server; then
    exit 1
  fi
  
  echo ""
  run_tests
  
  echo ""
  echo "=========================================="
  echo "✓ Profiling complete!"
  echo ""
  echo "View detailed HTML report:"
  echo "  npx playwright show-report"
}

main "$@"
