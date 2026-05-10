# Local Setup

Status: PHASE 0 DOCS ONLY.

**Hosting cloud (Cloud.ru etc.):** vezi [DEPLOY_CLOUD_RU.md](./DEPLOY_CLOUD_RU.md).

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

For the **recommended single dev URL** with hot reload, see [Local UI — one URL (recommended)](#local-ui--one-url-recommended) below.

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

## Lighthouse (accessibility gate, Faza 1)

CI rulează **@lhci/cli** pe build-ul static după `npm test` (vezi `lighthouserc.json` în `command-center/`). Local, după build:

```bash
cd command-center
npm run build
npx --yes @lhci/cli@0.14.0 autorun --config=./lighthouserc.json
```

Eșuează dacă scorul categoriei **accessibility** scade sub **0.9** (90).

## Local UI — one URL (recommended)

**Canonical dev URL (UI always up to date, HMR):** **`http://127.0.0.1:5173`**

From `command-center/` run **one** command — it starts the operator (API on **4317**) and Vite (UI on **5173**). Vite proxies `/api` and `/webhooks` to the operator, so the browser only talks to **5173**.

```bash
cd command-center
npm install
npm run dev:local
```

Then open **`http://127.0.0.1:5173/`**. Keep the terminal open.

- If you see **`ERR_CONNECTION_REFUSED` on 5173**, the dev server is not running — use `npm run dev:local` (or start the operator separately, then `npm run dev:web`; see env below).
- Advanced: set **`JARVIS_OPERATOR_ORIGIN`** (default `http://127.0.0.1:4317`) if the API listens elsewhere; set **`VITE_DEV_PORT`** to change the UI port.

### Operator only (no Vite, single process)

```bash
npm run start:web
```

Open **`http://127.0.0.1:4317`** (or `PORT`). When `apps/web/dist/index.html` exists, the operator serves the built bundle; otherwise it serves `apps/web/src/`.

### Production-style bundle

```bash
npm run build
npm run start:web
```

## Adapter feeds — Obsidian, Ruflo, GoodMood (required for full operator picture)

The operator exposes **opt-in** adapter feeds (`/api/adapters`, `/api/obsidian/feed`, `/api/ruflo/feed`, `/api/good-mood/feed`, `/api/hermes/feed`). The web UI’s **live unified inbox** and collaboration layer expect these names; wire them on every serious install.

1. **Enable adapters** (pick one style):

   ```bash
   export JARVIS_ADAPTERS_ENABLED=obsidian,ruflo,good_mood,hermes
   ```

   or set `JARVIS_ADAPTER_OBSIDIAN_ENABLED=true`, `JARVIS_ADAPTER_RUFLO_ENABLED=true`, `JARVIS_ADAPTER_GOOD_MOOD_ENABLED=true` (and Hermes if you use dispatch handoffs).

2. **Obsidian (writes + sync API)** still needs a vault path and write flag (see [Obsidian Sync](#obsidian-sync) below). **Ruflo**, **Hermes**, and **GoodMood:** the web UI **always** calls `/api/ruflo/feed`, `/api/hermes/feed`, and `/api/good-mood/feed` on inbox refresh. Enable the matching `JARVIS_ADAPTER_*` flags and emit audit rows tagged `ruflo` / `swarm` / `claude_flow`, `hermes` / `dispatcher` / `handoff`, or `good_mood` / `coach` / `mood` so those channels show live rows instead of only fallback cards.

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

## Suggested MCP & extensions (agentic workspaces)

These pair well with a local operator + command center; install from the Cursor / VS Code marketplace by name (IDs change, so search in-product).

- **Browser / web automation MCP** — lets an agent verify pages and workflows without guessing URLs; useful for “dashboard + webhook” integration smoke tests ([Cursor MCP docs](https://cursor.com/docs/context/mcp)).
- **Figma MCP (official)** — bridges design tokens and screens when you want the desk UI and Figma libraries to stay aligned ([Figma MCP](https://www.figma.com/mcp/catalog/)).
- **Git / project MCP (e.g. GitHub)** — keeps PRs, issues, and code search in the same loop as the operator when you outgrow ad-hoc scripts ([GitHub MCP](https://github.com/github/github-mcp-server)).
