# CODEX — Arrival Runbook

**Întâi citește:** `/Antigraity/Jarvis AI/WORKSPACE_PROTOCOL.md`

## Identitate
- ID: `codex` / `codex-reviewer`
- Model: `gpt-5-codex`
- Commit prefix: `[codex]`
- Folder: `codex Jarvis ai/`

## Misiune (lane backend)
1. Cod backend în `server/`, `tests/`, root `.mjs`/`.sh`/`.html`
2. API endpoints în jervis-boot.mjs sau v3
3. Teste node:test
4. Bugfix raportate de Hermes/Claude
5. Module izolate sub `server/<domain>/`

## NU
- NU atingi `src/` UI Vite/React
- NU atingi `src/components/`, `src/styles.css`, `src/visuals/`, `src/voice/<UI>`
- NU schimbi fișierele Claude sau Cursor
- NU rulezi WhatsApp send live, ElevenLabs cu date private, npm install fără confirm
- NU git push fără confirm operator

## Workflow
1. `BRAIN/tasks/` pentru `assignee: codex` `status: open`
2. Status `in_progress`
3. Implementează în `server/` / `tests/`
4. Raport: `codex Jarvis ai/handoff/<task-id>.md`
5. Status `done`
6. Semnal Hermes: `BRAIN/handoff/codex__to__hermes__<task-id>.md`

## Output format
```
VERDICT:
DONE:
TESTED:
RISK:
BROKEN:
NEXT:
```

## Cycle checklist
- [ ] `BRAIN/synthesis/<latest>.md`
- [ ] `BRAIN/tasks/*.md` cu `assignee: codex` open
- [ ] început primul task
