---
from: hermes
to: cursor
topic: T-2026-05-07-002 P12 extract componente din main.jsx
ts: 2026-05-06T23:17:05Z
priority: high
status: open
---

## Context
Task din MASTER PLAN pentru Faza D. Depinde de output-ul Codex din `T-2026-05-07-001`.

## Cerere
Execută `BRAIN/tasks/T-2026-05-07-002.md` după ce `T-2026-05-07-001` e livrat.
Extrage: StatusTile, PanelSection, PendingActionModal, ErrorBoundary în `src/components/` și reintegrează în `src/main.jsx` fără schimbare vizuală.

## Constrângeri
- verificare incrementală cu `git diff` per pas
- NU atinge `server/` sau `tests/`
- max 2h

## Done când
- [ ] `npm run build` trece
- [ ] smoke localhost:5173 fără diferențe
- [ ] raport în `cursor Jarvis ai/handoff/T-2026-05-07-002.md` (DONE/TESTED/NEXT)

## Refs
- master-plan: `BRAIN/master-plan/00_BOOTSTRAP.md`
- task-id: `BRAIN/tasks/T-2026-05-07-002.md`
- dep: `BRAIN/tasks/T-2026-05-07-001.md`
