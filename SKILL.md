---
name: "jervis-ai-console-operator"
description: "Operate and improve the JERVIS AI Console with risk gates, tool bridge, WhatsApp live mode, Obsidian, Graphify, audit logs, and premium operational UI."
---

# JERVIS AI Console Operator Skill

## Purpose

Use this skill when working on the JERVIS AI Console repository.

JERVIS is an operational assistant console, not a demo UI. The expected product flow is:

Presence -> Context recall -> Risk check -> Action draft -> Confirm -> Execute -> Log.

## Operating Rules

- Inspect code before editing.
- Preserve existing behavior unless the task explicitly requires a change.
- Do not expose secrets, local memory, contacts, audit logs, or schedule data.
- Do not commit `.env`, `data/`, `dist/`, `node_modules/`, `reports/`, or local agent folders.
- Do not add fake statuses or decorative-only UI.
- Every visible button must have a handler and visible result.
- Every external action must be draft-first and confirmation-gated.
- If an executor is missing, show `Not connected`, `Draft only`, or `Requires setup`.
- Never silently mark external messages as sent unless the executor actually sent them.

## Repository Layout

- `src/main.jsx`: main React UI and JERVIS console behavior.
- `src/styles.css`: premium console UI, responsive layout, motion states.
- `server/index.js`: Express server, API routes, local tool bridge, risk gates.
- `server/whatsapp/`: WhatsApp Cloud API client, executor, webhook handling.
- `Jarvis AI/`: standalone WhatsApp bridge package and tests.
- `scripts/jarvis-obsidian-terminal.sh`: local Obsidian helper.

## Verification

Run these checks after changes:

```bash
npm run build
cd "Jarvis AI" && npm test
```

For browser checks, run the app locally:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Required Truth Labels

Use these labels when reporting status:

- `REAL`: verified working.
- `MOCK`: fake/demo/stub.
- `PARTIAL`: works but incomplete.
- `BROKEN`: does not work.
- `DANGEROUS`: can damage data, money, accounts, or external communication.
- `UNVERIFIED`: not checked.

## Final Report Format

Always report with:

```text
VERDICT:
DONE:
TESTED:
RISK:
BROKEN:
NEXT:
```
