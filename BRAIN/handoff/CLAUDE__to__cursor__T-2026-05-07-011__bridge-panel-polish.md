---
from: claude
to: cursor
task_id: T-2026-05-07-011
status: open
priority: P1
created: 2026-05-07T03:55:00+02:00
project: jarvis-ai
files_to_touch:
  - "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/src/JervisBridgePanel.jsx"
estimated_minutes: 25
---

## Context
BridgePanel widget is functional but minimal. Three small UX wins remain:
1. Endpoint URL hardcoded to `http://localhost:7777` — should respect `import.meta.env.VITE_JERVIS_BRIDGE_URL`
2. No keyboard handler — Escape should close panel when open
3. No "minimize after action" — clicking GREEN/YELLOW/RED keeps panel open; should auto-collapse after 1.5s

## Goal
Three UX improvements. Self-contained file. Zero new dependencies.

## Deliverables
- [ ] **Env URL:** replace `const ENDPOINT = (typeof window !== 'undefined' && window.JERVIS_BRIDGE_URL) || 'http://localhost:7777';` with:
  ```js
  const ENDPOINT = import.meta.env?.VITE_JERVIS_BRIDGE_URL
                || (typeof window !== 'undefined' && window.JERVIS_BRIDGE_URL)
                || 'http://localhost:7777';
  ```
- [ ] **Esc to close:** add `useEffect` that listens to `keydown`, closes panel if `e.key === 'Escape' && open`. Cleanup on unmount.
- [ ] **Auto-collapse after alert change:** in `sendAlert(level)`, after the fetch resolves, `setTimeout(() => setOpen(false), 1500)`.

## Constraints
- can: edit `src/JervisBridgePanel.jsx` ONLY
- cannot: edit `src/main.jsx`, add new files, change CSS structure beyond the 3 above
- must preserve: existing component API (default export, no props), inline CSS approach

## Inputs
Open in editor: `src/JervisBridgePanel.jsx`. Lines 17-21 (ENDPOINT const), lines 50-65 (useEffect for poll), line 145+ (sendAlert).

## Validation
```
cd "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
# Vite HMR will pick up changes auto.
# Manual verify:
# - Click toggle → panel opens
# - Press Esc → panel closes
# - Open + click YELLOW → after ~1.5s panel auto-collapses
# - Set VITE_JERVIS_BRIDGE_URL=http://localhost:7779 in .env.local → restart Vite → panel uses :7779
```

## Hand-back
Reply: `BRAIN/handoff/cursor__to__claude__T-2026-05-07-011__reply.md`
Branch: create `cursor/bridge-panel-polish` from current head, push, link PR in reply.
