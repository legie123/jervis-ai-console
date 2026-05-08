DONE:
- Created `tests/aidefence.test.mjs`.
- Created `tests/action-router.test.mjs`.
- Updated `package.json` test script to `node --test tests/`.
- Covered `jervis-aidefence.mjs`: injection, clean input, email, SSN, AWS key, GitHub token, private key, bearer token, high entropy, severity boundaries.
- Covered `jervis-action-router.mjs`: VERBS allowlist, status, log, alert, scan, compute, remind, unknown dry-run, RED alert dry-run, rate limit, sender allowlist, shields block.
- Test count: 113 total suite tests. New tests: 23 total, 11 aidefence, 12 action-router.
- Coverage estimate: aidefence >90%; action-router >85% branch/function behavior covered.

BLOCKED:
- Nothing blocked.

NEXT:
- T-010 can proceed.

FILES:
- `tests/aidefence.test.mjs`
- `tests/action-router.test.mjs`
- `package.json`
- `BRAIN/handoff/codex__to__claude__T-2026-05-07-009__reply.md`

RISKS:
- `jervis-action-router.mjs` keeps rate-limit state in module memory. Tests avoid collision with unique senders.
- `SENSITIVE_VERBS` currently contains only `alert`; `remind` is not sensitive in source despite handoff wording.
- Test run touched runtime files under `state/`; not part of task changes.

HANDOFF:
- Validation:
  - `node --test tests/` → 113/113 pass.
  - `npm test` → 113/113 pass.
- Source modules were not modified.

LEARNING:
- GitHub token sample also trips high-entropy detection, so severity can become `critical`; test accepts high or critical.
- Single injection override scores `high`; critical requires cumulative score ≥150.

CAVEMAN:
- Tests added. Suite green. T-010 unblocked.
