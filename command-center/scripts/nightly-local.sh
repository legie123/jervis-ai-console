#!/usr/bin/env bash
# Overnight local verification: optional git pull, npm ci / test / build, log to disk.
# Optional NIGHTLY_AI_HOOK: only runs if the path is an executable file (otherwise echoes skipped).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$CC_DIR/.." && pwd)"

if [[ -d "$REPO_ROOT/state/logs" ]]; then
  LOG_DIR="$REPO_ROOT/state/logs"
else
  LOG_DIR="$CC_DIR/state/logs"
fi
mkdir -p "$LOG_DIR"

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
LOG_FILE="$LOG_DIR/nightly-${TS}.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== nightly-local.sh start ==="
echo "timestamp_utc: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "repo_root: $REPO_ROOT"
echo "command_center: $CC_DIR"
echo "log_file: $LOG_FILE"

if [[ "${NIGHTLY_GIT_PULL:-}" == "true" ]]; then
  echo "--- git pull (NIGHTLY_GIT_PULL=true) ---"
  git -C "$REPO_ROOT" pull
else
  echo "--- git pull skipped (set NIGHTLY_GIT_PULL=true to enable) ---"
fi

echo "--- npm ci ---"
npm --prefix "$CC_DIR" ci

echo "--- npm test ---"
npm --prefix "$CC_DIR" test

echo "--- npm run build ---"
npm --prefix "$CC_DIR" run build

echo "--- NIGHTLY_AI_HOOK ---"
if [[ -z "${NIGHTLY_AI_HOOK:-}" ]]; then
  echo "NIGHTLY_AI_HOOK unset: no post-verify hook (default)."
elif [[ ! -f "$NIGHTLY_AI_HOOK" || ! -x "$NIGHTLY_AI_HOOK" ]]; then
  echo "NIGHTLY_AI_HOOK skipped (not an executable file): ${NIGHTLY_AI_HOOK}"
else
  echo "Executing NIGHTLY_AI_HOOK (user-wired path; may invoke LLM/CLI): ${NIGHTLY_AI_HOOK}"
  "$NIGHTLY_AI_HOOK"
fi

echo "=== nightly-local.sh OK ==="
