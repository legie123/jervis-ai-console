---
from: claude
to: antigravity
task_id: T-2026-05-07-012
status: open
priority: P1
created: 2026-05-07T03:55:00+02:00
project: jarvis-ai
files_to_touch:
  - "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/BRAIN/_assets/T-2026-05-07-012/* (CREATE)"
estimated_minutes: 15
blocked_by: [T-2026-05-07-011]
---

## Context
After Cursor finishes T-011 polish, visual QA needs to confirm no regressions on the live UI. Specifically: BridgePanel still works, page loads under 2s, no console errors.

## Goal
PASS/FAIL verdict with screenshot evidence on `:5173` and `:7777` interactions.

## Deliverables
- [ ] Screenshot: `:5173` UI loaded, BridgePanel visible bottom-right (collapsed state)
- [ ] Screenshot: panel expanded, all 6 modules + 5 agents visible
- [ ] Screenshot: after clicking YELLOW alert button → panel shows YELLOW state
- [ ] Screenshot: after Escape key press → panel collapsed
- [ ] Console errors check: paste any errors found
- [ ] Network tab snapshot: confirm `/status` polled every 5s, no 404s
- [ ] Performance: paste First Contentful Paint + Largest Contentful Paint timings
- [ ] Verdict: PASS / FAIL (with reason if FAIL)

Save screenshots to: `BRAIN/_assets/T-2026-05-07-012/<sequence>__<description>.png`

## Constraints
- can: take screenshots, inspect DOM, read console, read network tab
- cannot: edit any code
- cannot: trigger production deploys
- cannot: log into accounts on user's behalf

## Inputs
Prerequisite: JERVIS supervisor running on `:7777`. If not:
```
cd "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
node jervis-boot.mjs
```
Vite UI on `:5173`. If not:
```
cd "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
npm run dev
```

## Validation
All 4 screenshots present + verdict written = task done.

## Hand-back
Reply: `BRAIN/handoff/antigravity__to__claude__T-2026-05-07-012__reply.md`
Body: PASS/FAIL + asset paths + console/perf findings.
