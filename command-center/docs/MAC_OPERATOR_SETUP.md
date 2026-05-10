# macOS operator setup (Personal Desk, `open -a`, TCC)

This document is for developers running the **Jarvis operator on macOS** who use **Personal Desk** → **`POST /api/personal/open-app`** (macOS `open -a …`). It does **not** grant magical “full access” to the user’s Mac: **Privacy & Security (TCC)** still applies.

## What “full access” does and does not mean

- **Does mean:** you intentionally configure env vars, allowlists, and optional confirm tokens so the operator is allowed to launch **only** the app names you listed.
- **Does not mean:** Jarvis bypasses **Accessibility**, **Automation**, **Full Disk Access**, or other TCC prompts. If macOS blocks the parent process from controlling other apps, **`open -a`** may fail or hang until you approve the right host app in **System Settings → Privacy & Security**.
- **Honest limit:** even after approvals, **sandboxed** or **hardened** apps may still refuse AppleEvents or UI automation; test with your real shell (Terminal vs Cursor integrated terminal).

## Terminal / Cursor: Accessibility + Automation

When the operator runs **inside Terminal** or **Cursor’s terminal**, the process that executes `open` is typically **`Terminal.app`** or **`Cursor`**. If launches fail silently or the UI shows **“Desktop bridge …”** errors:

1. Open **System Settings → Privacy & Security → Accessibility** and enable **Terminal** and/or **Cursor** as needed.
2. Open **Privacy & Security → Automation** and allow the same app to control **System Events** / target apps if macOS prompts for it.

No repo script should flip these flags for you; they require **interactive user consent** in System Settings.

## Environment variables (open-app bridge)

Set in a **local** `.env` (see `config/.env.example`). **Do not** commit secrets or production tokens.

| Variable | Required | Description |
|----------|----------|-------------|
| `JARVIS_OPEN_APP_ALLOWLIST` | Yes for real launches | Comma-separated **exact** macOS app names, e.g. `Safari,Cursor,Terminal,Notes`. Only listed names are passed to `open -a`. |
| `JARVIS_OPEN_APP_CONFIRM_TOKEN` | Optional | If set, `POST /api/personal/open-app` must include `{ "confirmToken": "<same value>" }`. |
| `JARVIS_OPEN_APP_DRY_RUN` | Optional | `true` on CI or non-macOS hosts: log intent only, do not execute `open` (allowlist rules still apply). |

## Optional shell helpers (copy-paste only)

The repo **does not** modify your `~/.zshrc` automatically. If you want a shortcut, add something like this yourself:

```bash
# Example: run command-center from a fixed directory with a local .env
# export JARVIS_OPEN_APP_ALLOWLIST="Safari,Cursor,Terminal,Notes"
# cd /path/to/repo/command-center && npm run dev:local
```

Keep **`JARVIS_OPEN_APP_CONFIRM_TOKEN`** and any WhatsApp/Obsidian tokens **out of the shell history** where possible (use `.env` loaded by the operator, not inline in shared scripts).

## Related docs

- [LOCAL_SETUP.md](./LOCAL_SETUP.md) — adapters, Obsidian path, unified inbox.
- `config/.env.example` — full variable list and Obsidian + Ruflo recommended block.
