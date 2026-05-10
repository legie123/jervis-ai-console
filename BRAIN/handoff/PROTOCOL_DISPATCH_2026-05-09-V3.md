---
dispatch_id: DISPATCH-2026-05-09-V3
created_by: claude
created: 2026-05-09T23:55:00Z
status: ACTIVE
priority: P0
project: jarvis-ai
sprint_goal: "Convergence + Voice + Production E2E"
based_on: AUDIT-2026-05-09-MASTER-JERVIS
---

# Dispatch V3 — JERVIS Convergence Sprint

Bazat pe master audit `audits/2026-05-09__master-audit-jervis.md`. JERVIS supervisor LIVE pe `:7777` (5/7 modules UP, GREEN, 5 agents). Cursor a livrat PR #8 (Faza 1 LHCI + Faza 5 Shields, **99 tests**).

## Sprint goal

Convergența celor 3 worktree-uri într-unul singur, voice activation wireup, și E2E action loop test pe production.

## Task allocation V3

| ID                       | Owner       | Title                                          | Priority | Time est | Blocked by |
|--------------------------|-------------|------------------------------------------------|----------|----------|------------|
| T-2026-05-09-101         | codex       | Merge PR #8 + bridge-panel-v4 + bridge-panel-polish (squash trio) | P0 | 30m | — |
| T-2026-05-09-102         | claude      | Convergence plan: `cursor/p12-elite-ui-v0` ↔ `codex/whatsapp-cloud-run-live` ↔ `main` | P0 | 1h | T-101 |
| T-2026-05-09-103         | codex       | Voice activation wireup — Sprint s3-voice (STT/TTS, wake word, FSM gates) | P1 | 8h | — |
| T-2026-05-09-104         | cursor      | Captain's Log search UI integration în main app shell | P1 | 2h | — |
| T-2026-05-09-105         | antigravity | Visual QA pe shields-strip (Cursor PR #8) + LHCI report sanity | P1 | 30m | T-101 |
| T-2026-05-09-106         | hermes      | Update synthesis 2026-05-09 + close T-009/T-011/T-014/T-015/T-Premium-Faza1/Faza5 | P1 | 20m | — |
| T-2026-05-09-107         | claude      | Push commits locale `f8e632c` + `80b4b6f` (V3 Phase work) după pull --rebase | P0 | 15m | — |
| T-2026-05-09-108         | claude      | Worktree prune `claude/elastic-sanderson-032a43` (orphan 4 zile) | P2 | 5m | — |
| T-2026-05-09-109         | manus       | Research voice UX patterns (wakeword UX, false-positive rate, privacy) | P2 | 1h | — |
| T-2026-05-09-110         | codex       | WA E2E action loop production test (mesaj real → intent → router → effect) | P1 | 3h | T-103 |

## Dependencies

```
T-107 ───────────► T-101 (push V3 commits before merge)
T-108 ───────────► (independent)
T-109 ───────────► T-103 (research informs voice UX)
T-101 ─┬────► T-105 (visual QA needs merged state)
       └────► T-102 (convergence after merge)
T-103 ───────────► T-110 (E2E needs voice live)
T-106 ───────────► (independent)
T-104 ───────────► (independent)
```

## Forbidden in this sprint

- DO NOT touch `/Antigraity/TRADE AI/` ca proiect (PAUZĂ). OK doar pentru BridgePanel + integrări JERVIS.
- DO NOT touch `/Antigraity/TRADE AI NEW/` (out of scope, dormant)
- DO NOT push `--force` pe orice branch
- DO NOT merge PR-uri `cursor/*` în `main` fără claude review
- DO NOT delete worktree-uri active (doar orphan după prune verify)

## Definition of done (sprint-level)

- [ ] T-107 push commits V3 (R-14 closed)
- [ ] T-108 worktree prune (R-18 closed)
- [ ] T-101 PR #8 + bridge-panel trio merged → `main`
- [ ] T-102 convergence plan publicat (NU execute yet — needs Andrei sign-off)
- [ ] T-105 visual QA verdict PASS pe shields-strip
- [ ] T-106 synthesis 2026-05-09 publicat
- [ ] T-103 voice activation cel puțin partial (wake word detect)
- [ ] T-104 Captain's Log search live în main app shell
- [ ] T-109 research notes published în `BRAIN/research/voice-ux.md`

## Reporting cadence

Identic cu V2 — reply file + HANDOFF_CURRENT append + standard format report.

## Cross-references

- [Master Audit](../../../ai-ide-alliance-brain/audits/2026-05-09__master-audit-jervis.md)
- [Risk Register](../RISK_REGISTER.md) — R-02, R-14, R-18 critical
- [Dispatch V2](PROTOCOL_DISPATCH_2026-05-07-V2.md) — predecesor (4/8 done)
