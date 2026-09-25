#!/bin/bash
# Double-click this to run Arena Drill.
cd "$(dirname "$0")/.."
echo "Starting Arena Drill…"
if command -v node >/dev/null 2>&1; then
  node app/server.mjs 8000 &
elif command -v python3 >/dev/null 2>&1; then
  echo "(Node isn't installed — falling back to the Python server.)"
  python3 app/serve.py 8000 &
else
  echo "Neither Node nor Python 3 is installed."
  echo "Install Node from https://nodejs.org and run this again."
  read -r -p "Press Enter to close."
  exit 1
fi
PID=$!
sleep 1
open http://localhost:8000 2>/dev/null || true
echo
echo "Open http://localhost:8000 in your browser."
echo "Close this window (or press Ctrl+C) to stop."
wait $PID
