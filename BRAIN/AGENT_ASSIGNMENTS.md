---
project: jarvis-ai
last_updated: 2026-05-07
---

# Agent Assignments — JERVIS

Who owns what. Source of truth for "is this my job?".

## Module ownership

| Module          | Primary owner | Backup owner | Reviewer |
|-----------------|---------------|--------------|----------|
| Bridge UI :5173 | cursor        | claude       | claude   |
| Warp Core :7777 | claude        | codex        | claude   |
| Sensors         | claude        | codex        | claude   |
| Holodeck        | claude        | codex        | claude   |
| Shields         | claude        | -            | claude   |
| Transporter     | claude        | -            | claude   |
| Database        | claude        | hermes       | claude   |
| WhatsApp bridge :8787 | codex   | claude       | claude   |
| WhatsApp intent | claude        | codex        | claude   |
| Action router   | claude        | -            | claude   |
| Brain files     | hermes        | claude       | claude   |

## File ownership

| Path pattern                       | Owner    |
|------------------------------------|----------|
| `jervis-*.mjs`                     | claude   |
| `jervis-*.html`                    | claude   |
| `*.plist`, `install-*.sh`          | claude   |
| `BRAIN/master-plan/*`              | hermes   |
| `BRAIN/synthesis/*`                | hermes   |
| `BRAIN/tasks/*`                    | hermes   |
| `BRAIN/handoff/*__to__codex__*`    | hermes/claude (creator) |
| `BRAIN/handoff/*__to__cursor__*`   | hermes/claude (creator) |
| `BRAIN/handoff/codex__to__*`       | codex (writer) |
| `BRAIN/handoff/cursor__to__*`      | cursor (writer) |
| `BRAIN/PROJECT_STATUS.md`          | any (append) |
| `BRAIN/HANDOFF_CURRENT.md`         | last agent (overwrite "last session" + append below) |
| `BRAIN/DECISION_LOG.md`            | decision-maker (append) |
| `BRAIN/AGENT_ASSIGNMENTS.md` (this)| claude (only updated when assignments change) |
| `BRAIN/LEARNING.md`                | any (append) |
| `BRAIN/RISK_REGISTER.md`           | claude (curator) |
| `BRAIN/NEXT_ACTIONS.md`            | any (append) |
| `src/main.jsx`                     | mixed — DO NOT mass-rewrite (codex+claude+cursor history) |
| `src/components/claude/*`          | claude |
| `src/components/codex/*`           | codex |
| `src/styles.claude-patch.css`      | claude (additive only) |

## Branch ownership

| Branch pattern             | Owner      |
|----------------------------|------------|
| `main`                     | reviewed by claude + Andrei |
| `claude/<topic>`           | claude     |
| `codex/<topic>`            | codex      |
| `cursor/<topic>`           | cursor     |
| `hermes/<topic>`           | hermes     |
| `feat/<topic>`, `fix/<topic>`| Andrei or whoever started |

## Conflict escalation

If two agents both edit a file in same hour → escalate to claude + Andrei.
If Codex tries to push to a `claude/*` branch → blocked, ping claude.
If Cursor tries to refactor >3 files → blocked, ping claude.

## When in doubt

Default owner: **claude** (architect + safety reviewer).
