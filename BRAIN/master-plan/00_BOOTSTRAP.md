---
title: JARVIS V3 — Bootstrap multi-IDE workflow
owner: claude
created: 2026-05-06T22:55:00Z
status: active
target_date: 2026-05-13
---

# MASTER PLAN — Bootstrap multi-IDE workflow

## Obiectiv
Așezăm protocolul Claude+Hermes+Codex+Cursor în lucru. La final de săptămână: 1 ciclu complet (plan→sparge→implement→review→sinteză) executat fără conflict.

## Constrângeri ground-truth
- 4 agenți distincți, fiecare cu folder propriu, branch comun `codex/whatsapp-cloud-run-live`
- Operator-side acțiuni externe (push, npm install, restart) cer confirm explicit
- Working tree dirty cu upgrade-uri Codex — păstrăm

## Faze gated

### Faza A — Setup workspace (DELIVERED)
- **Deliverable:** WORKSPACE_PROTOCOL.md + 4 ARRIVAL.md + BRAIN/ + templates
- **Owner:** claude
- **Effort:** 1h
- **Test:** fiecare agent găsește docs la entry
- **Status:** ✓ DONE 2026-05-06
- **Risc:** zero

### Faza B — Hermes intră, sparge plan curent
- **Deliverable:** taskuri în `BRAIN/tasks/` pentru next iteration (Phase 12 UI decomp pas 1 + Wire jervis-boot.mjs Codex)
- **Owner:** hermes
- **Effort:** 1h
- **Test:** taskuri ≤2h fiecare, assignee setat, deps documented
- **Risc:** mic — Hermes trebuie să citească memoria proiectului întâi

### Faza C — Codex preia primul task
- **Deliverable:** Phase 12 prep (read main.jsx, mark dependencies for cursor) + bug fixes pe server/
- **Owner:** codex
- **Effort:** 2h
- **Test:** taskul închis cu DONE/TESTED/NEXT
- **Risc:** mic — main.jsx atins doar read-only

### Faza D — Cursor preia primul task UI
- **Deliverable:** P12 pas 1 — extract StatusTile + PanelSection + PendingActionModal + ErrorBoundary din main.jsx
- **Owner:** cursor
- **Effort:** 2h
- **Test:** localhost:5173 rămâne identic vizual; npm run build trece
- **Risc:** MEDIU — atinge main.jsx dirty; folosește git diff per pas

### Faza E — Claude review + signoff
- **Deliverable:** REVIEW_<topic>.md în BRAIN/handoff/
- **Owner:** claude
- **Effort:** 30min
- **Test:** approve/changes_requested
- **Risc:** zero

### Faza F — Hermes sinteză + plan next cycle
- **Deliverable:** `BRAIN/synthesis/2026-05-07.md` + plan ziua următoare
- **Owner:** hermes
- **Effort:** 30min
- **Test:** sinteza acoperă toate fazele + metrici
- **Risc:** zero

## Dependențe
- B → C, D (paralel)
- C, D → E
- E → F

## Criterii validare end-to-end
- [ ] cele 4 agenti find docs la entry
- [ ] 1 ciclu complet (B→F) finished
- [ ] zero conflict de fișiere
- [ ] tests pass (>=90/90)
- [ ] localhost:5173 smoke ok
- [ ] commit-uri prefixate corect

## Cycle-1d update (Hermes orchestration)
- T-2026-05-07-002 este marcat `superseded`.
- T-2026-05-07-004 (Elite Premium UI v0) este taskul CRITICAL pentru Cursor.
- T-2026-05-07-001 + T-2026-05-07-003 rămân paralele pe Codex.
- Next-cycle queue pregătită: T-005, T-006, T-007, T-008.

## Open questions for operator
1. Cursor are deja access la repo prin Cowork sau prin terminal direct?
2. Hermes rulează ca task autonom în Claude (acest agent) sau separat?
3. Push remote — manual prin tine după review Claude?
