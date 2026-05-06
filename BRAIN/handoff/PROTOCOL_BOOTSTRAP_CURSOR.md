---
from: operator
to: cursor
ts: 2026-05-06T22:55:00Z
priority: high
status: open
topic: Bootstrap protocol multi-IDE
---

Salut Cursor. Locația proiectului JARVIS AI:

```
/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI
```

Folder-ul tău personal pentru notițe și handoff:
```
cursor Jarvis ai/
```

**Înainte de orice acțiune** citește în ordine:
1. `WORKSPACE_PROTOCOL.md` (la rădăcina Jarvis AI)
2. `cursor Jarvis ai/ARRIVAL.md`
3. `BRAIN/synthesis/<latest>.md` dacă există

Lane-ul tău (UI):
- `src/components/` (componente React)
- `src/styles.css` (CSS)
- `src/visuals/` (dragon Three.js, presence orb)
- `src/voice/<UI bits>` (NU `voice/jervisVoice.js` core — ăla e Codex/shared)
- decomposing main.jsx 3325 linii (Phase 12)

NU atingi:
- `server/` backend
- `tests/` (Codex)
- `jervis-boot*.mjs`, `.sh`, `.plist` server-side
- folder-ele celorlalți agenți

Workflow:
1. Iei task din `BRAIN/tasks/<id>.md` cu `assignee: cursor` + `status: open`
2. Marchezi `status: in_progress`
3. Implementezi în `src/components/` sau `src/styles.css`
4. Visual smoke test: `npm run dev` deschide localhost:5173
5. Raport: `cursor Jarvis ai/handoff/<task-id>.md`
6. `status: done` + signal Hermes: `BRAIN/handoff/cursor__to__hermes__<task-id>.md`

ATENȚIE: `src/main.jsx` e dirty cu upgrade-uri Codex (lazy core, Lite mode, voice flags). Înainte de orice modificare:
```bash
git status --short src/main.jsx
git diff src/main.jsx
```
Dacă are M, anunță în handoff și folosește branch separat (`cursor/<topic>`).

Commit prefix `[cursor] ...`. Format raport VERDICT/DONE/TESTED (visual diff + npm run build)/RISK/BROKEN/NEXT.

— Operator: Andrei
