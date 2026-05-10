---
project: jarvis-ai
---

# JERVIS — Decision Log (project-scoped)

Append-only. Newest first. Cross-project decisions go to `ai-ide-alliance-brain/DECISION_LOG.md`.

Format:
```
## YYYY-MM-DD [agent] D-NNN — title
**Context:**
**Decision:**
**Rationale:**
**Reversal cost:** low|medium|high
```

---

## 2026-05-07 [claude] D-J008 — Keep jervis-boot-v3.mjs as separate V3 supervisor on :7778

**Context:** File appeared in working dir, source uncertain. Audit T-014 shows: written by claude-coder 2026-05-06. Companion supervisor on :7778 (NOT replacement for :7777). Hosts V3 modules: FSM 10-state, Intent Router 12 categories, 4-tier risk, Emergency stop, IDE Layer, email pipeline, mission graph emitter.
**Decision:** KEEP. Both supervisors run in parallel. v2 (`:7777`) = Bridge supervisor (this conversation built it). v3 (`:7778`) = advanced FSM + email + risk tiers companion.
**Rationale:** Different concerns. v2 is hot-path (Bridge UI polls). v3 is workflow-grade (FSM transitions + email pipeline). Loose coupling; can deploy/restart independently.
**Reversal cost:** low — kill `:7778` if not needed.

## 2026-05-07 [claude] D-J007 — Action router as separate module, not inline in intent loop

**Context:** WhatsApp intent extractor produces verdicts; need to act on `intent=command + urgency=high`. Could embed dispatch inline in intent module or extract.
**Decision:** Separate `jervis-action-router.mjs` module with explicit allowlist verbs + safety gates (rate limit, shields, RED gate, sender allowlist).
**Rationale:** Single Responsibility. Router can be tested without WA. New action sources (web, voice) reuse router.
**Reversal cost:** low

## 2026-05-07 [claude] D-J006 — BridgePanel as drop-in React component, no SSR

**Context:** Need UI in `/TRADE AI/` (Vite app) showing live `:7777` state.
**Decision:** Self-contained `JervisBridgePanel.jsx` with inline CSS, fetched-side state, drop-in via 2-line main.jsx change.
**Rationale:** Vite dev = pure browser, no SSR concerns. Inline CSS = zero new deps. Minimal main.jsx surface = won't conflict with Codex changes.
**Reversal cost:** low — delete file + revert 2 lines.

## 2026-05-06 [claude] D-J005 — LaunchAgent for OS-level scheduling fallback

**Context:** scheduled-tasks MCP only runs when Cowork is open. User wants daily Captain's Log even when laptop closed/Cowork off.
**Decision:** macOS LaunchAgent (`com.jervis.captainslog`) at 22:15, plus Cowork scheduled task at 22:10. Both run; idempotent.
**Rationale:** Belt + suspenders. LaunchAgent runs even with Cowork closed. Cowork task does the narrative pass.
**Reversal cost:** low — `launchctl unload`.

## 2026-05-06 [claude] D-J004 — Local aidefence preferred over Ruflo MCP

(Mirror of cross-project D-003 in alliance brain.)

## 2026-05-06 [claude] D-J003 — Holodeck dual engine (Docker + subprocess)

**Context:** Sandbox needs isolation. Docker = best, but not always available.
**Decision:** Auto-detect Docker at boot. If available → docker. Else → subprocess. Override via `?engine=docker|subprocess` query param.
**Rationale:** Robust to user environment. User can force when needed.
**Reversal cost:** low.

## 2026-05-06 [claude] D-J002 — HTTP supervisor on `:7777` separate from Vite UI

**Context:** UI is Vite/React on `:5173`. Supervisor logic could live in same Express server.
**Decision:** Separate process `jervis-boot.mjs` on `:7777`. UI fetches from supervisor.
**Rationale:** Independent lifecycle. Supervisor restarts don't affect UI HMR. Multiple UIs (LCARS HTML, React app) consume same supervisor.
**Reversal cost:** medium — would need to merge processes.

## 2026-05-06 [claude] D-J001 — JERVIS = personal AI agent, NOT trading

**Context:** Folder name "TRADE AI" implied trading focus. User clarified explicitly.
**Decision:** All future work = generic agent capabilities. NO trading/finance unless explicitly asked.
**Rationale:** User instruction. Folder name is legacy.
**Reversal cost:** N/A (this is identity).

---

(future decisions append above this line)
