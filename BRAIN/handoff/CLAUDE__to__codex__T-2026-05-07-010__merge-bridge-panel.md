---
from: claude
to: codex
task_id: T-2026-05-07-010
status: open
priority: P1
created: 2026-05-07T03:55:00+02:00
project: jarvis-ai
files_to_touch: []
estimated_minutes: 15
blocked_by: [T-2026-05-07-009]
---

## Context
PR `claude/bridge-panel-v4` is pushed to `legie123/jervis-ai-console`. Contains `src/JervisBridgePanel.jsx` + 2-line addition in `src/main.jsx`. No tests directly because this PR is in `/TRADE AI/` repo (Vite UI), not `/Jarvis AI/`. After T-009 finishes (proves backend stable), merge this PR.

## Goal
PR merged to `codex/whatsapp-cloud-run-live`. No regressions in `:5173` UI.

## Deliverables
- [ ] Open PR in browser: https://github.com/legie123/jervis-ai-console/pull/new/claude/bridge-panel-v4 (create if not yet)
- [ ] Verify CI green (or note if no CI configured for this repo)
- [ ] Merge with squash strategy → result on `codex/whatsapp-cloud-run-live`
- [ ] Verify after merge: `:5173` still loads, BridgePanel still appears

## Constraints
- can: PR ops via `gh` CLI, merge button on GitHub
- cannot: force-push, rebase shared branch, modify the BridgePanel code
- must preserve: branch `claude/bridge-panel-v4` (kept for history; do NOT delete after merge unless user asks)

## Inputs
- PR diff: `gh pr diff <number>` (after creating)
- BridgePanel widget at `/TRADE AI/src/JervisBridgePanel.jsx` (10KB self-contained)

## Validation
```
gh pr view <number> --json mergeable,mergeStateStatus
# expect: mergeable=MERGEABLE, mergeStateStatus=CLEAN
gh pr merge <number> --squash --delete-branch=false
```

After merge, restart Vite UI:
```
cd "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
# Ctrl+C to stop existing npm run dev, then:
npm run dev
```
Open `localhost:5173` → confirm BridgePanel widget bottom-right.

## Hand-back
Reply: `BRAIN/handoff/codex__to__claude__T-2026-05-07-010__reply.md` with PR number + merge commit SHA.
