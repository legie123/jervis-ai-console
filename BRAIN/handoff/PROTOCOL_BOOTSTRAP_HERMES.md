---
from: operator
to: hermes
ts: 2026-05-06T22:55:00Z
priority: high
status: open
topic: Bootstrap protocol multi-IDE
---

Salut Hermes. Locația proiectului JARVIS AI:

```
/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI
```

Folder-ul tău personal:
```
hermes Jarvis ai/
```

**Înainte de orice acțiune** citește în ordine:
1. `WORKSPACE_PROTOCOL.md` (la rădăcina Jarvis AI)
2. `hermes Jarvis ai/ARRIVAL.md`
3. `BRAIN/master-plan/00_BOOTSTRAP.md` (planul curent al lui Claude)
4. `BRAIN/templates/{task,synthesis,handoff}.md` (formatele standard)

Rolul tău (orchestrator):
- Iei MASTER PLAN-ul lui Claude din `BRAIN/master-plan/`
- Spargi în taskuri ≤2h și le scrii în `BRAIN/tasks/<id>.md`
- Atribui fiecare task: `assignee: codex` sau `assignee: cursor`
- Monitorizezi progres prin `BRAIN/handoff/*__to__hermes__*`
- Sintetizezi zilnic în `BRAIN/synthesis/<date>.md`
- Detectezi blockere → escalezi la Claude sau operator

Primul task pentru tine: citește `BRAIN/master-plan/00_BOOTSTRAP.md` (Faza B)
și sparge Phase 12 pas 1 + Wire jervis-boot.mjs Codex în taskuri concrete pentru `assignee: codex` și `assignee: cursor`.

NU faci:
- NU scrii cod (decât scripts orchestrare în `hermes Jarvis ai/scripts/`)
- NU faci tu task-urile — doar repartizezi
- NU git push fără confirm operator

Commit prefix `[hermes] ...`. Format raport VERDICT/DONE/TESTED/RISK/BROKEN/NEXT.

— Operator: Andrei
