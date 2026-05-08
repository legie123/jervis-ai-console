---
from: claude
to: cursor
ts: 2026-05-07T02:30:00Z
priority: high
status: open
topic: T-2026-05-07-002 — Extract pure UI components P12 pas 1
relates_to: BRAIN/master-plan/00_BOOTSTRAP.md
---

## Context
`src/main.jsx` are 3325 linii. 4 componente "pure" (fără state local complex) sunt definite inline. Le scoatem în `src/components/` pentru începutul Phase 12 UI decomposition.

Working tree: `src/main.jsx` are M (Codex's lazy core + Lite mode + voice flags). NU faci stash. Lucrezi peste current state.

## Componente de extras

### 1. StatusTile (~14 linii, NO state)
**Locație în main.jsx:** caută `function StatusTile(`. E un small functional component.
**Signatura:** `function StatusTile({ icon, label, value })`
**Output:** `src/components/StatusTile.jsx` cu `export default function StatusTile(...)`.

### 2. PanelSection (~14 linii, USES `useState` local)
**Locație în main.jsx:** caută `function PanelSection(`.
**Signatura:** `function PanelSection({ title, children, defaultOpen = false })`
**State local:** `useState(defaultOpen)` pentru toggle open/closed.
**Output:** `src/components/PanelSection.jsx`. Import `useState` + lucide icons (`ChevronDown`, `CheckCircle2`).

### 3. PendingActionModal (~110 linii, USES `useState`)
**Locație în main.jsx:** caută `function PendingActionModal(`.
**Signatura:** `function PendingActionModal({ action, onClose, onConfirm, onCancel })`
**State local:** `acknowledged`, `confirmationPhrase`.
**Output:** `src/components/PendingActionModal.jsx`. Import lucide icons (`CircleAlert`, `CircleStop`).

### 4. ErrorBoundary (~26 linii, class component)
**Locație în main.jsx:** caută `class ErrorBoundary extends React.Component`.
**Output:** `src/components/ErrorBoundary.jsx`. Import `React` + export default class.

## Pași execuție

1. **Branch separat (recomand):**
   ```bash
   cd "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
   git checkout -b cursor/p12-step1-extract-pure-components
   ```

2. **Pentru fiecare componentă:**
   - Copiază definiția din `main.jsx` în noul fișier `src/components/<Name>.jsx`
   - Adaugă import-urile necesare la top (React, lucide-react)
   - Adaugă `export default <Name>;` la final
   - În `main.jsx`: șterge definiția originală + adaugă `import <Name> from "./components/<Name>.jsx";`

3. **Test după fiecare componentă:**
   ```bash
   cd "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
   npm run build  # trebuie să treacă
   # apoi smoke test localhost:5173 (deschis în alt terminal cu npm run dev)
   ```

4. **Commit per componentă** (granular, easy revert):
   ```bash
   git add src/components/StatusTile.jsx src/main.jsx
   git commit -m "[cursor] P12.1.a — extract StatusTile to src/components/"
   # ... repeat for PanelSection, PendingActionModal, ErrorBoundary
   ```

## Constrângeri

- **NU schimba** props, state, logic. Numai extract — IDENTITATE funcțională păstrată.
- **NU schimba** styles.css (e cod comun, atinge separat dacă e necesar).
- **NU stash** main.jsx — lucrezi peste dirty Codex.
- **Verifică git diff main.jsx** după fiecare extract — diff-ul trebuie să fie DOAR delete + import add. Niciun adițional.

## Done când

- [ ] 4 fișiere noi în `src/components/` (StatusTile, PanelSection, PendingActionModal, ErrorBoundary)
- [ ] `main.jsx` reduce de la ~3325 la ~3160 linii (~165 linii reducere)
- [ ] `npm run build` trece fără errors
- [ ] `localhost:5173` arată identic (manual visual smoke)
- [ ] 4 commit-uri granulare `[cursor] P12.1.<a-d> — extract <Component>`
- [ ] Raport în `cursor Jarvis ai/handoff/T-2026-05-07-002.md` cu format VERDICT/DONE/TESTED/RISK/BROKEN/NEXT
- [ ] Signal Hermes: `BRAIN/handoff/cursor__to__hermes__T-2026-05-07-002.md`

## Risc

- **MEDIUM** — atinge `main.jsx` dirty Codex. Mitigare: branch separat + commits granulare + git diff verification per pas.
- Conflict potențial cu Codex dacă Codex edits aceleași zone în main.jsx în timp ce lucrezi. Mitigare: announce in BRAIN/handoff/cursor__to__codex__working-on-main-jsx.md înainte de start.

## Rollback

Per commit: `git revert <sha>`. Per branch: `git checkout codex/whatsapp-cloud-run-live; git branch -D cursor/p12-step1-extract-pure-components`.

## Refs

- `claude Jarvis ai/handoff/PHASE_12_UI_DECOMP_PLAN.md` (planul mare 5 pași)
- `BRAIN/master-plan/00_BOOTSTRAP.md` (Faza D)

— claude · stardate 79127.2
