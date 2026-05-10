# JARVIS — Ruflo + Obsidian continuity (operator pattern)

**Goal:** **Ruflo** (named agents, claude-flow) carries execution; **Obsidian** is the **second brain** so every session can **resume cold** at the same mental checkpoint. The Command Center inbox and **`/api/ruflo/feed`** stay useful only when audit lines match the operator’s matchers.

---

## Ruflo / task split

### Named agents and SendMessage-first handoffs

Swarm work in Claude Code / Ruflo-style stacks should **not** rely on polling shared git state or implicit “someone will notice.” Use **explicit named agents** and **SendMessage-first** pipelines: each agent’s prompt states **who receives the next message** and **what artifact** to send.

- **Canonical reference:** `CLAUDE.md` in your **Cursor / Claude Code user config** (often `~/CLAUDE.md`). It is **not** always copied into this repo; if missing here, treat that file (or your team’s pinned copy) as the contract.
- **Pattern (summary):** spawn all agents in **one** turn with `run_in_background: true`, each prompt includes handoff instructions; kick off with `SendMessage` to the first worker (e.g. researcher → architect → coder → tester). Avoid ad-hoc shared state as the coordination bus.
- **CLI:** when you use the stack, prefer **`npx @claude-flow/cli@latest`** (or a **pinned, audited** version) — never blind installs on production paths.

### Audit rows: keep `/api/ruflo/feed` + inbox warm

Adapter feeds are built from **recent audit JSONL** via substring match on **`source`** and **`action`** (lowercased). For the **Ruflo** adapter, matchers are **`ruflo`**, **`swarm`**, **`claude_flow`** (`adapterMatchers` in `command-center/apps/operator/src/http.js`).

**Rule:** when agents or tooling log to the audit trail, include at least one of those tokens in **`source`** or **`action`** (e.g. `source: "ruflo:coder"`, `action: "swarm_task_complete"`). Otherwise **`GET /api/ruflo/feed`** and the Unified Inbox Ruflo channel show only fallbacks.

Same idea for other mandatory inbox channels:

| Adapter    | Matchers (substring in `source` or `action`) |
|------------|------------------------------------------------|
| **Hermes** | `hermes`, `dispatcher`, `handoff`              |
| **GoodMood** | `good_mood`, `goodmood`, `coach`, `mood`     |

The web client **always** refreshes Ruflo / Hermes / GoodMood feeds on inbox refresh (`collaboration-feeds.js`). **Enable** the matching `JARVIS_ADAPTER_*` flags and emit tagged rows so the **Command Center** stays aligned with real agent work.

---

## Obsidian second brain

### Minimal vault layout (under your vault root)

Keep **three small notes** under a single folder (e.g. **`Jarvis/`**):

| File | Role |
|------|------|
| **`Jarvis/SESSION.md`** | Running log of this session: decisions, links, half-done tasks (append during work). |
| **`Jarvis/NEXT.md`** | **Stub for the next session:** the next action, blockers, and “read this first” links. **This is the primary resume anchor in Obsidian.** |
| **`Jarvis/DECISIONS.md`** | Short ADR-style bullets (what changed, why, date). Optional if you already use `BRAIN/DECISION_LOG.md` — don’t duplicate long prose. |

### Daily habit

1. **End of session:** append to **`SESSION.md`**; rewrite **`NEXT.md`** so it can stand alone (a tired-you tomorrow only opens **NEXT**).
2. **Start of session:** open **`NEXT.md` first** before drafting new work.
3. **Repo handoff:** still update **`BRAIN/HANDOFF_CURRENT.md`** for agent-to-agent truth; Obsidian captures **operator narrative** and quick context.

### Env bridge (operator + vault)

- **`OBSIDIAN_VAULT_PATH`**: absolute path to the vault used for sync/bridge.
- **`JARVIS_ADAPTERS_ENABLED=obsidian,ruflo,hermes,good_mood`**: recommended stack so Obsidian feed + agent feeds all appear in the UI.
- **Sync / write gates:** `OBSIDIAN_WRITE_ENABLED`, confirm tokens, and **`./scripts/sync-obsidian.sh`** — see **`command-center/docs/LOCAL_SETUP.md`** (Obsidian Sync + adapter feeds sections) and **`command-center/config/.env.example`**.

---

## Resume protocol (strict order)

At **every** new session, in this order:

1. **`BRAIN/HANDOFF_CURRENT.md`** — canonical “what the last agent left” (_yaml + latest session block_).
2. **Obsidian `Jarvis/NEXT.md`** — operator intent and immediate next step (create the file if missing).
3. **`git status`** (and `git log -1` / branch if merging) — reconcile local drift, stashes, and open work.

Only after these three should you start writes, spawns, or large refactors.

---

## Evening swarm

**Bundled repeatable recipe** (honest limits, nightly checklist, `cursor/nightly-YYYYMMDD` branching, Safety / NOT promises): **`cursor Jarvis ai/plans/JARVIS_RUFLO_EVENING_SWARM.md`**.

“Non-stop” = **you or CI triggers** claude-flow + SendMessage pipelines on **bounded** milestones — not unattended completion of “entire Jarvis” without infra, keys, and billing.

---

## Related docs

- **`cursor Jarvis ai/plans/JARVIS_PERSONAL_AGENT_DECK.md`** — Desk, voice, feeds, CLAUDE.md pointer.
- **`cursor Jarvis ai/plans/JARVIS_PREMIUM_PROGRAM.md`** — Workflow Ruflo, premium gates.
- **`cursor Jarvis ai/plans/JARVIS_RUFLO_EVENING_SWARM.md`** — Nightly operator runbook + explicit non-promises.
- **`command-center/docs/LOCAL_SETUP.md`** — adapters, Obsidian, dev URLs.
