#!/usr/bin/env bash
# JERVIS · RUFLO BOOTSTRAP
# Initializează ruflo MCP server (claude-flow) pe mașina locală.
# Rulează O SINGURĂ DATĂ înainte de a folosi swarm/agentdb/aidefence.
#
# Diagnoza erorilor curente:
#   - swarm_init  → ENOENT mkdir /.claude-flow/swarm   (lipsă dir + permisiuni)
#   - aidefence   → "AIDefence package not available"  (lipsă npm pkg)
#   - memory      → "Database not initialized"          (lipsă init)
#
# Fix:

set -e

echo "[1/5] Creating ~/.claude-flow workspace..."
mkdir -p "$HOME/.claude-flow/swarm"
mkdir -p "$HOME/.claude-flow/memory"
mkdir -p "$HOME/.claude-flow/sessions"
mkdir -p "$HOME/.claude-flow/agentdb"

echo "[2/5] Setting CLAUDE_FLOW_HOME (export this in your shell rc)..."
export CLAUDE_FLOW_HOME="$HOME/.claude-flow"
echo "    → Add to ~/.zshrc:  export CLAUDE_FLOW_HOME=\"\$HOME/.claude-flow\""

echo "[3/5] Installing AIDefence package globally..."
npm install -g @claude-flow/aidefence 2>/dev/null || \
  npm install -g claude-flow-aidefence 2>/dev/null || \
  echo "    [warn] AIDefence install failed — try manual: npm i -g @claude-flow/aidefence"

echo "[4/5] Initializing memory database..."
if command -v claude-flow >/dev/null 2>&1; then
  claude-flow memory init || echo "    [warn] memory init failed — check claude-flow CLI"
else
  echo "    [warn] claude-flow CLI not found in PATH — install with: npm i -g claude-flow"
fi

echo "[5/5] Verification..."
ls -la "$HOME/.claude-flow/" || true

echo ""
echo "DONE. Restart MCP server in Cowork (or close & reopen) to pick up the init."
echo "Then test from chat: ruflo.swarm_init({topology:'mesh', maxAgents:5})"
