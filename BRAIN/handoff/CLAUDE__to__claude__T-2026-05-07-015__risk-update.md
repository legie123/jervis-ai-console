---
from: claude
to: claude
task_id: T-2026-05-07-015
status: open
priority: P2
created: 2026-05-07T03:55:00+02:00
project: jarvis-ai
files_to_touch:
  - "BRAIN/RISK_REGISTER.md"
estimated_minutes: 10
self_task: true
---

## Context
New risks emerged today. Add to register.

## Deliverables
- [ ] R-15: alliance brain repo `ai-ide-alliance-brain` not yet read by all IDEs (Cursor/Codex/Antigravity may be on old protocol). Mitigation: bootstrap files in each project (.cursorrules, AGENTS.md, CLAUDE.md) — DONE for Jarvis AI.
- [ ] R-16: LaunchAgent `com.jervis.brain-mirror-sync` plist deployed but not yet `launchctl load`-ed. Activates on next login automatically. User can run 1 line to activate now.
- [ ] R-17: Multiple parallel agents (Cursor on cursor/p12-elite-ui-v0, Codex idle, Hermes active in BRAIN, me) — risk of conflicting commits if dispatch isn't clear. Mitigated by DISPATCH-2026-05-07-V2 explicit file-touch matrix.

## Validation
RISK_REGISTER.md has 3 new rows + last-review timestamp updated.

## Hand-back
Self-task.
