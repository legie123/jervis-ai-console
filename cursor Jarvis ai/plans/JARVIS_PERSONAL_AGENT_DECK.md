# JARVIS Personal Agent Deck — Architecture (2026-05 snapshot)

Audience: Cursor / Codex builders extending the vanilla Command Center.

## Goal

Deliver a thin **interaction layer**: voice + keyboard + Unified Inbox coexist with a **Desk** pane for scratch notes and ordered priorities — without loosening sandbox security (browser cannot spawn native apps).

## Data plane

| Layer | Notes / priorities | Open app |
|-------|---------------------|----------|
| **Primary (Desk UI)** | `localStorage` keys `jarvis.personal.scratch` & `jarvis.personal.priorities` | N/A |
| **Operator (optional)** | `GET`/`POST` `/api/personal/{notes,priorities}` — filesystem under `data/<profile>/personal/` for backup / future sync | `POST` `/api/personal/open-app`: macOS `open -a` **only when** env `JARVIS_OPEN_APP_ALLOWLIST` permits; optional `JARVIS_OPEN_APP_CONFIRM_TOKEN`; CI via `JARVIS_OPEN_APP_DRY_RUN=true` |

The browser persists day-to-day work locally; operators may still ingest JSON backups independently of the UI path.

## Voice (`apps/web/src/components/voice-orb.js`)

Pure parser **`parseVoiceCommand`**: intents `desk_note`, `desk_add_priority`, `desk_open_app`. Handlers live in **`mountPersonalDesk`** (`apps/web/src/components/personal-desk.js`) and mutate the shared **`voiceCommandHandlers`** object passed into **`mountVoiceOrb`**.

Launch names normalize via **`canonicalizeDeskOpenApp`** (`apps/web/src/services/desk-open-app.js`) so speech such as “cursor” maps to **`Cursor`** for allowlist parity.

If `POST /api/personal/open-app` fails (empty allowlist, wrong host OS, denied token), the UI surfaces **`Desktop bridge · …`** toasts plus spoken error text — no silent fallback to shell.

## Ruflo / Hermes coordination (CLAUDE.md + feeds)

Mandatory collaboration feeds (**`command-center/apps/web/src/services/collaboration-feeds.js`**) enforce **Ruflo + Hermes + GoodMood** in Unified Inbox. The Desk exposes a **pulse strip** that reads **`/api/ruflo/feed`**.

**SendMessage-first swarm** stays out-of-band: tasks that mint agents/spawns should originate from Claude Code / MCP between named peers (`architect` ↔ `coder` ↔ …), not implicit polling here. **`npx @claude-flow/cli`** is appropriate only against pinned packages you have audited — never blind installs. For **Unified Inbox** rows, ensure emitted audit lines include **`adapterMatchers`** keywords (e.g. `ruflo`, `swarm`, `claude_flow` in `source` or `action` — see `apps/operator/src/http.js`).

### Continuity & Obsidian second brain

**Resume cold** using a minimal vault folder (`Jarvis/SESSION.md`, `Jarvis/NEXT.md`, `Jarvis/DECISIONS.md`) plus strict session order: **`BRAIN/HANDOFF_CURRENT.md` → `NEXT.md` → `git status`**. Full protocol, env, and matcher table: **[`JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md`](JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md)**.

## Security posture

- Browser: no unrestricted execution beyond user-consented APIs.
- Operator: **`open`** is gated by comma allowlists — never arbitrary subprocess arguments.

## Extend next

Wake word hosting; Hermes-managed backlog ingest from Desk snapshots; signed local helpers for Linux/Windows desktops.
