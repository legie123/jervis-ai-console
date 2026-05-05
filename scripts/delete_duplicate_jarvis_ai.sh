#!/usr/bin/env bash
# delete_duplicate_jarvis_ai.sh — V3 audit Phase 0 cleanup
# Author: Claude (sesiunea 2026-05-05)
#
# Removes the nested mini-project at /Antigraity/TRADE AI/Jarvis AI/.
# Confirmed by operator: D (delete).
#
# PRESERVES:
#   - claude Jarvis ai/      — Claude workspace (notes, plan, handoff, drafts)
#   - codex Jarvis ai/       — Codex workspace
#   - codex Jarvis code ai/  — older Codex workspace snapshot
#   - command-center/        — separate operator app (port 4317), NOT a duplicate
#   - CLAUDE/                — older snapshot of Claude workspace
#
# DELETES:
#   - Jarvis AI/src/         — duplicate WhatsApp bridge entrypoint
#   - Jarvis AI/test/        — duplicate tests (only place tests exist; parent will gain its own in Phase 9)
#   - Jarvis AI/data/        — runtime state of duplicate
#   - Jarvis AI/samples/     — voice samples for duplicate
#   - Jarvis AI/scripts/     — clone-elevenlabs-voice.js (duplicate)
#   - Jarvis AI/node_modules/, package-lock.json, package.json (duplicate "jarvis-whatsapp-bridge")
#   - Jarvis AI/README.md    (duplicate)
#   - Jarvis AI/.env*, .gitignore, .symdexignore, .DS_Store (duplicate config)
#   - Jarvis AI/.antigravity (duplicate Antigravity workspace)
#
set -euo pipefail

ROOT="/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/Jarvis AI"
[ -d "$ROOT" ] || { echo "FATAL: $ROOT missing"; exit 1; }

echo "==> Pre-flight"
ls -la "$ROOT" | head -30
echo

echo "==> Move duplicate WhatsApp tests into parent BEFORE delete (audit trail)"
PARENT_TESTS="/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/tests/_archived_whatsapp_bridge"
mkdir -p "$PARENT_TESTS"
for f in drafts.test.js elevenlabs.test.js webhook.test.js; do
  if [ -f "$ROOT/test/$f" ]; then
    cp "$ROOT/test/$f" "$PARENT_TESTS/$f"
    echo "  archived: $f"
  fi
done

echo
echo "==> Delete duplicate items (preserving workspaces + command-center)"
for item in src test data samples scripts node_modules package-lock.json package.json README.md .env .env.example .gitignore .symdexignore .DS_Store .antigravity; do
  TARGET="$ROOT/$item"
  if [ -e "$TARGET" ]; then
    rm -rf "$TARGET"
    echo "  deleted: $item"
  fi
done

echo
echo "==> Result"
ls -la "$ROOT"
echo
echo "DONE. Preserved:"
ls -la "$ROOT" | grep -E "(claude|codex|command-center|CLAUDE)" || true
echo
echo "Archived tests at: $PARENT_TESTS"
echo
echo "Next: cd to TRADE AI parent, run npm test on new tests/* modules."
