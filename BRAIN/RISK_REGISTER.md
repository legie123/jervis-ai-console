---
project: jarvis-ai
last_updated: 2026-05-07
curator: claude
---

# JERVIS — Risk Register

Active risks. Severity × Likelihood × Mitigation.

| ID  | Risk                                                           | Severity | Likelihood | Status      | Mitigation / Owner      |
|-----|----------------------------------------------------------------|----------|------------|-------------|-------------------------|
| R-01| Two BRAIN folders diverge (TRADE AI/Jarvis AI vs Jarvis AI)    | medium   | high       | mitigating  | D-002 canonical decision; one-way sync script TBD / claude |
| R-02| Cursor branch `cursor/p12-elite-ui-v0` diverges from `codex/whatsapp-cloud-run-live` | high | high | open | merge plan needed / claude+cursor |
| R-03| Ruflo MCP not bootstrapped → swarm features unavailable        | low      | high       | mitigated   | local aidefence + agentdb fallback in jervis-boot / claude |
| R-04| Docker not running → Holodeck falls back to subprocess (less isolation) | medium | medium | mitigated  | dual engine, user can start Docker / claude |
| R-05| WhatsApp bridge :8787 going down silently → sensor logs only   | medium   | medium     | monitoring  | Sensors poll 60s, log warn / claude |
| R-06| ANTHROPIC_API_KEY exposed if logged                            | high     | low        | mitigated   | env-only, never logged, gitignore enforced / claude |
| R-07| `jervis-boot-v3.mjs` author identified (claude-coder, V3 companion :7778) | low | low | closed | D-J008 in DECISION_LOG / claude |
| R-08| Action router executing on attacker-controlled WA messages     | high     | low        | mitigated   | shields gate + sender allowlist + RED gate + rate limit / claude |
| R-09| Sandbox `rm -rf /` style escape via shell injection            | critical | low        | mitigated   | dangerous-shell blocklist + Docker isolation when available / claude |
| R-10| Memory MCP scheduled task fails silently if JERVIS off         | low      | high       | by-design   | task gracefully exits if `/status` unreachable / claude |
| R-11| LaunchAgent runs but vault path different on second machine    | medium   | low        | open        | path is hardcoded; needs env-driven config / claude |
| R-12| Multiple agents committing to same file in same minute         | medium   | medium     | open        | AGENT_ASSIGNMENTS.md owner mapping; conflict via PR / claude+codex+cursor |
| R-13| Captain's Log blowing up in size after months                  | low      | medium     | accepted    | one file per day → bounded growth |
| R-14| `f8e632c` and `80b4b6f` local commits never pushed             | medium   | high       | open        | rebase + push pending in next session / claude |
| R-15| Other IDEs (Cursor/Codex/Antigravity) not yet on alliance protocol | medium | medium | mitigated | bootstrap files (.cursorrules, AGENTS.md, CLAUDE.md) deployed in /Jarvis AI/ — auto-loaded next session / claude |
| R-16| LaunchAgent com.jervis.brain-mirror-sync.plist not yet loaded  | low      | high       | mitigated   | RunAtLoad=true → auto-activates on next login. User can run `launchctl load` for immediate / claude |
| R-17| Multi-agent commit conflicts (Cursor+Codex+Hermes+claude parallel) | medium | medium | mitigated | DISPATCH-2026-05-07-V2 explicit file-touch matrix per agent / claude |

## Severity scale
- **critical** — data loss, security breach, system down >1h
- **high** — feature broken, blocks other agents
- **medium** — degraded experience, workaround exists
- **low** — cosmetic, no functional impact

## Likelihood scale
- **high** — happens weekly
- **medium** — happens monthly
- **low** — happens rarely

## Status
- **open** — no mitigation yet
- **mitigating** — work in progress
- **mitigated** — safeguard in place
- **monitoring** — accept + watch
- **accepted** — won't fix, conscious choice

## Review cadence

Every 7 days OR when a new module ships.
Last review: 2026-05-07 03:55 [claude] — added R-15..R-17, closed R-07.
