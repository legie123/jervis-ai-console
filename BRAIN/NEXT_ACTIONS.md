---
project: jarvis-ai
last_updated: 2026-05-07T03:35:00+02:00
---

# JERVIS — Next Actions

Concrete next steps, ordered by priority. Append-only at the top.
Mark done with `[x]` and date. Never delete done items in the same week (move to bottom after 7 days).

## P0 — blocking, do today

**[ACTIVE DISPATCH V2 — see `BRAIN/handoff/PROTOCOL_DISPATCH_2026-05-07-V2.md`]**

- [x] **T-009 (codex)** — Test suite ✅ DONE 113/113 tests green
- [x] **T-011 (cursor)** — BridgePanel polish ✅ DONE on cursor/bridge-panel-polish branch
- [x] **T-014 (claude)** — jervis-boot-v3.mjs audit ✅ DONE D-J008 (V3 companion :7778, KEEP)
- [x] **T-015 (claude)** — RISK_REGISTER R-15..R-17 added, R-07 closed ✅ DONE
- [ ] **T-010 (codex)** — Merge claude/bridge-panel-v4 + cursor/bridge-panel-polish to main working branch
- [ ] **T-012 (antigravity)** — Visual QA :5173 + :7777 (after T-010 merge)
- [ ] **T-013 (hermes)** — Synthesis 2026-05-07 update
- [ ] **T-016 (claude)** — Brain sync in-process replacement for failing LaunchAgent (deployed in jervis-brain-sync.mjs, awaits restart)

- [x] 2026-05-07 — `gh repo create legie123/ai-ide-alliance-brain --public` (DONE — repo LIVE)
- [ ] **Push pending local commits** on `codex/whatsapp-cloud-run-live` (ahead 2 of f8e632c + 80b4b6f)
  ```bash
  cd "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
  git fetch origin
  git pull --rebase origin codex/whatsapp-cloud-run-live
  git push origin codex/whatsapp-cloud-run-live
  ```

- [ ] **Activate LaunchAgent for brain mirror sync** (1 line, optional — auto-activates on next login):
  ```bash
  launchctl load ~/Library/LaunchAgents/com.jervis.brain-mirror-sync.plist
  ```

## P1 — important, do this week

- [ ] **Open as Obsidian vault**: open `/Antigraity/ai-ide-alliance-brain/` in Obsidian (separate from existing `/TRADE AI/` vault)
- [ ] **Plan Cursor branch merge**: `cursor/p12-elite-ui-v0` ↔ `codex/whatsapp-cloud-run-live` — needs scoped review (claude + cursor)
- [ ] **Identify `jervis-boot-v3.mjs` author** — was it Codex? Hermes? Decide: keep, archive, or merge into v2
- [ ] **Bootstrap Ruflo** (optional, when ready): `bash jervis-ruflo-bootstrap.sh`
- [ ] **Restart JERVIS supervisor** to pick up action router + WA intent loop changes

## P2 — should do, this month

- [ ] **Sync script**: one-way `Antigraity/Jarvis AI/BRAIN/` → `TRADE AI/Jarvis AI/BRAIN/` (or eliminate the mirror entirely)
- [ ] **WhatsApp action loop test**: send a real test message, verify intent extraction → action router → effect
- [ ] **Holodeck Docker pull pre-warm**: `docker pull node:22-alpine alpine:3.20 python:3.12-alpine` to avoid first-run delay
- [ ] **TRADE AI NEW discovery**: figure out what `/Antigraity/TRADE AI NEW/` is, add to `PROJECTS_INDEX.md`
- [ ] **Memory MCP first sync**: confirm scheduled task `jervis-memory-sync` actually works (next 30-min mark)

## P3 — nice to have

- [ ] **Voice activation**: wire `jervisVoice.js` wake word into supervisor (open issue from V3 work)
- [ ] **Multi-machine support**: env-driven paths instead of hardcoded
- [ ] **Captain's Log search UI**: small page in Vite UI to grep historical logs
- [ ] **LCARS dashboard**: integrate into Vite UI as alternate skin (currently standalone HTML)

## Done (last 7 days)

- [x] 2026-05-07 — `claude/bridge-panel-v4` pushed to GitHub
- [x] 2026-05-07 — `ai-ide-alliance-brain/` repo structure built locally (21 files)
- [x] 2026-05-07 — JERVIS BRAIN/ — 7 standardized files created (this file is one of them)
- [x] 2026-05-07 — `jervis-action-router.mjs` created and wired
- [x] 2026-05-07 — Memory MCP scheduled task `jervis-memory-sync` created
- [x] 2026-05-06 — JERVIS v2 supervisor `:7777` live (10 endpoints)
- [x] 2026-05-06 — Local aidefence module (replaces ruflo MCP for hot path)
- [x] 2026-05-06 — Holodeck dual engine (Docker + subprocess)
- [x] 2026-05-06 — LaunchAgent for daily Captain's Log
- [x] 2026-05-06 — `BridgePanel` widget integrated in `/TRADE AI/src/main.jsx`
