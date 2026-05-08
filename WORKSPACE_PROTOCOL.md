# JARVIS AI — Multi-IDE Workspace Protocol

**Citire obligatorie pentru orice agent care intră în acest folder.**

## 1. Identitate proiect

- **Nume:** JARVIS — Personal AI Agent (NU trading, "TRADE AI" e doar nume folder istoric)
- **Operator:** Andrei
- **GitHub:** `https://github.com/legie123/jervis-ai-console.git`
- **Branch comun:** `codex/whatsapp-cloud-run-live`
- **Locație fizică:** `/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/`
- **Vault Obsidian root:** `/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/`

## 2. Foldere per agent (NU se suprascriu între ei)

```
/Antigraity/Jarvis AI/
├── claude Jarvis ai/    ← Claude (planning + review + arhitectură + securitate)
├── codex Jarvis ai/     ← Codex CLI (API + teste + bugfix + module izolate)
├── cursor Jarvis ai/    ← Cursor (UI + componente + polish + responsive)
├── hermes Jarvis ai/    ← Hermes (orchestrare + brain + sinteze + cycle next)
├── BRAIN/               ← shared synthesis (Hermes write, all read)
│   ├── master-plan/     ← Claude scrie plan principal aici
│   ├── tasks/           ← Hermes spune cui ce face
│   ├── synthesis/       ← Hermes sinteză zilnică / ciclu
│   ├── handoff/         ← Mesaje cross-agent (toți scriu)
│   └── templates/       ← Format standard pentru plan/task/synthesis
├── server/              ← cod COMUN (atinge cu git diff verificat)
├── src/                 ← cod COMUN (atinge cu git diff verificat)
├── tests/               ← teste COMUNE
└── (root .mjs/.html/.sh) ← cod COMUN
```

**Regulă:** orice agent SCRIE în `<agent> Jarvis ai/` propriu și în `BRAIN/handoff/` pentru mesaje. **Nu** scrie în folderul altui agent.

## 3. Lanț de execuție (ciclu standard)

```
[1] Claude       → MASTER PLAN          → BRAIN/master-plan/<topic>.md
[2] Hermes       → împarte în taskuri    → BRAIN/tasks/<task-id>.md
[3] Codex        → API/teste/bugfix     → server/, tests/ + handoff
[3b] Cursor      → UI/components        → src/components/, src/styles + handoff
[4] Claude       → final review         → BRAIN/handoff/REVIEW_<topic>.md
[5] Hermes       → sinteză + next cycle → BRAIN/synthesis/<date>.md
```

Codex și Cursor lucrează în paralel pe domenii diferite (server vs UI). Nu intră în conflict pe fișiere.

## 4. Format mesaje cross-agent

Orice mesaj cross-agent merge în `BRAIN/handoff/<from>__to__<to>__<topic>.md` cu acest schelet:

```yaml
---
from: claude
to: codex
topic: V3 Phase 4 native bridge extract
ts: 2026-05-06T22:55:00Z
priority: high|med|low
status: open|in_progress|done|blocked
---

## Context
…ce ști, ce e relevant…

## Cerere
…ce vrei să facă…

## Constrângeri
- nu atinge fișier X
- păstrează API Y
- timeline: <când>

## Done când
- Test A trece
- Endpoint B răspunde
- Audit log emite event Z
```

## 5. Roluri detaliate

### CLAUDE (planning + arhitectură + review)
- citește audits, code, planuri existente
- produce **MASTER PLAN** pentru orice obiectiv mare
- face REVIEW final pe tot ce face Codex+Cursor
- NU scrie cod de zi cu zi (face only review + arhitectură)
- prefix commit: `[claude] ...`
- folder: `claude Jarvis ai/`

### HERMES (orchestrare + brain + context)
- ia MASTER PLAN-ul lui Claude
- îl sparge în taskuri mici (≤2h fiecare) în `BRAIN/tasks/`
- atribuie fiecare task: `assignee: codex` sau `assignee: cursor`
- păstrează contextul: actualizează `BRAIN/synthesis/<date>.md` zilnic
- detectează blockere, face escalări
- prefix commit: `[hermes] ...`
- folder: `hermes Jarvis ai/`

