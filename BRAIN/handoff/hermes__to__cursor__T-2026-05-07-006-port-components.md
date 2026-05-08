---
from: hermes
to: cursor
topic: T-2026-05-07-006 — port components + Three.js dragon core (UNBLOCKED)
ts: 2026-05-07T00:00:00Z
priority: high
status: open
---

## Context
T-2026-05-07-001 este ACCEPTED / DONE (sync cycle-1e). T-006 este UNBLOCKED.
Nu schimbăm priorități: T-003 + T-004 rămân paralele pe Codex/Cursor.
Nu porni T-006 până nu se închid dependențele active de execuție stabilite în orchestrare.

## Input din raportul/mapping-ul T-001 (pentru port)
Ținte componente:
1) StatusTile
- LoC aproximativ: ~14
- props: `{ icon, label, value }`
- state: none
- side effects: none
- risc: low

2) PanelSection
- LoC aproximativ: ~14
- props: `{ title, children, defaultOpen = false }`
- state: local `useState` (open/close)
- side effects: none
- risc: low

3) PendingActionModal
- LoC aproximativ: ~110
- props: `{ action, onClose, onConfirm, onCancel }`
- state: local `useState` (confirm flow)
- side effects: focus/keyboard handling (ESC/Enter), control flow confirm/abort
- risc: med

4) ErrorBoundary
- LoC aproximativ: ~26
- props: children/fallback contract
- state: boundary intern (class lifecycle)
- side effects: error capture/reporting
- risc: low

Ordine recomandată de port:
1. StatusTile
2. PanelSection
3. ErrorBoundary
4. PendingActionModal

## Cerere
Pregătește execuția pentru `BRAIN/tasks/T-2026-05-07-006.md` folosind mapping-ul de mai sus + constrângerile taskului.
Când începi efectiv, respectă strict dependențele și raportează incremental în handoff-ul tău.

## Constrângeri
- nu atinge `server/` sau fișiere Codex
- fără push fără confirmare operator
- menține compatibilitatea cu direcția UI CRITICAL din T-004

## Done când
- [ ] ai plan de port pe sub-pași component-level
- [ ] ai listat riscuri de regresie per componentă
- [ ] ai actualizat `cursor Jarvis ai/handoff/T-2026-05-07-006.md` cu READY/BLOCKED status

## Refs
- task-id: `BRAIN/tasks/T-2026-05-07-006.md`
- dep done: `BRAIN/tasks/T-2026-05-07-001.md`
- accept: `BRAIN/handoff/CLAUDE__to__codex__T-2026-05-07-001__ACCEPT.md`
- detail spec: `BRAIN/handoff/CLAUDE__to__codex__T-2026-05-07-001__detail.md`
