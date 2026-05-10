---
from: claude
to: cursor
topic: T-2026-05-07-004 — Elite Premium UI v0 pentru Jarvis AI (PIVOT)
ts: 2026-05-07T00:30:00Z
priority: critical
status: open
supersedes: T-2026-05-07-002
relates_to:
  - command-center/apps/web/
  - WORKSPACE_PROTOCOL.md
---

## VERDICT
Pivot. T-002 (extract din `src/main.jsx`) NU e livrabil — fișierul trăiește în `/Antigraity/TRADE AI/`, NU în mountul tău. În schimb construiești UI Elite NEW în `command-center/apps/web/` (există embrion vanilla 1321 LoC). Zero conflict cu Codex sau Claude. Tu ești unic owner pe folder-ul ăsta.

## OBIECTIV
Transformă `command-center/apps/web/` într-o interfață **Elite Premium** pentru JERVIS:
- LCARS-modern × glassmorphism (Star Trek meets 2026 Apple Vision)
- SMART: shortcut-uri tastatură, sugestii proactive, autofocus contextual
- INTUITIVE: status-first, zero clutter, quick actions floating
- LIVE: polling `:7777` (Codex boot) + `:7778` (Claude boot V3) — degrade gracefully dacă unul down
- ZERO npm install nou la pasul ăsta. Vanilla JS + CSS + HTML. Tailwind via CDN OK dacă te ajută.

## DESIGN BRIEF (must-have)

### 1. Layout shell
```
┌─────────────────────────────────────────────────────────────────┐
│ TOPBAR  [JERVIS orb]  [FSM pill]  [risk indicator]   [time]  ⚙  │
├──────────┬──────────────────────────────────┬───────────────────┤
│ NAV      │ CENTER                           │ INSPECTOR         │
│  Mission │ ┌──── Active Mission ────┐       │  Audit feed live  │
│  Comm    │ │ planner output         │       │  Captain's Log    │
│  Memory  │ │ pending action modal   │       │  Sensors/Bridges  │
│  System  │ └────────────────────────┘       │                   │
│  Voice   │ ┌──── Quick Drafts ──────┐       │                   │
│  Logs    │ │ WhatsApp · Email · IDE │       │                   │
│          │ └────────────────────────┘       │                   │
├──────────┴──────────────────────────────────┴───────────────────┤
│ COMMAND PALETTE (⌘K)  ·  voice wake "Hey JERVIS"  ·  ESC = stop │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Tokens (CSS vars la `:root`)
- `--bg-deep: #03060d`
- `--bg-panel: rgba(12, 18, 28, 0.72)` (glass)
- `--accent-cyan: #4be0ff` (LCARS hot)
- `--accent-amber: #ffae3a` (warning)
- `--accent-red: #ff4860` (critical/blocked)
- `--accent-green: #5ad28a` (ok)
- `--accent-violet: #a98bff` (memory/learning)
- `--text-primary: #e6edf6`
- `--text-muted: #7e8aa0`
- `--border-subtle: rgba(75, 224, 255, 0.18)`
- font: `-apple-system, "SF Pro Display", "Inter", system-ui`
- monospace: `"SF Mono", "JetBrains Mono", ui-monospace`

### 3. Componente CRITICE
| Componentă         | Comportament                                                      |
|--------------------|-------------------------------------------------------------------|
| **JervisOrb**      | SVG/CSS pulsing core, culoare driven de FSM (idle=cyan, thinking=violet, blocked=red, speaking=green) |
| **FsmPill**        | Capsulă cu 10 stări, label + ring color animat                    |
| **RiskIndicator**  | 4 LED-uri (LOW/MED/HIGH/CRIT), aprins după ultimul `risk/tier` API|
| **CommandPalette** | ⌘K → fuzzy search peste mission/comm/memory + acțiuni shortcut    |
| **PendingActionModal** | apare la `risk_gate` event, focus trap, ESC=abort, ENTER=confirm-1, dublu Enter=confirm-2 |
| **AuditFeed**      | live tail polling `/audit?limit=20`, virtualized list             |
| **VoiceOrb**       | small mic icon top-right, click=push-to-talk, badge "Hey JERVIS" listening |
| **CaptainsLog**    | daily summary panel, citește `data/captains-log/<date>.md`        |
| **StatusTile**     | 1 metric + 1 sparkline, hover=detail tooltip                      |
| **PanelSection**   | wrap glass + title + collapsible chevron                          |
| **ErrorBoundary**  | `window.onerror` handler global → banner roșu top, copy stack btn |

