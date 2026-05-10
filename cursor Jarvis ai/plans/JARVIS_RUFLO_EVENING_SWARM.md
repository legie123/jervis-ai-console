# JARVIS — Ruflo evening swarm (repeatable invocation)

**Purpose:** Describe what **actually** scales when operators ask Ruflo to "take over evenings" or run "non-stop." Cursor / Claude-style hosts **cannot** spawn unlimited billed agents or guarantee unattended 24/7 completion without **your** infrastructure (runners), **API keys**, and **billing**. **Non-stop** here means a **documented, repeatable swarm recipe** that **you** (or **CI**) **trigger**—not a daemon that magically finishes "the entire Jarvis AI project" overnight.

**Canonical companions:** Obsidian continuity and resume order → [`JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md`](./JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md) · repo truth → **`BRAIN/HANDOFF_CURRENT.md`**.

---

## What *can* be automated (Hermes-style split → swarm)

**Hermes-style task split:** one **explicit** backlog item per night ("fix failing tests", "one dashboard panel", "doc cross-links only"), with acceptance criteria written **before** you spawn agents.

**Ruflo / claude-flow stack:** Prefer **`npx @claude-flow/cli@latest`** (or a **pinned, audited** version—see **`CLAUDE.md`** in Cursor / Claude Code user config).

**Named agents + SendMessage-first pipeline:** Spawn **named** agents; each prompt says **who** receives the next handoff (`SendMessage`) and **what artifact** ships. Do **not** rely on "someone will notice" git churn.

**Minimal paste pattern** (adapt prompts to your backlog; verbatim structure from user `CLAUDE.md` contract):

```javascript
// ALL agents in ONE message, each knows WHO to message next
Agent({ prompt: "Research the codebase. SendMessage findings to 'architect'.",
  subagent_type: "researcher", name: "researcher", run_in_background: true })
Agent({ prompt: "Wait for 'researcher'. Design solution. SendMessage to 'coder'.",
  subagent_type: "system-architect", name: "architect", run_in_background: true })
Agent({ prompt: "Wait for 'architect'. Implement it. SendMessage to 'tester'.",
  subagent_type: "coder", name: "coder", run_in_background: true })
Agent({ prompt: "Wait for 'coder'. Write tests. SendMessage results to 'reviewer'.",
  subagent_type: "tester", name: "tester", run_in_background: true })
Agent({ prompt: "Wait for 'tester'. Review code quality and security.",
  subagent_type: "reviewer", name: "reviewer", run_in_background: true })

SendMessage({ to: "researcher", summary: "Start", message: "[one milestone + STOP condition]" })
```

**Optional CLI warm-up** (topology only—still needs a host session to own the run):

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

**Audit visibility:** Tag agent work so **`/api/ruflo/feed`** stays warm (`ruflo` / `swarm` / `claude_flow` in audit `source` or `action`)—details in **`JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md`**.

---

## Evening checklist (operator)

Do these **in order** every night:

1. **`git fetch origin`** and **`git checkout main`** then **`git pull`** (stay aligned with **`origin/main`**).
2. **`BRAIN/HANDOFF_CURRENT.md`** — what the last session actually left (**STOP** if this contradicts Obsidian intent).
3. **Obsidian `Jarvis/NEXT.md`** — tonight's bounded objective in **one milestone** ("fix X tests", "ship Y panel").
4. **Branch:** **`cursor/nightly-YYYYMMDD`** (replace `YYYYMMDD` with local date—**never** work directly on `main` for night runs unless you deliberately chose that risk).
5. **Spawn swarm** with the **STOP condition** baked into every agent prompt ("stop when tests green + handoff appended" — not "finish Jarvis").
6. **Verification:** typically **`npm test`** (from **`command-center/`** as documented elsewhere); **`npm run build`** if UI/operator touched.
7. **`BRAIN/HANDOFF_CURRENT.md` + Obsidian:** append factual outcomes; **no overstated milestones**.

---

## Safety (hard rules)

| Rule | Why |
|------|-----|
| **No `git push --force`** (and no rewriting shared history) | Prevents wiping others' anchors; recoverable merges only. |
| **No secret commits** | Never commit `.env`, tokens, or credentials—**ever**. |
| **One branch per night** | Prefer **`cursor/nightly-YYYYMMDD`**; open a normal PR into `main`; **human** merges. |
| **One milestone scope** | Reduces drift, review load, and "half-done" merges. |

---

## Explicit NOT promises (honest gates)

These **require humans, billing, keys, multi-session cadence, or org process** — **not** a single "activate all agents" invocation:

| Not automatic | Notes |
|----------------|-------|
| **"100% premium program" overnight** | Phases/signoffs span teams and runtime toggles beyond one session. |
| **React incremental T-005** | Typical multi-PR refactor; merge + QA gates stay human-paced. |
| **Org-wide repo convergence (e.g., TRADE↔Jarvis)** | Needs ownership and merge politics outside nightly automation docs. |

Treat any run as **successful** only if **tests/build** agreed in scope **and** **`HANDOFF_CURRENT`** matches reality—not if marketing checklists say "done."

---

## Related docs

- **`cursor Jarvis ai/plans/JARVIS_RUFLO_OBSIDIAN_CONTINUITY.md`** — Resume order, audit tags, Obsidian trio.
- **`cursor Jarvis ai/plans/JARVIS_PREMIUM_PROGRAM.md`** — Program phases and gates.
- **`CLAUDE.md`** (user-level) — SendMessage-first + swarm CLI reference **if** absent from repo.
