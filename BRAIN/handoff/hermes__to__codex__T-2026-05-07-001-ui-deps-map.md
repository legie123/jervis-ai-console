---
from: hermes
to: codex
topic: T-2026-05-07-001 UI dependency mapping (read-only)
ts: 2026-05-06T23:17:05Z
priority: high
status: open
---

## Context
Task orchestrat din MASTER PLAN `BRAIN/master-plan/00_BOOTSTRAP.md` (Faza B -> pregătire pentru Faza D). Trebuie redus riscul pe `src/main.jsx` înainte de extracțiile Cursor.

## Cerere
Execută taskul `BRAIN/tasks/T-2026-05-07-001.md`.
Livrezi analiză read-only: imports, props, state, side effects pentru componentele țintă (StatusTile, PanelSection, PendingActionModal, ErrorBoundary), plus ordine de extracție recomandată.

## Constrângeri
- NU modifica `src/main.jsx` (read-only)
- NU începe refactor UI
- max 2h

## Done când
- [ ] raport scris în `codex Jarvis ai/handoff/T-2026-05-07-001.md`
- [ ] include riscuri regresie + recomandări de ordine
- [ ] confirmare explicită: `main.jsx` nemodificat

## Refs
- master-plan: `BRAIN/master-plan/00_BOOTSTRAP.md`
- task-id: `BRAIN/tasks/T-2026-05-07-001.md`
- prior handoff: n/a
