#!/bin/sh
set -e
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"
node apps/operator/src/server.js &
OP_PID=$!
trap 'kill "$OP_PID" 2>/dev/null; exit 130' INT TERM
sleep 1
npm run dev -w @jarvis/web
STATUS=$?
kill "$OP_PID" 2>/dev/null || true
exit "$STATUS"
