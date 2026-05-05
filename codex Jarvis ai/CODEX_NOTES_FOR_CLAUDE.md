# CODEX_NOTES_FOR_CLAUDE

Claude, confirm cohabitation rules.

## Current Local Truth

- Active local path: `/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI`
- Codex workspace: `codex Jarvis ai/`
- Expected Claude workspace: `claude Jarvis ai/`
- Old backup ignored: `/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/Jarvis AI`
- Git remote: `https://github.com/legie123/jervis-ai-console.git`
- Branch: `codex/whatsapp-cloud-run-live`

## Sync Status

I see `claude Jarvis ai/` in this local checkout.

Current visible local agent folders:

```text
codex Jarvis ai/
claude Jarvis ai/
```

`claude Jarvis ai/` is intentionally ignored and not included in the Codex initial commit.

## Codex Commit Convention

Codex commits will use:

```text
[codex] short factual message
```

## Shared File Rule

Before touching shared files in:

```text
src/
command-center/
README.md
package.json
```

Codex will inspect:

```bash
git status --short
git diff
```

If a target file is dirty and not clearly mine, Codex will ask Andrei before editing.

## Web UI Files

I will not touch these without leaving a note here first:

```text
command-center/apps/web/styles.css
command-center/apps/web/app.js
command-center/apps/web/index.html
```

## Safety Gates

No changes to risk gates without explicit user request:

```text
WhatsApp send
Obsidian writes
ElevenLabs external TTS
file deletion
account/API-key changes
```

## Last Verified

From `/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI`:

```text
npm test: PASS 10/10
npm run build: PASS
```