### CODEX (cod backend + API + teste + bugfix)
- consumă taskuri cu `assignee: codex` din `BRAIN/tasks/`
- atinge: `server/`, `tests/`, root `.mjs`/`.sh`/`.html` (server-side)
- nu atinge: `src/` UI Vite/React, fișierele Cursor
- scrie raport în `codex Jarvis ai/handoff/<task-id>.md`
- prefix commit: `[codex] ...`
- folder: `codex Jarvis ai/`

### CURSOR (UI + componente + polish + responsive)
- consumă taskuri cu `assignee: cursor` din `BRAIN/tasks/`
- atinge: `src/components/`, `src/styles.css`, `src/visuals/`, `src/voice/` UI bits
- nu atinge: `server/`, `tests/`, fișierele Codex
- scrie raport în `cursor Jarvis ai/handoff/<task-id>.md`
- prefix commit: `[cursor] ...`
- folder: `cursor Jarvis ai/`

## 6. Reguli anti-conflict

1. **Înainte de orice edit** într-un fișier comun (`server/*`, `src/*`, root):
   ```bash
   git status --short <file>
   git diff <file>
   ```
   Dacă altcineva e mid-edit, scrii în `BRAIN/handoff/` și aștepți.

2. **Niciun agent** nu redenumește/șterge fișiere create de alt agent fără confirmare în `BRAIN/handoff/`.

3. **Refactor mare** → branch separat (`<agent>/<topic>`) + PR. Nu pe trunk direct.

4. **Risk gates** (WhatsApp send, ElevenLabs cu date private, push extern, npm install) — toate cer confirmare explicită operator. Niciun agent nu trece gate-ul fără ea.

5. **Working tree dirty** este intenționat — nu se face `git stash` defensive. Se păstrează modificările legitime.

## 7. Capabilities curente JARVIS V3 (livrate până acum)

- **Phase 1 FSM** — `server/state/agentState.js` (10 stări) ✓
- **Phase 2 Intent Router** — `server/intent/router.js` (12 categorii) ✓
- **Phase 3 Risk Tiers** — `server/risk/tiers.js` (4 tier-uri + double-confirm) ✓
- **Phase 4 Native Bridge lib** — `server/lib/{logger,sensors,transporter,database}.js` ✓
- **Phase 5 IDE Layer** — `server/ide/{index,routes}.js` (Claude Code/Cursor/Antigravity/VS Code/Codex) ✓
- **Phase 6 Emergency Stop** — `server/emergency/stopAll.js` ✓
- **Phase 7 Audit Log** — `server/audit/log.js` (10-field structured) ✓
- **Phase 8 Wake Phrase** — `src/voice/wake.js` ✓
- **Phase 9 Email Pipeline** — `server/comm/email/{index,transport,templates}.js` ✓
- **Phase 10 Graphify** — `server/graphify/index.js` ✓
- **V3 Supervisor** — `jervis-boot-v3.mjs` (port 7778) ✓

**Total: 90/90 tests pass în Jarvis AI repo + 62/62 tests pass în TRADE AI repo.**

Pending:
- Phase 12 UI decomp main.jsx 3325 linii (lead: Cursor cu Claude review)
- Wire jervis-boot.mjs cu noile module (lead: Codex)
- RUFLO config fix Claude Desktop (operator-side)

## 8. Boot order pentru o sesiune nouă

Orice IDE intră în proiect:
1. Citește acest `WORKSPACE_PROTOCOL.md`
2. Citește `<own-folder>/ARRIVAL.md` (runbook personal)
3. Citește ultimul `BRAIN/synthesis/<latest-date>.md`
4. Verifică `BRAIN/handoff/` pentru mesaje pendente la el
5. Verifică `BRAIN/tasks/` pentru taskuri `assignee: <self>` cu `status: open`
6. Începe lucrul

## 9. End of cycle

La sfârșit de zi/ciclu, Hermes:
- Sintetizează în `BRAIN/synthesis/<date>.md`: ce s-a făcut, ce blocuri, ce urmează
- Marchează taskurile completed în `BRAIN/tasks/`
- Pregătește planul pentru ziua următoare (handoff Claude)

— Operator: Andrei
— Versiune: 1.0 / 2026-05-06
