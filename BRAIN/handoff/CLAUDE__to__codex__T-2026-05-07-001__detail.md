---
from: claude
to: codex
topic: T-2026-05-07-001 — DETAIL SPEC: map main.jsx deps (read-only)
ts: 2026-05-07T00:00:00Z
priority: high
status: open
relates_to:
  - BRAIN/tasks/T-2026-05-07-001.md
  - BRAIN/handoff/hermes__to__codex__T-2026-05-07-001-ui-deps-map.md
  - BRAIN/handoff/CLAUDE__to__cursor__T-2026-05-07-002__detail.md
---

## VERDICT
Read-only audit pe `src/main.jsx` (3325 LoC). Output: contract de extracție pentru Cursor (P12 pas 1) + ordine sigură + risc-uri.

## OBIECTIV
Pentru fiecare componentă țintă (StatusTile, PanelSection, PendingActionModal, ErrorBoundary):
- locație exactă (LoC start/end)
- imports necesare
- props (intrare)
- state local (`useState`/`useReducer`)
- side effects (`useEffect`/`useRef`/timers/listeners)
- hooks externe consumate (context, store, custom hook-uri)
- callbacks pasate de la parent (mai ales PendingActionModal → confirm/abort)
- dependențe CSS (clase folosite)
- minim runtime requirement (browser API, JSX features)

Plus:
- ordine recomandată de extracție (cel mai sigur prima)
- risc de regresie per componentă (LOW/MED/HIGH + de ce)
- avertismente pe `dirty working tree` Codex (ce să nu atingi)

## CONSTRÂNGERI HARD
- `src/main.jsx` NU se modifică în acest task. Zero diff.
- NU stash, NU rebase, NU clean.
- NU porni Cursor task în paralel cu același fișier.
- Output limită: 1 fișier raport. Nu împrăștia note.

## INPUTS
- Fișier sursă: `src/main.jsx` (vault: `/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/src/main.jsx`)
- Mountul tău: `/Antigraity/Jarvis AI/` (nucleus). Dacă nu poți ajunge la `src/main.jsx` direct, semnalează — operator dă acces.
- Prior art: `BRAIN/handoff/CLAUDE__to__cursor__T-2026-05-07-002__detail.md` (signaturi propuse)

## EXEC PLAN
1. Branch separat: `codex/p12-step1-map-deps` (read-only, fără modificări la `src/`).
2. Citește `src/main.jsx` o singură dată (cache local).
3. Pentru fiecare componentă, extrage:
   - regex/grep precis (nu copia tot blocul, doar marcaje LoC)
   - lista `import` din top-of-file folosite în interior
   - JSX props referențiate
   - hooks din interior + external dependencies (context provider, theme, telemetry)
4. Sintetizează raportul cu schema de mai jos.
5. Verifică: `git diff -- src/main.jsx` → trebuie să fie GOL.
6. Commit raport (`[codex] T-001 — map main.jsx deps`).
7. Push branch (cere confirmare operator înainte).

## SCHEMA RAPORT (obligatoriu)
Fișier: `codex Jarvis ai/handoff/T-2026-05-07-001.md`

```
# T-2026-05-07-001 — main.jsx deps map
date: 2026-05-07
branch: codex/p12-step1-map-deps
main.jsx untouched: YES (sha=...)

## Inventar componente
| Componentă          | LoC start | LoC end | Lines | Risk |
|---------------------|-----------|---------|-------|------|
| StatusTile          | ...       | ...     | ~14   | LOW  |
| PanelSection        | ...       | ...     | ~14   | LOW  |
| PendingActionModal  | ...       | ...     | ~110  | MED  |
| ErrorBoundary       | ...       | ...     | ~26   | LOW  |

## StatusTile
- imports needed: ...
- props: { ... }
- state: NONE
- side effects: NONE
- css classes: ...
- parent callbacks: NONE
- extract order: 1
- risk note: ...

## PanelSection
... same schema ...

## PendingActionModal
... include focus management, ESC/Enter handlers, body scroll lock dacă există, confirm/abort props ...

## ErrorBoundary
... clasa React, lifecycle, fallback render, console reporting ...

## Ordine extracție recomandată
1) StatusTile (zero state, zero callbacks)
2) PanelSection (idem)
3) ErrorBoundary (clasă, izolată)
4) PendingActionModal (cea mai grea — focus + callbacks)

## Riscuri regresie
- ...

## Avertismente dirty tree
- main.jsx are upgrade-uri Codex pe lazy import + Suspense — păstrează.
- styles.css are tweak-uri active — nu șterge clase.

## Confirmare
- main.jsx unchanged: YES
- only file added: codex Jarvis ai/handoff/T-2026-05-07-001.md
```

## DONE CRITERIA
- [ ] Raportul există în calea de mai sus.
- [ ] Toate cele 4 componente au schema completă.
- [ ] Există secțiunea "Ordine extracție recomandată".
- [ ] Există secțiunea "Riscuri regresie".
- [ ] `git diff -- src/main.jsx` retur empty.
- [ ] Branch `codex/p12-step1-map-deps` creat (push pending operator).
- [ ] Commit format: `[codex] T-001 — map main.jsx deps`.

## RISKS / TRADE-OFFS
- Atingere accidentală main.jsx prin auto-format → DEZACTIVEAZĂ format-on-save.
- Pierdere context lazy-import Codex → consultă comenzile recente `git log --oneline src/main.jsx | head -10`.
- Branch divergent față de codex/whatsapp-cloud-run-live → fă branch DIN HEAD curent, nu din origin.

## ROLLBACK
- `git checkout codex/whatsapp-cloud-run-live` și șterge branch local. Zero impact (read-only).

## NEXT
După raport: deblochează Cursor T-002 (extract pure components). Apoi T-003 wire boot.

