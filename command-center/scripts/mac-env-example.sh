#!/usr/bin/env bash
# macOS Jarvis operator — safe env defaults (no secrets). Source from your shell; do not commit overrides.
# Does NOT bypass macOS TCC: enable Accessibility / Automation in System Settings for the app running Node.
#
# Usage: source command-center/scripts/mac-env-example.sh
# Or one-liner: see scripts/README-mac.md

# Operator bind (local only by default)
export JARVIS_HTTP_HOST="${JARVIS_HTTP_HOST:-127.0.0.1}"

# Personal desk — app launch bridge (comma-separated Application names as seen by macOS)
export JARVIS_OPEN_APP_ALLOWLIST="${JARVIS_OPEN_APP_ALLOWLIST:-Safari,Cursor,Terminal,Notes,Calendar}"

# Optional: require this token in POST /api/personal/open-app body { confirmToken }
# export JARVIS_OPEN_APP_CONFIRM_TOKEN="change-me"

# Recommended adapter stack (Obsidian + Ruflo + Hermes + GoodMood); set vault path separately.
export JARVIS_ADAPTERS_ENABLED="${JARVIS_ADAPTERS_ENABLED:-obsidian,ruflo,hermes,good_mood}"

# Obsidian — set to your vault; never commit real paths with private data in repo docs.
# export OBSIDIAN_VAULT_PATH="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/MyVault"
# export OBSIDIAN_WRITE_ENABLED=false
