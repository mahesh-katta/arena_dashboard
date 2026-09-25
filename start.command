#!/bin/bash
# Double-click this to run Arena Dashboard.
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
echo "Starting Arena Dashboard…"
if ! command -v node >/dev/null 2>&1; then
  echo "Node isn't installed. Install it once from https://nodejs.org"
  echo "(the LTS version), then double-click start.command again."
  read -r -p "Press Enter to close."
  exit 1
fi
node "$HERE/server.mjs" 8000 &
PID=$!
sleep 1
open http://localhost:8000 2>/dev/null || true
echo
echo "Open http://localhost:8000 in your browser."
echo "Close this window (or press Ctrl+C) to stop."
wait $PID
