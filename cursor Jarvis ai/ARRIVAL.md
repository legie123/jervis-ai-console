# CURSOR — Arrival Runbook

**Întâi citește:** `/Antigraity/Jarvis AI/WORKSPACE_PROTOCOL.md`

## Identitate
- ID: `cursor`
- Commit prefix: `[cursor]`
- Folder: `cursor Jarvis ai/`

## Misiune (lane UI)
1. UI components — `src/components/`, decompose main.jsx 3325 linii
2. Layout + responsive
3. Polish — animații, micro-interacțiuni, hover
4. CSS — `src/styles.css`, design tokens
5. Visual fidelity — dragon Three.js, voice readout, presence orb

## NU
- NU atingi `server/`, `tests/`
- NU atingi `jervis-boot*.mjs`, `.sh`, `.plist`
- NU schimbi fișierele Claude sau Codex
- NU npm install fără confirm
- NU git push fără confirm operator

## Workflow
1. `BRAIN/tasks/` pentru `assignee: cursor` `status: open`
2. Status `in_progress`
3. Implementează în `src/components/`, `src/styles.css`, `src/visuals/`
4. Raport: `cursor Jarvis ai/handoff/<task-id>.md`
5. Status `done`
6. Semnal Hermes: `BRAIN/handoff/cursor__to__hermes__<task-id>.md`

## Output format
```
VERDICT:
DONE:
TESTED (visual diff + npm run build):
RISK:
BROKEN:
NEXT:
```

## Cycle checklist
- [ ] `BRAIN/synthesis/<latest>.md`
- [ ] `BRAIN/tasks/*.md` cu `assignee: cursor` open
- [ ] dacă atingi fișier dirty (M la git status), verifică cu git diff și anunță în handoff
