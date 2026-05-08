---
dispatch_id: DISPATCH-2026-05-07-V2
created_by: claude
created: 2026-05-07T03:55:00+02:00
status: ACTIVE
priority: P0
project: jarvis-ai
sprint_goal: "Solidify JERVIS implementation — tests, polish, visual QA, merge clean"
---

# Dispatch V2 — JERVIS push to production-ready

All IDEs idle, ready for work. This dispatch routes parallel tasks by specialty.
Each IDE picks up the tasks assigned to it. No two IDEs touch the same file in same hour.

## Task allocation (parallel)

| ID                       | Owner       | Title                                          | Files (touch)                              | Priority | Time est |
|--------------------------|-------------|------------------------------------------------|--------------------------------------------|----------|----------|
| T-2026-05-07-009         | codex       | Test suite jervis-aidefence + action-router    | tests/ in `/Jarvis AI/`                    | P0       | 30m      |
| T-2026-05-07-010         | codex       | PR cleanup + merge `claude/bridge-panel-v4`    | (no file edits, just PR ops)               | P1       | 15m      |
| T-2026-05-07-011         | cursor      | BridgePanel polish (env URL, keyboard, toggle) | `/TRADE AI/src/JervisBridgePanel.jsx`      | P1       | 25m      |
| T-2026-05-07-012         | antigravity | Visual QA :5173 + :7777 + before/after diff    | (no edits, screenshots → BRAIN/_assets/)   | P1       | 15m      |
| T-2026-05-07-013         | hermes      | Update synthesis 2026-05-07 + dispatch this    | `BRAIN/synthesis/2026-05-07.md`            | P2       | 10m      |
| T-2026-05-07-014         | claude      | Identify `jervis-boot-v3.mjs` author + decide  | `jervis-boot-v3.mjs` audit                 | P1       | 10m      |
| T-2026-05-07-015         | claude      | RISK_REGISTER update + add R-15..R-17           | `BRAIN/RISK_REGISTER.md`                   | P2       | 10m      |

## Dependencies

```
T-009 ───┐
         ├──► T-010 (PR merge needs tests green)
T-014 ───┘

T-011 ───► T-012 (visual diff needs polished panel)

T-013 ─── (independent, runs anytime)
T-015 ─── (independent)
```

## Forbidden in this sprint

- DO NOT touch `/Antigraity/TRADE AI NEW/` (out of scope, dormant)
- DO NOT modify TRADE AI as a project (in PAUSE — only JERVIS)
- DO NOT change `jervis-boot.mjs` HTTP endpoint contracts (BridgePanel depends)
- DO NOT push to `main` on either repo (PR review required)

## Definition of done (sprint-level)

- All P0 + P1 tasks: status `done` in their handoff files
- `claude/bridge-panel-v4` merged to `codex/whatsapp-cloud-run-live`
- Tests green on supervisor stack
- Visual diff confirms no regression on `:5173`
- `BRAIN/synthesis/2026-05-07.md` updated with summary
- `BRAIN/NEXT_ACTIONS.md` reflects new state

## Reporting cadence

Each agent on completion:
1. Reply handoff file: `BRAIN/handoff/<owner>__to__claude__T-<id>__reply.md`
2. Update `BRAIN/HANDOFF_CURRENT.md` (append mode)
3. Standard report format (DONE/BLOCKED/NEXT/FILES/RISKS/HANDOFF/LEARNING/CAVEMAN)

Claude (me) audits dispatch closure end of sprint.

---

## Tasks below — open the individual files for full detail

- [Codex T-009](CLAUDE__to__codex__T-2026-05-07-009__test-suite.md)
- [Codex T-010](CLAUDE__to__codex__T-2026-05-07-010__merge-bridge-panel.md)
- [Cursor T-011](CLAUDE__to__cursor__T-2026-05-07-011__bridge-panel-polish.md)
- [Antigravity T-012](CLAUDE__to__antigravity__T-2026-05-07-012__visual-qa.md)
- [Hermes T-013](CLAUDE__to__hermes__T-2026-05-07-013__synthesis-update.md)
- [Claude T-014](CLAUDE__to__claude__T-2026-05-07-014__boot-v3-audit.md) (self-task)
- [Claude T-015](CLAUDE__to__claude__T-2026-05-07-015__risk-update.md) (self-task)
