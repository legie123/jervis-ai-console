# Local Setup

Status: PHASE 0 DOCS ONLY.

## Folder

`/Users/user/projects/JARVIS_COMMAND_CENTER`

## Current State

Local runtime implemented.

## Run

```bash
./scripts/start-local.sh
```

Then open:

`http://127.0.0.1:4317`

## Test

From repo root, if scripts expect that layout:

```bash
./scripts/healthcheck.sh
npm test
```

From `command-center/` (Node test runner + operator healthcheck script live here):

```bash
npm test
node apps/operator/src/healthcheck.js
```

## Production-style web UI (Vite)

From `command-center/`:

```bash
npm run build
npm run start:web
```

Open `http://127.0.0.1:4317` (or `PORT` if set). When `apps/web/dist/index.html` exists, the operator serves the bundled UI; otherwise it serves `apps/web/src/` for quick iteration without a build step.

Hot reload while editing the web app:

```bash
npm run dev:web
```

## Adapter feeds — Obsidian, Ruflo, GoodMood (required for full operator picture)

The operator exposes **opt-in** adapter feeds (`/api/adapters`, `/api/obsidian/feed`, `/api/ruflo/feed`, `/api/good-mood/feed`, `/api/hermes/feed`). The web UI’s **live unified inbox** and collaboration layer expect these names; wire them on every serious install.

1. **Enable adapters** (pick one style):

   ```bash
   export JARVIS_ADAPTERS_ENABLED=obsidian,ruflo,good_mood,hermes
   ```

   or set `JARVIS_ADAPTER_OBSIDIAN_ENABLED=true`, `JARVIS_ADAPTER_RUFLO_ENABLED=true`, `JARVIS_ADAPTER_GOOD_MOOD_ENABLED=true` (and Hermes if you use dispatch handoffs).

2. **Obsidian (writes + sync API)** still needs a vault path and write flag (see [Obsidian Sync](#obsidian-sync) below). Ruflo and GoodMood feeds aggregate **audit log** rows whose `source` / `action` text matches those adapters (for example log lines containing `ruflo`, `swarm`, `good_mood`, `coach`). Emit audit events from your agents with those keywords so the inbox fills.

## Scheduler

Run due local jobs:

```bash
./scripts/run-scheduler.sh
```

This only moves due WhatsApp drafts to `pending_confirmation`.

It does not send messages.

Optional background loop:

```bash
JARVIS_SCHEDULER_ENABLED=true JARVIS_SCHEDULER_INTERVAL_MS=60000 ./scripts/start-local.sh
```

The loop only activates due drafts for confirmation.

It does not send WhatsApp messages.

## Backup

Create backup:

```bash
./scripts/backup-local.sh manual
```

Export current state:

```bash
./scripts/export-state.sh
```

Restore backup:

```bash
./scripts/restore-local.sh data/exports/backup-name RESTORE_JARVIS
```

Restore overwrites local JARVIS data/docs/config from that backup.

## Obsidian Sync

Configure local `.env`:

```bash
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
OBSIDIAN_WRITE_ENABLED=true
OBSIDIAN_SYNC_CONFIRM_TOKEN=SYNC_OBSIDIAN
```

Sync JARVIS state summary:

```bash
./scripts/sync-obsidian.sh SYNC_OBSIDIAN
```

This writes `JARVIS/JARVIS State Summary.md` inside the configured vault.

## Graphify Export

Export operational map:

```bash
./scripts/export-graphify.sh
```

Output:

`data/exports/graphify-map.json`

## Intended Local Data

- `data/memory`: local memory.
- `data/logs`: audit logs.
- `data/drafts`: action drafts.
- `data/exports`: local exports and backups.

## Environment

Future config examples will live in:

- `config/.env.example`
- `config/tools.registry.json`
- `config/permissions.json`

No secrets should be committed or hardcoded.

## WhatsApp Send Access

Create local `.env` from `config/.env.example`.

Required for live send:

```bash
WHATSAPP_GRAPH_VERSION=v25.0
WHATSAPP_PHONE_NUMBER_ID=your_meta_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_meta_access_token
WHATSAPP_REAL_SEND_ENABLED=true
WHATSAPP_SEND_CONFIRM_TOKEN=CONFIRM_SEND
WHATSAPP_VERIFY_TOKEN=change-this-webhook-token
WHATSAPP_APP_SECRET=optional-but-recommended
```

Then create a draft in the UI and use Send Gate.

For inbound messages, expose local port `4317` with a tunnel and configure Meta webhook callback:

`https://your-public-url/webhooks/whatsapp`