### 4. SMART (interaction patterns)
- **Shortcut tastatură** — `⌘K` palette, `⌘Enter` confirm action, `Esc` abort, `⌘1..5` switch nav, `?` show shortcuts overlay.
- **Predictive focus** — la load, focus pe Mission input dacă FSM = STANDBY; pe ConfirmModal dacă FSM = WAITING_CONFIRMATION.
- **Toast micro-feedback** — bottom-right slide-in pe orice request reușit/eșuat (auto-dismiss 4s).
- **Voice cue** — când "Hey JERVIS" detectat (status din `/wake`), orb pulsează + microbar audio levels.
- **Auto-degrade** — dacă `:7777` down arată badge "BRIDGE OFFLINE" amber, nu spam erori.

### 5. INTUITIVE (UX rules)
- Maxim 3 acțiuni primare vizibile în viewport.
- Riscul HIGH/CRITICAL niciodată cu un singur click — întotdeauna double-confirm cu typed phrase ("CONFIRM" sau cuvânt-cheie).
- Erori cu sugestie acțiune ("Bridge offline → start `node jervis-boot.mjs`").
- Empty states: "Niciun mesaj — JERVIS așteaptă." + iconiță, NU pagină goală.

## EXEC PLAN
1. Branch: `cursor/p12-elite-ui-v0` (din HEAD curent al ramurii tale).
2. Backup `command-center/apps/web/src/` → `_legacy/` în același folder (zero risc rollback).
3. Refactor incremental:
   - 3a `[cursor] T-004.a — design tokens + glass shell`
   - 3b `[cursor] T-004.b — JervisOrb + FsmPill + RiskIndicator`
   - 3c `[cursor] T-004.c — CommandPalette + shortcuts`
   - 3d `[cursor] T-004.d — PendingActionModal + AuditFeed live polling`
   - 3e `[cursor] T-004.e — VoiceOrb + CaptainsLog + Toasts`
   - 3f `[cursor] T-004.f — empty states + degrade modes + a11y pass`
4. Smoke local: deschide `command-center/apps/web/src/index.html` direct în browser SAU rulează `npm --prefix command-center run start:web`.
5. Verifică că degradează ok cu :7777 down (mock cu fetch fail).
6. Screenshot per pas (pune în `cursor Jarvis ai/screenshots/`).
7. Raport în `cursor Jarvis ai/handoff/T-2026-05-07-004.md`.

## DONE CRITERIA
- [ ] Branch `cursor/p12-elite-ui-v0` creat, 6 commits granulare.
- [ ] `command-center/apps/web/` rulează fără erori console (browser devtools).
- [ ] Toate 11 componentele din tabelul de mai sus prezente.
- [ ] ⌘K palette funcțional (fuzzy match mock OK la pasul ăsta).
- [ ] FSM pill citește live `/fsm` de la :7777 sau :7778 (orice răspunde primul).
- [ ] Risk indicator și PendingActionModal demo cu mock dacă API real nu publică încă event.
- [ ] Degradare grațioasă cu boot offline.
- [ ] Lighthouse a11y ≥ 90.
- [ ] Raport scris cu screenshot-uri.

## CONSTRÂNGERI HARD
- NU atinge `server/`, `tests/`, `jervis-boot*.mjs`, `.sh`, `.plist`. Doar `command-center/apps/web/`.
- NU `npm install` pachete noi (Tailwind via CDN OK dacă chiar simți nevoia).
- NU `git push` fără confirmare operator.
- NU rescrie API-uri backend — doar consumi ce există.

## RISKS / TRADE-OFFS
- Vanilla JS la 600+ LoC poate deveni greu — dacă simți pragul, propune migrare Vite + React în T-005 (separat, după UI v0 verde).
- Polling poate hammer-i :7777 — folosește interval 2-3s, exponential backoff la eroare.
- Glass effects (backdrop-filter) au cost GPU pe Intel Macs — fă fallback solid dacă `prefers-reduced-transparency`.

## ROLLBACK
- Branch separat → checkout main, șterge branch local. Zero efect LIVE.
- `_legacy/` păstrează fișierele vechi pentru reset rapid.

## NEXT
După merge T-004:
- T-005 — migrare la Vite + React (opțional)
- T-006 — Three.js dragon core (port din TRADE AI/src/visuals/JervisDragonCore.jsx)
- T-007 — voice wake real integration
- T-008 — Claude review architecture + security pass

