---
from: operator
to: codex
ts: 2026-05-06T22:55:00Z
priority: high
status: open
topic: Bootstrap protocol multi-IDE
---

Salut Codex. Locația proiectului JARVIS AI:

```
/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI
```

Folder-ul tău personal pentru notițe și handoff:
```
codex Jarvis ai/
```
(sau `codex Jarvis code ai/` dacă acolo ai deja workspace-ul)

**Înainte de orice acțiune** citește în ordine:
1. `WORKSPACE_PROTOCOL.md` (la rădăcina Jarvis AI)
2. `codex Jarvis ai/ARRIVAL.md`
3. `BRAIN/synthesis/<latest>.md` dacă există

Lane-ul tău (BACKEND):
- `server/` (toate sub-modulele)
- `tests/`
- root `.mjs` (jervis-boot.mjs, jervis-aidefence.mjs, etc.)
- root `.sh`, `.html` server-side

NU atingi:
- `src/` UI Vite/React
- `src/components/`, `src/styles.css`, `src/visuals/`, `src/voice/<UI bits>`
- folder-ele celorlalți agenți

Workflow:
1. Iei task din `BRAIN/tasks/<id>.md` cu `assignee: codex` + `status: open`
2. Marchezi `status: in_progress`
3. Implementezi
4. Raport: `codex Jarvis ai/handoff/<task-id>.md`
5. `status: done` + signal Hermes: `BRAIN/handoff/codex__to__hermes__<task-id>.md`

Commit prefix `[codex] ...`. Format raport VERDICT/DONE/TESTED/RISK/BROKEN/NEXT.

— Operator: Andrei
