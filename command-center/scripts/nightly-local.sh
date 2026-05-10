#!/usr/bin/env bash
# Overnight local verification: optional git pull, npm ci / test / build, log to disk.
# Optional NIGHTLY_AI_HOOK: only runs if the path is an executable file (otherwise echoes skipped).
# Optional NIGHTLY_LOOP_HOURS (+ NIGHTLY_LOOP_INTERVAL_SEC): after one full verify, repeats
#   npm test every interval seconds until the wall-clock window expires (see NIGHTLY_RUNNER.md).
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

NIGHTLY_LOOP_HOURS_RAW="${NIGHTLY_LOOP_HOURS:-}"
NIGHTLY_LOOP_ACTIVE=0
NIGHTLY_LOOP_INTERVAL_SEC_RAW="${NIGHTLY_LOOP_INTERVAL_SEC:-3600}"

if [[ -n "$NIGHTLY_LOOP_HOURS_RAW" ]]; then
  if [[ ! "$NIGHTLY_LOOP_HOURS_RAW" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    echo "ERROR: NIGHTLY_LOOP_HOURS must be a non-negative number (e.g. 1 or 1.5); got: ${NIGHTLY_LOOP_HOURS_RAW}" >&2
    exit 1
  fi
  LOOP_SEC_WINDOW="$(awk -v h="$NIGHTLY_LOOP_HOURS_RAW" 'BEGIN { w=int(h*3600+0.5); if (w < 1) w=1; print w }')"
  if awk -v h="$NIGHTLY_LOOP_HOURS_RAW" 'BEGIN { exit !(h > 0) }'; then
    NIGHTLY_LOOP_ACTIVE=1
  fi
  if [[ ! "$NIGHTLY_LOOP_INTERVAL_SEC_RAW" =~ ^[0-9]+$ ]] || [[ "$NIGHTLY_LOOP_INTERVAL_SEC_RAW" -lt 1 ]]; then
    echo "ERROR: NIGHTLY_LOOP_INTERVAL_SEC must be a positive integer (seconds); got: ${NIGHTLY_LOOP_INTERVAL_SEC_RAW}" >&2
    exit 1
  fi
fi

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

if [[ "$NIGHTLY_LOOP_ACTIVE" -eq 1 ]]; then
  LOOP_DEADLINE=$(( $(date +%s) + LOOP_SEC_WINDOW ))
  INTERVAL_SEC="$NIGHTLY_LOOP_INTERVAL_SEC_RAW"
  echo "--- NIGHTLY_LOOP: window_seconds=${LOOP_SEC_WINDOW} interval_seconds=${INTERVAL_SEC} deadline_epoch=${LOOP_DEADLINE} ---"
  echo "--- NIGHTLY_LOOP: repeating npm test until deadline (initial full verify already completed) ---"
  while true; do
    NOW="$(date +%s)"
    if [[ "$NOW" -ge "$LOOP_DEADLINE" ]]; then
      echo "--- NIGHTLY_LOOP: deadline reached (${NOW} >= ${LOOP_DEADLINE}) ---"
      break
    fi
    REMAINING=$((LOOP_DEADLINE - NOW))
    SLEEP_SEC=$INTERVAL_SEC
    if [[ "$SLEEP_SEC" -gt "$REMAINING" ]]; then
      SLEEP_SEC=$REMAINING
    fi
    if [[ "$SLEEP_SEC" -le 0 ]]; then
      break
    fi
    echo "--- NIGHTLY_LOOP: sleep ${SLEEP_SEC}s (remaining_window_s≈${REMAINING}) ---"
    sleep "$SLEEP_SEC"
    NOW="$(date +%s)"
    if [[ "$NOW" -ge "$LOOP_DEADLINE" ]]; then
      echo "--- NIGHTLY_LOOP: deadline reached post-sleep ---"
      break
    fi
    echo "--- npm test (NIGHTLY_LOOP iteration) ---"
    npm --prefix "$CC_DIR" test
  done
fi

echo "=== nightly-local.sh OK ==="
