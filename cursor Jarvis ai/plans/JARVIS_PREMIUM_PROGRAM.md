# JARVIS — Program Premium (complex) 2026

**Owner:** operator + Claude (arhitectură) + Hermes (task split) + Codex/Cursor (exec)  
**Scope:** superset peste `BRAIN/master-plan/00_BOOTSTRAP.md` — produs operator „premium”: UI unic, integrări sigure, observabilitate.

## North-star

Un singur **Command Center** (`127.0.0.1:4317`) ca suprafață principală; **Vite console** (`:5173`) și **BridgePanel** rămân sateliți până la convergență (T-005). Supervizoarele **:7777 / :7778** sunt sursa de adevăr FSM; **WhatsApp :8787** rămâne canal extern cu confirmare umană.

## Faze (gated)

### Faza 0 — Închidere dispatch curent (P0)

- T-009..T-015 din `BRAIN/NEXT_ACTIONS.md`: teste, merge bridge-panel în branch de lucru, QA vizual, sinteză Hermes, audit boot v3, risk register.
- **Gate:** toate P0 bifate sau explicite blockere în `BRAIN/handoff/`.

### Faza 1 — Elite UI v0 semnat (T-004)

- Livrabil deja în `command-center/apps/web/` (vezi `cursor Jarvis ai/handoff/T-2026-05-07-004.md`).
- **Gate:** Hermes marchează `BRAIN/tasks/T-2026-05-07-004.md` done; Lighthouse a11y ≥ 90 păstrat la regresii (**CI:** `command-center/lighthouserc.json` + pas „Lighthouse” în `.github/workflows/command-center.yml` după `npm test`).

### Faza 2 — Config & portability premium

- URL-uri boot / bridge **fără recompilare**: `globalThis.__JARVIS_BOOT_FSM_URLS__`, documentat în `index.html`; UI static separat: **`VITE_OPERATOR_API_ORIGIN`** la build + **`JARVIS_CORS_ALLOW_ORIGIN`** pe operator (vezi `docs/DEPLOY_CLOUD_RU.md`).
- **Gate:** operator poate schimba host/port într-un singur loc (HTML inject sau env viitor pe operator); sau UI static cu API la URL explicit.

### Faza 3 — Migrare Vite + React (T-005)

- După Faza 1 semnată. Scop: componente testabile, Storybook opțional, onboarding dev mai rapid.
- **Gate:** `npm run dev` + `npm run build`; paritate funcțională cu vanilla v0.

### Faza 4 — Integrare unificată TRADE AI ↔ Jarvis AI

- Un branch comun sau submodule clar: evită două truth-uri pentru `jervis-ai-console`.
- **Gate:** un PR flow; BRAIN canonical doar în `Jarvis AI/BRAIN/`.

### Faza 5 — Observabilitate & siguranță

- Captain’s Log search UI (substring pe linii, debounce scurt); audit export; **Shields strip** în Command Center (rezumat path-guard / token / emergency din health, fără căi absolute în UI); Shields/aidefence complet = checklist Claude R-15..R-17.
- **Gate:** checklist securitate Claude pe R-15..R-17.

### Faza 6 — Voice & automation (P3)

- Wake word / voice orb legat de supervisor; LaunchAgent + scheduler verificate.

#### Slice 2026-05 · Personal assistant / Desk + voice orb

Desk rail (`section-desk`) + voice intents **`desk_*`**: Notes / priorities în **`localStorage`** (`jarvis.personal.*`); **`deschide`/`open`** trece prin **`POST /api/personal/open-app`** cu **`JARVIS_OPEN_APP_ALLOWLIST`** (bridge macOS din operator, nu din sandbox-ul browserului). Pulse Ruflo pe Desk și inbox obligatoriu **Ruflo + Hermes + GoodMood** rămân sursa pentru agentic workflows. Document detaliat: **`cursor Jarvis ai/plans/JARVIS_PERSONAL_AGENT_DECK.md`**.

## Metrici de succes

| Metric | Țintă |
|--------|--------|
| Teste root + command-center | verde la fiecare merge |
| Lighthouse a11y (Command Center) | ≥ 90 |
| Timp până la „boot online” în UI | < 3s cu supervisor up |
| Incidente fără confirmare WA | 0 |

## Riscuri

- **CORS** pe `:7777`/`:7778` — UI degradează grațios; documentare operator.
- **Drift git** între `cursor/*` și `codex/*` — mitigare: merge săptămânal ghidat de Hermes.

## Next actions imediate (Cursor)

1. PR **#8**: merge pe `main` după review (Captain’s Log search, Lighthouse CI, Shields, Cloud deploy hooks).
2. Faza 3 (T-005): plan incremental React — handoff Codex.
3. Handoff în `BRAIN/HANDOFF_CURRENT.md` după fiecare sesiune.

---

## Execuție către 100% (definiție + status)

**„100% complet”** înseamnă aici: **toate gate-urile de mai sus sunt bifate**, metricile din tabel sunt atinse, și nu există blockere nedocumentate. Nu este un singur commit; este închidere secvențială pe faze (0→6) cu owneri diferiți (Hermes task split, Codex build, Claude review siguranță, Cursor UI, Antigravity vizual).

| Fază | Gate principal | Stare estimată (2026-05-10) | Ce lipsește pentru 100% |
|------|----------------|-----------------------------|-------------------------|
| **0** | P0 din `NEXT_ACTIONS` + handoff-uri | ~45% | Hermes/Codex închid T-009..T015, QA vizual, risk register la zi |
| **1** | T-004 done + Lighthouse a11y ≥ 90 la regresii | ~85% | Semnare task Hermes (T-004); Lighthouse în CI pe build static `apps/web/dist` |
| **2** | Host/port într-un singur loc fără recompilare | ~82% | Inject HTML boot URLs + build `VITE_OPERATOR_API_ORIGIN` / CORS (`DEPLOY_CLOUD_RU.md`); polish env operator dacă lipsește |
| **3** | React + paritate cu vanilla | ~5% | Migrare mare (săptămâni); Codex/Cursor plan incremental + Storybook opțional |
| **4** | Un truth `jervis-ai-console` + BRAIN canonical | ~15% | Decizie org + merge/submodule TRADE AI ↔ Jarvis AI (în afara unui singur agent) |
| **5** | Captain search + audit vizibil + Shields fără PII | ~62% | Export audit în UI (buton JSON); Shields strip; checklist R-15..R17 Claude; aidefence endpoint opțional |
| **6** | Voice + LaunchAgent + scheduler verificate | ~20% | Wake word, legare supervisor, teste dispozitiv; `jervis-*.mjs` = owner Claude |

**Țintă realistă:** 100% pe **Faze 0–2 + porțiuni 5** poate fi atinsă în **câteva iterății** cu backlog prioritar; **Faza 3–4 + 6 complet** depinde de decizii de produs și timp de echipă.

---

*Acest fișier trăiește în `cursor Jarvis ai/plans/` până la promovare în `BRAIN/master-plan/` de către Claude dacă devine canon.*
