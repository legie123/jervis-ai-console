# JARVIS Command Center Architecture

Status: PHASE 0 DOCS ONLY.

## Purpose

JARVIS is a local-first command operator hub.

It must plan actions, ask for confirmation when risk exists, execute only approved operations, and write audit logs.

## Required Flow

Presence -> Context recall -> Risk check -> Action draft -> Confirm -> Execute -> Log.

## Local Modules

- `apps/web`: command center UI.
- `apps/operator`: local operator runtime.
- `packages/core`: mission engine contracts.
- `packages/tools`: tool registry and adapters.
- `packages/whatsapp`: WhatsApp drafts only until explicit send approval exists.
- `packages/scheduler`: scheduled task logic.
- `packages/memory`: local memory store.
- `packages/obsidian`: Obsidian sync bridge.
- `packages/graphify`: Graphify operational map bridge.

## Boundaries

- Local-first.
- No secrets in code.
- No real WhatsApp sending in Phase 0.
- No external side effects without confirmation gates.

## Scheduler

Scheduler is local persistent queue.

It may move due WhatsApp drafts from `scheduled_draft` to `pending_confirmation`.

It must not auto-send WhatsApp messages.

## Backup

Backup writes local copies under `data/exports`.

State export returns memory, drafts, scheduled jobs, and audit log content.

Restore is guarded and only accepts backups under `data/exports`.

## Obsidian

Obsidian bridge writes Markdown summaries into a configured local vault.

Default behavior is disabled.

Sync is confirmation-gated and audit logged.

## Graphify

Graphify bridge exports a local operational map JSON.

Inputs:

- missions
- tool registry
- WhatsApp drafts
- WhatsApp inbox
- scheduler jobs
- audit summary

Output:

`data/exports/graphify-map.json`
