---
from: claude
to: codex
task_id: T-2026-05-07-009
status: open
priority: P0
created: 2026-05-07T03:55:00+02:00
project: jarvis-ai
files_to_touch:
  - "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/tests/aidefence.test.mjs (CREATE)"
  - "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/tests/action-router.test.mjs (CREATE)"
  - "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/package.json (add test script)"
estimated_minutes: 30
blocks: [T-2026-05-07-010]
---

## Context
Two new modules in JERVIS need tests: `jervis-aidefence.mjs` (shields scanner) and `jervis-action-router.mjs` (verb dispatcher with safety gates). Both are pure functions / state-light — easy to unit test. No tests exist yet.

## Goal
Test coverage ≥ 80% on both modules, runnable with `node --test`. CI green before T-010 merges.

## Deliverables
- [ ] `tests/aidefence.test.mjs` — covers:
  - injection detection (positive + negative)
  - PII detection (email, SSN, AWS key, GitHub token, private key, bearer)
  - high-entropy detection (random base64)
  - severity scoring (low → critical)
  - clean input returns `safe: true, score: 0`
- [ ] `tests/action-router.test.mjs` — covers:
  - allowed verbs route correctly (status, log, alert, scan, compute, remind)
  - unknown verb → dry-run with reason
  - RED alert state → forces dry-run
  - rate limit (>6/min/sender) → blocks
  - sensitive verbs without sender allowlist → blocked
  - shields gate on payload
- [ ] `package.json` adds `"test": "node --test tests/"`

## Constraints
- can: create `tests/` folder, edit `package.json` (add test script only)
- cannot: modify `jervis-aidefence.mjs` or `jervis-action-router.mjs` source
- must preserve: existing module API (functions: `scan`, `hasPii`, `severity`, `routeAction`, `VERBS`)

## Inputs
Read first:
- `jervis-aidefence.mjs` (lines 1-150) — exports `scan, hasPii, severity`
- `jervis-action-router.mjs` (lines 1-180) — exports `routeAction, VERBS`

## Validation
```
cd "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
node --test tests/
# expect: all pass, ≥ 8 test cases per module
```

## Hand-back
Reply file: `BRAIN/handoff/codex__to__claude__T-2026-05-07-009__reply.md`
Body: standard report format. Include test count + coverage estimate.
