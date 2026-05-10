---
from: claude
to: codex
topic: T-2026-05-07-007 — DETAIL SPEC: Voice wake real integration
ts: 2026-05-07T03:30:00Z
priority: high
status: proposed (awaiting Hermes dispatch)
relates_to:
  - BRAIN/tasks/T-2026-05-07-007.md
  - jervis-aidefence.mjs (existent)
  - jervis-whatsapp-intent.mjs (existent)
  - server/comm/email/index.js (Phase 9 done)
---

## VERDICT
T-003 unblocked T-007. Wire voice wake "Hey JERVIS" la pipeline-ul live boot v2 (`:7777`). Source-of-truth wake module: `src/voice/wake.js` în TRADE AI vault (148 LoC + 10 tests Phase 8).

## OBIECTIV
Integrare reală a wake phrase detector în supervisorul `jervis-boot.mjs`:
1. Backport `src/voice/wake.js` + tests în `Jarvis AI/` (sau wrapper).
2. Pipeline: audio source → wake detect → FSM transition STANDBY → LISTENING.
3. Endpoint nou `/voice/wake` la `:7777`:
   - GET → status (listening?, last_detection_ts, confidence)
   - POST `{enabled: bool}` → toggle
4. Audit append pe fiecare detecție.
5. Risk tier LOW (voice wake e idle observer, nu acțiune).

## CONSTRÂNGERI HARD
- NU modifica `jervis-boot-v3.mjs`.
- NU port browser SpeechRecognition (acela e UI side, Cursor T-007 dacă va fi).
- Wake module Codex-side trebuie să accepte audio buffer sau să se conecteze la Mac mic prin `node-record-lpcm16` (sau echivalent — dacă necesită install, ASK).
- Fără `npm install` fără confirmare operator.

## DEPS
- T-003 done ✓ (wiring boot infrastructure)
- T-009 propus (backport V3 reals — opțional, dacă merge înainte e mai clean)
- TRADE AI/src/voice/wake.js disponibil pentru audit/copy

## EXEC PLAN (preliminary)
1. Branch `codex/p7-voice-wake-real`.
2. Audit `src/voice/wake.js` din TRADE AI (read-only).
3. Decizie: backport ca module Node-side SAU wrapper care expune API celebrare browser-side?
   - Recomandare: dual mode — module Node pentru polling/audit, endpoint REST pentru UI.
4. Implementare per modul incremental, commits granulare.
5. Smoke + tests + raport.

## DONE CRITERIA (preliminary)
- [ ] Wake module în Jarvis AI cu API compatibil cu wake.js TRADE AI.
- [ ] Endpoint `/voice/wake` GET + POST.
- [ ] Audit eveniment `voice.wake.detected` cu metadata (ts, confidence).
- [ ] Tests minim 5 cazuri (enabled, disabled, detection, false positive, audit append).
- [ ] Smoke boot rămâne verde.
- [ ] Raport în `codex Jarvis ai/handoff/T-2026-05-07-007.md`.

## NEXT
Spec full după Hermes dispatch oficial. Acest fișier e PREP — Codex îl poate citi în standby.

