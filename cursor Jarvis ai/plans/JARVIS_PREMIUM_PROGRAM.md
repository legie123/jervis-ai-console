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

1. **PR #8:** ✅ *merged* (`cursor/premium-captains-log-search` → `main`, 2026-05-09). Următorul milepost: **T-005 React** (plan incremental Codex/Cursor) + **închidere formală T-004** (Hermes).
2. Faza 3 (T-005): plan incremental React — owner Codex/Cursor; nu e livrabil „pe un noapte”.
3. Faza 4: decizie org **TRADE AI ↔ Jarvis** (branch / submodule / ownership) — în afara unui singur PR.
4. Handoff în `BRAIN/HANDOFF_CURRENT.md` după fiecare sesiune (vezi *Wake-up summary* 2026-05-11 pentru scope onest).

### Workflow Ruflo (obligatoriu în inbox)

- **Audit tagging:** evenimentele care trebuie să apară în **`/api/ruflo/feed`** și în inbox trebuie să lovească matcher-ele din operator (`ruflo`, `swarm`, `claude_flow` în sursă/acțiune). La fel, Hermes (`hermes`, `handoff`, `dispatcher`) și GoodMood (`good_mood`, `coach`, `mood`) — vezi `command-center/config/.env.example` și `apps/web/src/services/collaboration-feeds.js` (`MANDATORY_ADAPTER_KEYS`).
- **CLI + agenți named:** în medii Claude Code / stack Ruflo, folosește **`npx @claude-flow/cli@latest`** și pattern-ul **SendMessage-first** (Lead ↔ cercetător ↔ architect ↔ coder ↔ tester), nu polling de stare partajată. Referință: **`CLAUDE.md` la root-ul repo-ului Cursor / user config** (dacă lipsește din workspace, e același contract documentat în tooling-ul local). Exemplu minimal:

```javascript
// Toate agenții într-un singur mesaj; fiecare știe cui trimite SendMessage la pasul următor
Agent({ prompt: "… SendMessage findings to 'architect'.", subagent_type: "researcher", name: "researcher", run_in_background: true })
Agent({ prompt: "Wait for 'researcher'. … SendMessage to 'coder'.", subagent_type: "system-architect", name: "architect", run_in_background: true })
SendMessage({ to: "researcher", summary: "Start", message: "[context]" })
```

- **Obsidian:** set recomandat `JARVIS_ADAPTERS_ENABLED=obsidian,ruflo,hermes,good_mood` + `OBSIDIAN_VAULT_PATH`; detalii în **`cursor Jarvis ai/plans/JARVIS_PERSONAL_AGENT_DECK.md`**.
- **Continuity:** protocol resume **HANDOFF → Obsidian `NEXT` → git status** + layout vault; **[`JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md`](JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md)**.

---

## Execuție către 100% (definiție + status)

**„100% complet”** înseamnă aici: **toate gate-urile de mai sus sunt bifate**, metricile din tabel sunt atinse, și nu există blockere nedocumentate. Nu este un singur commit; este închidere secvențială pe faze (0→6) cu owneri diferiți (Hermes task split, Codex build, Claude review siguranță, Cursor UI, Antigravity vizual).

| Fază | Gate principal | Stare estimată (2026-05-11) | Ce lipsește pentru 100% |
|------|----------------|-----------------------------|-------------------------|
| **0** | P0 din `NEXT_ACTIONS` + handoff-uri | ~45% | Hermes/Codex închid T-009..T015, QA vizual, risk register la zi |
| **1** | T-004 done + Lighthouse a11y ≥ 90 la regresii | ~88% | Doar **semnarea formală Hermes** pentru T-004; **Lighthouse în CI** este deja în `.github/workflows/command-center.yml` + `lighthouserc.json` |
| **2** | Host/port într-un singur loc fără recompilare | ~82% | Polish leftover: `VITE_OPERATOR_API_ORIGIN` / CORS / inject boot URLs documentat; env operator dacă mai apare drift |
| **3** | React + paritate cu vanilla | ~5% | Migrare mare (săptămâni); Codex/Cursor plan incremental + Storybook opțional |
| **4** | Un truth `jervis-ai-console` + BRAIN canonical | ~15% | Decizie org + merge/submodule TRADE AI ↔ Jarvis AI (în afara unui singur agent) |
| **5** | Captain search + audit vizibil + Shields fără PII | ~64% | Captain search + Shields strip pe `main` (PR #8 și anterior); rămân: export audit vizibil în UI, **R-15..R-17** Claude, aidefence opțional |
| **6** | Voice + LaunchAgent + scheduler verificate | ~22% | Desk + voice intents **parțial** pe `main`; rămân: **wake word hardware**, legare supervisor completă, teste dispozitiv; `jervis-*.mjs` = owner Claude |

**Țintă realistă:** 100% pe **Faze 0–2 + porțiuni 5** poate fi atinsă în **câteva iterății** cu backlog prioritar; **Faza 3–4 + 6 complet** depinde de decizii de produs și timp de echipă.

**Footnote (sesiune integrare / desk):** livrările „premium **100%**” pentru **fazele 3–6** (React T-005, convergență repo, voice/LaunchAgent complet, etc.) rămân **backlog** — o sesiune tip **merge desk + env/docs** nu închide acele gate-uri.

---

*Acest fișier trăiește în `cursor Jarvis ai/plans/` până la promovare în `BRAIN/master-plan/` de către Claude dacă devine canon.*
