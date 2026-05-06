#!/usr/bin/env bash
# JERVIS · LaunchAgent installer
# Installs com.jervis.captainslog to run jervis-captains-log.mjs daily at 22:15.
# More reliable than crontab on macOS (survives sleep, wakes Mac if needed).
#
# Run: bash install-launchd.sh

set -e

PLIST_SRC="$(dirname "$0")/com.jervis.captainslog.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.jervis.captainslog.plist"

if [ ! -f "$PLIST_SRC" ]; then
  echo "ERR: source plist missing: $PLIST_SRC"
  exit 1
fi

# Detect node path and patch plist
NODE_BIN=$(command -v node)
if [ -z "$NODE_BIN" ]; then
  echo "ERR: node not in PATH"
  exit 1
fi
echo "[1/5] Detected node: $NODE_BIN"

# Copy plist with node path substitution
mkdir -p "$HOME/Library/LaunchAgents"
sed "s|/usr/local/bin/node|$NODE_BIN|g" "$PLIST_SRC" > "$PLIST_DST"
echo "[2/5] Plist installed: $PLIST_DST"

# Unload if already loaded
launchctl unload "$PLIST_DST" 2>/dev/null || true
echo "[3/5] Unloaded previous instance (if any)"

# Load
launchctl load "$PLIST_DST"
echo "[4/5] Loaded into launchd"

# Verify
if launchctl list | grep -q com.jervis.captainslog; then
  echo "[5/5] ✓ Active. Will fire daily at 22:15."
else
  echo "[5/5] ✗ Load reported but not visible in launchctl list"
  exit 2
fi

echo ""
echo "=== Useful commands ==="
echo "  Status:   launchctl list | grep jervis"
echo "  Run now:  launchctl start com.jervis.captainslog"
echo "  Stop:     launchctl unload $PLIST_DST"
echo "  Logs:     tail -f \"/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/Jarvis AI/state/logs/captainslog-launchd.log\""
