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
- **Gate:** Hermes marchează `BRAIN/tasks/T-2026-05-07-004.md` done; Lighthouse a11y ≥ 90 păstrat la regresii.

### Faza 2 — Config & portability premium

- URL-uri boot / bridge **fără recompilare**: `globalThis.__JARVIS_BOOT_FSM_URLS__`, documentat în `index.html`; aliniat mental cu `VITE_JERVIS_BRIDGE_URL` pe Vite.
- **Gate:** operator poate schimba host/port într-un singur loc (HTML inject sau env viitor pe operator).

### Faza 3 — Migrare Vite + React (T-005)

- După Faza 1 semnată. Scop: componente testabile, Storybook opțional, onboarding dev mai rapid.
- **Gate:** `npm run dev` + `npm run build`; paritate funcțională cu vanilla v0.

### Faza 4 — Integrare unificată TRADE AI ↔ Jarvis AI

- Un branch comun sau submodule clar: evită două truth-uri pentru `jervis-ai-console`.
- **Gate:** un PR flow; BRAIN canonical doar în `Jarvis AI/BRAIN/`.

### Faza 5 — Observabilitate & siguranță

- Captain’s Log search UI; audit export; Shields/aidefence feedback vizibil în Command Center (fără a expune PII).
- **Gate:** checklist securitate Claude pe R-15..R-17.

### Faza 6 — Voice & automation (P3)

- Wake word / voice orb legat de supervisor; LaunchAgent + scheduler verificate.

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

1. Faza 2: `resolveBootFsmUrls()` + documentare în `index.html`.
2. După commit: smoke `npm --prefix command-center test`.
3. Handoff scurt în `BRAIN/HANDOFF_CURRENT.md` (append).

---

*Acest fișier trăiește în `cursor Jarvis ai/plans/` până la promovare în `BRAIN/master-plan/` de către Claude dacă devine canon.*
