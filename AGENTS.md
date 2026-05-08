# Agents Guide — JERVIS project

This file is read by Codex (and other AGENTS.md-aware tools) at session start.
Treat it as the single contract for any agent acting on this codebase.

## Project: JERVIS

Personal AI agent (NOT trading despite folder names). Multi-module:
Bridge UI :5173 · Warp Core :7777 · Sensors · Holodeck · Shields · Transporter · Database.

Repo: https://github.com/legie123/jervis-ai-console

## Mandatory reads at start of session

1. `/Users/user/Desktop/BUSSINES/Antigraity/ai-ide-alliance-brain/IDE_ALLIANCE_PROTOCOL.md`
2. `/Users/user/Desktop/BUSSINES/Antigraity/ai-ide-alliance-brain/AGENT_ROLES.md`
3. `BRAIN/PROJECT_STATUS.md`
4. `BRAIN/HANDOFF_CURRENT.md`
5. `BRAIN/handoff/*__to__codex__*.md` (look for tasks assigned to you)

Acknowledge with:
```
PROTOCOL: loaded v1.0
PROJECT: jarvis-ai
TASKS ASSIGNED: <T-IDs>
READY.
```

## Codex role

Implementation, tests, lint/typecheck/build, PRs.
NOT architecture decisions. NOT brain file editing (except HANDOFF_CURRENT after own work).

## Branching

- `codex/<short-topic>` for new work
- Commit prefix: `[codex] <verb> <object>` (max 60 chars title)
- PR description = standard report format (DONE/BLOCKED/NEXT/FILES/RISKS/HANDOFF/LEARNING/CAVEMAN)

## Code standards

- Read file before editing
- Preserve existing style; do not reformat unrelated lines
- Add tests for new logic. If tests not feasible → explain in handoff
- No new dependencies without `BRAIN/DECISION_LOG.md` entry first
- No comments unless code is non-obvious

## Forbidden

- `git push --force`
- `git rebase` on shared branches without coordinating
- merging your own PRs (Claude or Andrei reviews)
- adding secrets to any file
- skipping tests "to save time"
- modifying `jervis-*.mjs`, `jervis-*.html` without explicit handoff (Claude owns these)
- modifying brain files outside HANDOFF_CURRENT
- modifying `.env*` except `.env.example`

## File ownership map

| Pattern                           | Owner    | Codex can edit? |
|-----------------------------------|----------|-----------------|
| `jervis-*.mjs`                    | claude   | ❌ (handoff)     |
| `jervis-*.html`                   | claude   | ❌               |
| `*.plist`, `install-*.sh`         | claude   | ❌               |
| `BRAIN/master-plan/*`             | hermes   | ❌               |
| `BRAIN/synthesis/*`               | hermes   | ❌               |
| `BRAIN/tasks/*`                   | hermes   | ❌               |
| `BRAIN/handoff/codex__to__*`      | codex    | ✅ (write reply) |
| `BRAIN/HANDOFF_CURRENT.md`        | shared   | ✅ (append)      |
| `src/components/codex/*`          | codex    | ✅               |
| `tests/*`                         | codex    | ✅               |
| `package.json`, `tsconfig.json`   | shared   | ⚠️  (decision log entry first) |

## Tools you should use

- `Read` / `Edit` / `Write` for files
- `Grep` for search
- `Bash` for tests/lint/build
- GitHub CLI: `gh pr create`, `gh pr checks`

## Before stopping

1. Open PR (or update existing)
2. Write reply handoff: `BRAIN/handoff/codex__to__<from>__T-<id>__reply.md`
3. Update `BRAIN/HANDOFF_CURRENT.md` with task status
4. Append `BRAIN/LEARNING.md` if any surprise
5. Commit with `[codex] <summary>`

## Reporting format

```
DONE:
BLOCKED:
NEXT:
FILES:
RISKS:
HANDOFF:
LEARNING:
CAVEMAN:
```

## Tone

Romanian or English, caveman-style: short, sharp, no filler. No padding.
