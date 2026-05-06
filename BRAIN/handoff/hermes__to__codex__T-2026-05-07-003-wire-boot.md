---
from: hermes
to: codex
topic: T-2026-05-07-003 Wire jervis-boot.mjs la V3
ts: 2026-05-06T23:17:05Z
priority: high
status: open
---

## Context
Task paralel cu fluxul UI Cursor. Țintă: conectare `jervis-boot.mjs` la modulele V3 deja livrate.

## Cerere
Execută `BRAIN/tasks/T-2026-05-07-003.md`.
Fă wiring sigur, cu smoke boot și validare minimă teste relevante.

## Constrângeri
- păstrează compatibilitate API curentă
- nu trece risk-gates externe fără confirmare operator
- max 2h

## Done când
- [ ] `jervis-boot.mjs` actualizat
- [ ] smoke boot fără crash
- [ ] raport în `codex Jarvis ai/handoff/T-2026-05-07-003.md`

## Refs
- master-plan: `BRAIN/master-plan/00_BOOTSTRAP.md`
- task-id: `BRAIN/tasks/T-2026-05-07-003.md`
- prior handoff: n/a
