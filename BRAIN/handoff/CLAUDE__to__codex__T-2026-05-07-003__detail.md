---
from: claude
to: codex
topic: T-2026-05-07-003 — DETAIL SPEC: wire jervis-boot.mjs la modulele V3
ts: 2026-05-07T00:00:00Z
priority: high
status: open
relates_to:
  - BRAIN/tasks/T-2026-05-07-003.md
  - BRAIN/handoff/hermes__to__codex__T-2026-05-07-003-wire-boot.md
---

## VERDICT
Conectează `Jarvis AI/jervis-boot.mjs` (v2 supervisor existent, 554 LoC, owned de tine) la modulele V3 din `Jarvis AI/server/*`. Păstrează compat backward. NU duplica `jervis-boot-v3.mjs` (port 7778, owned Claude — coexistă în paralel).

## OBIECTIV
Boot supervisor v2 pe :7777 trebuie să consume:
- `server/state/agentState.js` — FSM state machine
- `server/intent/router.js` — intent dispatch
- `server/risk/tiers.js` — risk gates
- `server/emergency/stopAll.js` — kill switch
- `server/audit/log.js` — audit append
- `server/lib/{logger,sensors,transporter,database}.js` — utilitare native bridge

OPȚIONAL (dacă timp):
- `server/ide/index.js` — IDE Layer (poate aștepta T-004)
- `server/comm/email/index.js` — risk-gated, NU activa fără confirmare operator
- `server/graphify/index.js` — emit-only, sigur

## TOPOLOGIE
```
:7777  jervis-boot.mjs       (Codex, v2)        ← ținta acestui task
:7778  jervis-boot-v3.mjs    (Claude, V3 paralel) ← NU atinge
:5173  vite dev              (UI)               ← consumă :7777
:8787  whatsapp-bridge       (sub-proiect)      ← consumă :7777
:4317  orphan port           (de ignorat)
```

Boot v2 rămâne sursa de adevăr pentru Sensors/Holodeck/Shields. V3 e doar "shadow brain" pe :7778.

## CONSTRÂNGERI HARD
- API-urile existente la :7777 NU se schimbă (compat backward).
- Endpoint-uri noi NU sunt necesare în acest task — wiring intern suficient.
- Risk-gate `comm/email` rămâne OFF by default. Activare necesită env explicit `JERVIS_EMAIL_LIVE=1`.
- Dacă apare conflict de import (paths absolute vs relative), preferă import relative din `Jarvis AI/`.
- NU rula `npm install` arbitrar. Folosește dependențele deja prezente.
- NU șterge `jervis-aidefence.mjs`, `jervis-holodeck-docker.mjs`, `jervis-whatsapp-intent.mjs` — sunt deja consumate.

## EXEC PLAN
1. Branch: `codex/p13-wire-boot-v3` (separat de `codex/whatsapp-cloud-run-live`).
2. Inspect: citește `jervis-boot.mjs` în întregime (554 LoC). Identifică punctele de inserție pentru:
   - middleware request → `intent/router.js`
   - pre-action → `risk/tiers.js`
   - panic → `emergency/stopAll.js`
   - per-tick → `state/agentState.js.tick()` (dacă există) sau snapshot la `/`
   - audit → `audit/log.js.append({...})` pe orice action
3. Adaugă imports top-of-file:
   ```js
   import { agentState } from './server/state/agentState.js';
   import { route as routeIntent } from './server/intent/router.js';
   import { classify as classifyRisk } from './server/risk/tiers.js';
   import { stopAll } from './server/emergency/stopAll.js';
   import { append as auditAppend } from './server/audit/log.js';
   ```
   (Adaptează numele exporturilor la realitate. Dacă nu există → SEMNALEAZĂ, nu inventa.)
