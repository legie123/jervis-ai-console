---
project: jarvis-ai
last_updated: 2026-05-07
canonical: true
maintainers: [claude, codex, cursor, hermes]
---

# JERVIS — Project Status

Mirror of `ai-ide-alliance-brain/projects/jarvis-ai/STATUS.md` (less detailed; this file is the working copy that agents append to during sessions).

## Right now (2026-05-07)

| Module          | Status   | Owner         | Notes                                       |
|-----------------|----------|---------------|---------------------------------------------|
| Bridge UI :5173 | LIVE     | cursor        | Vite/React, BridgePanel widget integrated   |
| Warp Core :7777 | LIVE     | claude        | 10 endpoints, supervisor                    |
| WhatsApp :8787  | LIVE     | codex         | bridge external                             |
| Sensors         | LIVE     | claude        | poll WA 60s + Vault 90s                     |
| Holodeck        | LIVE     | claude        | Docker fallback subprocess                  |
| Shields         | LIVE     | claude        | local aidefence (17+11 patterns)            |
| Transporter     | LIVE     | claude        | state/transporter.json                      |
| Database        | LIVE     | claude        | Obsidian vault + state.json                 |

## Active branches

- `codex/whatsapp-cloud-run-live` — main working branch
- `cursor/p12-elite-ui-v0` — Cursor UI work (this folder is on this branch)
- `claude/bridge-panel-v4` — pushed 2026-05-07, BridgePanel widget

## Schedules

- Daily 22:00 — `jervis-captains-log-daily` (scheduled task)
- Daily 22:15 — LaunchAgent `com.jervis.captainslog` (OS-level fallback)
- Every 30 min — `jervis-memory-sync` (state → Anthropic memory MCP)

## Open questions

- Cursor's `cursor/p12-elite-ui-v0` ↔ `codex/whatsapp-cloud-run-live` merge plan
- Two BRAIN/ folders synchronization (canonical = this one per D-002)
- `jervis-boot-v3.mjs` — who created it? Codex? Hermes? Verify before mixing with v2
- Ruflo bootstrap — user may run when ready

## Health checklist (every session start)

- [ ] `curl localhost:7777/status` → 200 OK
- [ ] `git status -sb` → expected branch, no surprise dirty files
- [ ] `BRAIN/HANDOFF_CURRENT.md` → know what last agent left
- [ ] `BRAIN/NEXT_ACTIONS.md` → know what's next

## Append log

(agents append session start/end here, latest first)
