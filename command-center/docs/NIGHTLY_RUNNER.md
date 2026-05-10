# Nightly verification (GitHub + your Mac)

This repo supports an **honest** overnight loop: **pull (optional locally), install, test, build, Lighthouse (CI), logs**. It does **not** autonomously write code with an LLM.

- **Without your API keys and a tool you explicitly wire**, automation stops at **verify + report**. Treat any optional **post-test hook** as a **danger zone** (see below).

## What runs where

| Step | GitHub Actions (`nightly-command-center.yml`) | Local (`scripts/nightly-local.sh`) |
|------|-----------------------------------------------|--------------------------------------|
| Trigger | Daily **03:00 UTC** + **workflow_dispatch** | LaunchAgent, manual, or other scheduler |
| Git pull | Uses the commit GitHub checks out | Optional: `NIGHTLY_GIT_PULL=true` |
| Install / test / build | `npm ci`, `npm test`, `npm run build` in `command-center/` | Same (via `npm --prefix`) |
| Lighthouse (a11y ≥ 0.9) | Yes (same as PR workflow) | Not in script; run manually if needed (see [LOCAL_SETUP.md](./LOCAL_SETUP.md)) |
| Logs | Job log on GitHub; small **artifact** only if the job **fails** | `state/logs/nightly-<UTC-timestamp>.log` (see below) |

**Log path:** If the repo already has `state/logs/` at the **repository root**, logs go there. Otherwise they go to `command-center/state/logs/`.

## Local run

```bash
chmod +x command-center/scripts/nightly-local.sh
# from repo root:
command-center/scripts/nightly-local.sh
```

With sync to `origin`:

```bash
NIGHTLY_GIT_PULL=true command-center/scripts/nightly-local.sh
```

## Optional hook (`NIGHTLY_AI_HOOK`) — default off

To chain **your own** script after a green build (e.g. a **`codex`** or **`claude`** CLI — **not** shipped here; wire it yourself):

1. Create an **executable** script (recommended **outside** the repo; never commit secrets).
2. Export the path before running `nightly-local.sh`:

```bash
export NIGHTLY_AI_HOOK="$HOME/bin/my-nightly-codex.sh"
command-center/scripts/nightly-local.sh
```

If `NIGHTLY_AI_HOOK` is **unset**, nothing runs after build. If set but the path is **missing or not executable**, the script prints **skipped** and still exits **0** after tests/build. If set and **executable**, the hook **runs** (danger zone: this can start billable/unbounded automation if your script does).

**Security:** Do not print tokens or `.env` contents into the nightly log. Do not commit `.env` or API keys.

## macOS LaunchAgent (example)

Replace `/ABS/PATH/TO/REPO` with your real path (the folder that contains `command-center/`).

Plist runs daily at **03:30** in **your Mac’s local timezone** (not UTC).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.jarvis.nightly-local</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd "/ABS/PATH/TO/REPO" &amp;&amp; NIGHTLY_GIT_PULL=true command-center/scripts/nightly-local.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/jarvis-nightly-launchagent.out.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/jarvis-nightly-launchagent.err.log</string>
</dict>
</plist>
```

Install:

```bash
cp ai.jarvis.nightly-local.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ai.jarvis.nightly-local.plist
```

Uninstall: `launchctl unload ~/Library/LaunchAgents/ai.jarvis.nightly-local.plist`.

## GitHub: manual run

In the repository → **Actions** → **Nightly Command Center** → **Run workflow**.

## Cron expression (CI)

Scheduled workflow uses: **`0 3 * * *`** (03:00 UTC daily).
