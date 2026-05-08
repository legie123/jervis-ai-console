# Mesaje protocol — dispatch ciclu 1c (2026-05-07)

> Toate IDE-urile lucrează în `/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/`.
> Master plan: `BRAIN/master-plan/00_BOOTSTRAP.md`.
> Synthesis: `BRAIN/synthesis/2026-05-07.md`.

---

## 🎯 CURSOR (UI lane)
```
Lucrăm în /Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/.

PIVOT CRITIC: T-2026-05-07-002 e SUPERSEDED.
Citește: BRAIN/handoff/CLAUDE__to__cursor__T-2026-05-07-004__detail.md

Task tău nou: T-2026-05-07-004 — Elite Premium UI v0 pentru
command-center/apps/web/ (vanilla embrion → LCARS modern × glass,
11 componente, ⌘K palette, polling live :7777/:7778).

Lane: doar command-center/apps/web/. NU atinge server/, tests/,
jervis-boot*.mjs, .sh, .plist.

Branch: cursor/p12-elite-ui-v0
Commits: 6 granulare ([cursor] T-004.a..f)
Done: 11 componente + ⌘K + polling + Lighthouse a11y ≥ 90 + raport
+ screenshots în cursor Jarvis ai/.

Fără npm install nou. Fără git push fără confirmare.
```

---

## ⚙️ CODEX (slot A — read-only audit)
```
Lucrăm în /Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/.

Citește: BRAIN/handoff/CLAUDE__to__codex__T-2026-05-07-001__detail.md

Task: T-2026-05-07-001 — Map deps src/main.jsx (TRADE AI vault).
READ-ONLY. Output în codex Jarvis ai/handoff/T-2026-05-07-001.md
cu schema specificată: 4 componente (StatusTile, PanelSection,
PendingActionModal, ErrorBoundary), imports/props/state/effects/
ordine extracție/riscuri.

Branch: codex/p12-step1-map-deps
Constrângere HARD: zero diff pe src/main.jsx.
Confirmare finală: git diff src/main.jsx → empty.

Fără git push fără confirmare operator.
```

---

## ⚙️ CODEX (slot B — wire boot)
```
Lucrăm în /Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/.

Citește: BRAIN/handoff/CLAUDE__to__codex__T-2026-05-07-003__detail.md

Task: T-2026-05-07-003 — Wire jervis-boot.mjs (v2, port :7777, owned tu)
la modulele V3 din server/* (state/intent/risk/emergency/audit/lib).
NU atinge jervis-boot-v3.mjs (Claude, port :7778).

Branch: codex/p13-wire-boot-v3
Commits: 5 granulare per modul wired ([codex] T-003 — wire ...).
Smoke: node jervis-boot.mjs + curl / + curl /intent + curl /emergency/stop.
Done: 152/152 tests verzi, snapshot / include fsm + audit.

Fără JERVIS_EMAIL_LIVE=1. Fără git push fără confirmare.
```

---

## 🧠 HERMES (orchestration)
```
Lucrăm în /Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/.

Update master plan: T-2026-05-07-002 → SUPERSEDED.
T-2026-05-07-004 (Elite UI v0) → priority CRITICAL pentru Cursor.
T-2026-05-07-001 + T-2026-05-07-003 → rămân paralel pe Codex.

Pregătește în BRAIN/tasks/ pentru next cycle:
- T-005 — Vite + React migration (după T-004 close)
- T-006 — Three.js dragon core port (depinde de T-001 audit)
- T-007 — Voice wake real integration
- T-008 — Claude review architecture + security pass

Update BRAIN/synthesis/2026-05-07.md cycle-1d cu:
- task status snapshot
- blockere active
- coordonare IDE × IDE (ce e gata, ce așteaptă)
- estimate finalizare ciclu
```

---

## 📋 CLAUDE (yours truly — review lane)
```
Owner pe: jervis-boot-v3.mjs, server/state, server/intent, server/risk,
server/emergency, server/audit, server/ide, server/comm/email, server/graphify,
server/lib, tests/, BRAIN/master-plan, BRAIN/handoff/CLAUDE__to__*.

After Cursor + Codex livrează:
1. Pull synthesis + handoff-uri retur (sync_live_to_backup.sh).
2. Review architecture: arhitecturală, securitate, build, deploy gates.
3. Validare integrare boot v2 ↔ V3 (smoke pe :7777 + :7778 paralel).
4. Validare UI Elite ↔ backend (polling correct, degrade ok).
5. Synthesis cycle-2 cu lessons learned + memorie persistentă update.
```

---

## Ordine operator
1. `bash "/Antigraity/Jarvis AI/claude Jarvis ai/scripts/sync_backup_to_live.sh"`
2. Trimite mesajul CURSOR din `🎯 CURSOR (UI lane)` la fereastra Cursor.
3. Trimite cele 2 mesaje CODEX la ferestrele Codex (slot A și B).
4. Trimite mesajul HERMES la Hermes.
5. Așteaptă livrările.
6. `bash "/Antigraity/Jarvis AI/claude Jarvis ai/scripts/sync_live_to_backup.sh"` ca să văd progresul.
7. Apoi reveniți la Claude pentru review.

