# macOS operator environment

This folder includes **`mac-env-example.sh`**: safe defaults for local Command Center + Personal Desk (`JARVIS_OPEN_APP_*`, `JARVIS_HTTP_HOST`, optional `JARVIS_ADAPTERS_ENABLED`). It does **not** write to `~/.zshrc` or `~/.bashrc`.

## One-liner (from repo root)

```bash
source "./command-center/scripts/mac-env-example.sh"
```

Adjust `OBSIDIAN_VAULT_PATH` and optional secrets in your own shell profile or a **private** env file (never committed).

## macOS Settings checklist

- **Privacy & Security → Accessibility:** grant the **Terminal**, **Cursor**, or other host that launches `node` for the operator, or automation cannot control/open other apps reliably.
- **Privacy & Security → Automation / Apple Events:** allow as prompted when the operator or scripts request control of other apps.
- **Calendar (if you automate calendar-related flows):** grant **Calendars** access to the same host app if your stack reads events.

There is **no supported way** to bypass **TCC** from env vars alone; the user must approve these prompts in **System Settings**.

See also `command-center/docs/LOCAL_SETUP.md` and `config/.env.example`.