4. Wire pe rând, commit fiecare:
   - 4a `[codex] T-003 — wire FSM agentState`
   - 4b `[codex] T-003 — wire intent router`
   - 4c `[codex] T-003 — wire risk tiers + double-confirm`
   - 4d `[codex] T-003 — wire emergency stop`
   - 4e `[codex] T-003 — wire audit append on all actions`
5. Smoke boot:
   ```bash
   node jervis-boot.mjs
   curl -s http://127.0.0.1:7777/ | jq .
   curl -s -X POST http://127.0.0.1:7777/intent -d '{"text":"deschide notes"}' -H 'content-type: application/json'
   curl -s -X POST http://127.0.0.1:7777/emergency/stop -d '{"reason":"smoke","source":"codex"}' -H 'content-type: application/json'
   ```
   Toate trebuie să răspundă < 2s, fără crash, fără leak descriptori.
6. Test minim:
   ```bash
   node --test tests/ 2>&1 | tail -20
   ```
   Suite-ul existent verde (152/152).
7. Raport în `codex Jarvis ai/handoff/T-2026-05-07-003.md`.

## DONE CRITERIA
- [ ] `jervis-boot.mjs` importă și folosește cel puțin: agentState, routeIntent, classifyRisk, stopAll, auditAppend.
- [ ] Smoke boot: pornește fără crash, toate endpoint-urile existente răspund.
- [ ] `curl /` returnează snapshot care include `fsm.state` și `audit.lastEvent`.
- [ ] `node --test` pe `tests/` rămâne verde (sau se semnalează regresie cu motiv clar).
- [ ] `jervis-boot-v3.mjs` neatins (`git diff jervis-boot-v3.mjs` empty).
- [ ] Raport scris cu schema de mai jos.

## SCHEMA RAPORT
Fișier: `codex Jarvis ai/handoff/T-2026-05-07-003.md`

```
# T-2026-05-07-003 — wire jervis-boot.mjs ↔ V3
date: 2026-05-07
branch: codex/p13-wire-boot-v3

## Module wired
- [x] state/agentState
- [x] intent/router
- [x] risk/tiers
- [x] emergency/stopAll
- [x] audit/log
- [ ] ide/index            (skipped — T-004)
- [ ] comm/email/index     (gated — JERVIS_EMAIL_LIVE off)
- [ ] graphify/index       (skipped — opțional)

## Diff stat
jervis-boot.mjs: +N -M lines
files added: 0
files modified: 1

## Smoke boot output
$ node jervis-boot.mjs
... (curat, fără warnings) ...
$ curl /
{ "ok": true, "fsm": {...}, "audit": {...} }

## Tests
node --test tests/  →  XX/XX pass

## Risks observed
- ...

## Backward compat check
- /
- /intent
- /audit
- /emergency/stop
- existing endpoints: ...

## jervis-boot-v3.mjs untouched
git diff jervis-boot-v3.mjs → empty ✓
```

## RISKS / TRADE-OFFS
- Import circular dacă `state/agentState.js` importă din `jervis-boot.mjs` indirect — verifică DAG.
- Logger vs console.log — nu strica formatul existent al boot v2 (parsate de operator).
- Audit cost — `auditAppend` synchronous pe fiecare request → dacă blochează > 5ms, fă async fire-and-forget.
- Risk-tier pe `/intent` care includea acțiuni — dublu wrapping → asigură single-source-of-truth.

## ROLLBACK
- `git checkout codex/whatsapp-cloud-run-live` per branch separat → zero impact LIVE.
- Dacă smoke boot crash: revert ultimul commit, raportează simptom + stack.

## DEPS PE ALTE TASKURI
- T-001 NU blochează acest task (jervis-boot.mjs trăiește în Jarvis AI/, main.jsx trăiește în TRADE AI/src/).
- Cursor T-002 paralel — fără atingere comună.
- După close: T-004 va wire IDE Layer (separat).

## NEXT
- Operator confirmă smoke pe :7777.
- Apoi push branch (cu permisiune explicită).
- Apoi review Claude (architecture + security).

