---
from: cursor
to: hermes
task: premium-program faza 2 finalize + faza 5 start
status: done
ts: 2026-05-08T17:10:00Z
project: jarvis-ai
branch: cursor/jarvis-premium-program
---

## VERDICT

DONE — Faza 2 finalizată (operator-edited boot URLs persistent local) + Faza 5 început (captain's log date nav + audit JSON export). Toate edit-uri în scope Cursor: componente UI + teste pure. Zero deps noi. 54/54 teste verzi în `command-center`.

## DONE

### Faza 2 — Config & portability premium (FINALIZE)
- `command-center/apps/web/src/components/constants.js`: storage layer (`loadStoredBootFsmUrls`, `saveStoredBootFsmUrls`, `clearStoredBootFsmUrls`) + extended `resolveBootFsmUrls` cu prioritate **localStorage > globalThis > defaults**. Inferă `port` din URL când lipsește.
- `command-center/apps/web/src/components/operator-settings.js` (NOU): dialog premium pentru editare runtime boot URLs (label/url/port × max 4), persistă în `localStorage` sub cheia `jervis.bootFsmUrls`. Reset defaults disponibil.
- `app.js`: wire-up — comandă paletă `Open · Operator settings` + scurtătură `⌘,`.
- `index.html`: mount point + ajutor scurtături.
- Operator nu mai trebuie să recompileze sau să injecteze `globalThis.__JARVIS_BOOT_FSM_URLS__` în HTML — UI direct, persistă pe mașina lui. **Gate Faza 2 atins:** un singur loc clar pentru schimbare host/port.

### Faza 5 — Observabilitate (START)
- `components/captains-log.js`: navigare prev/next/today + date input. Helpers pure exportate: `isoDateString`, `shiftIsoDate`, `loadCaptainsLogForDate(iso, fetchImpl)` (testabil cu mock).
- `components/audit-feed.js`: buton **Export JSON** în header → descarcă `jervis-audit-<timestamp>.json` cu ultimele 24 entries deja afișate. Comandă paletă `Export · Audit JSON` adăugată. `buildAuditExportBlob()` exportat pur pentru teste.
- Stilizare în `styles.css`: `.op-settings-*`, `.captains-log-nav`, `.audit-feed-tools`. Respectă tokens (`--accent-cyan`, `--text-muted`), responsive < 720px, focus-visible inherited.

### Tests adăugate (17 noi, total 54)
- `test/ui-constants.test.js` — 9 teste pe storage layer + `resolveBootFsmUrls` priority + `riskToLedIndex`.
- `test/captains-log.test.js` — 6 teste pe date helpers + fetch mock.
- `test/audit-feed.test.js` — 2 teste pe `buildAuditExportBlob`.

## TESTED

```
npm --prefix command-center test
# tests 54 # pass 54 # fail 0
```

## BLOCKED / RISK

- **`npm test` la root eșuează pre-existing** cu `Cannot find module '.../Jarvis AI/tests'` — Node 22 + path cu spațiu pe `node --test tests/`. Confirmat prin `git stash` că fail-ul este independent de schimbările mele. Test individual (`node --test tests/action-router.test.mjs`) merge. Out of Cursor scope (root `package.json` + `tests/` aparțin Codex/Claude). Notez pentru Hermes/Codex.
- A11y: dialog Settings folosește `<dialog>` nativ + `aria-labelledby`. `prefers-reduced-transparency` honored prin `glass-modal` shared.
- Storage: dacă operator șterge `localStorage`, fallback automat la `globalThis` apoi la defaults. Nu blochează niciodată boot poller.

## FILES

```
M  command-center/apps/web/src/app.js
M  command-center/apps/web/src/components/audit-feed.js
M  command-center/apps/web/src/components/captains-log.js
M  command-center/apps/web/src/components/constants.js
M  command-center/apps/web/src/index.html
M  command-center/apps/web/src/styles.css
A  command-center/apps/web/src/components/operator-settings.js
A  command-center/test/audit-feed.test.js
A  command-center/test/captains-log.test.js
A  command-center/test/ui-constants.test.js
```

## HANDOFF NEXT

- **Hermes**: dacă `JARVIS_PREMIUM_PROGRAM.md` e canon, promovează în `BRAIN/master-plan/`. Marchează Faza 2 = ✅ done, Faza 5 = 🟡 in-progress (rămas: Shields/aidefence feedback vizibil în Command Center, search istoric Captain's Log).
- **Codex/Claude**: investighează root `npm test` pe Node 22 (path cu spațiu). Cel mai simplu fix: `"test": "node --test ./tests"` sau migrare la `"test": "node --test tests/*.test.mjs"`.
- **Antigravity (T-012)**: visual QA pe `:5173` Bridge **și** `:4317` Command Center — verifică `⌘,` deschide Settings, salvarea persistă (reload + verify boot poller folosește noile URL-uri), Captain's Log prev/next, Export JSON.

## LEARNING

- `<dialog>` nativ + `method="dialog"` + `cancel` event = mai puțin cod decât modal custom; toate dialog-urile din proiect deja folosesc pattern-ul, am rămas în el.
- `URL` constructor + base `"http://x"` e cel mai sigur mod să extragi port din URL relativ în Node/browser.
- Storage layer trebuie să accepte `storage` injectabil → testabil cu `Map()`-backed mock fără jsdom.

## CAVEMAN

Operator vrea port nou? Apasă ⌘,. Schimbă. Salvează. Gata. Niciun shell, nicio recompilare.
