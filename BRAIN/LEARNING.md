---
project: jarvis-ai
---

# JERVIS — Project Learning Log

Append-only. Newest first. Project-scoped lessons.
Global lessons go to `ai-ide-alliance-brain/LEARNING_MACHINE.md`.

Format:
```
## YYYY-MM-DD [agent] — short title
**Trigger:**
**Lesson:**
**Rule:**
```

---

## 2026-05-07 [claude] — `f8e632c` is a real local-only commit, not a typo

**Trigger:** Status showed `ahead 2, behind 3` on `codex/whatsapp-cloud-run-live`.
**Lesson:** Two of my old commits never got pushed. They contain V3 phase work. Need rebase + push to align.
**Rule:** Before adding new branches, check `git status -sb` and `git log @{u}..` to see local-only commits. Push or stash explicitly.

## 2026-05-07 [claude] — Cursor deleted my `src/components/claude/*` work

**Trigger:** `git status` showed `D src/components/claude/PresenceOrb.jsx` etc.
**Lesson:** Other agents will delete things they consider redundant. Recoverable via `git checkout HEAD -- <files>` since not committed yet, but if pushed → harder.
**Rule:** Commit my work with `[claude]` prefix promptly. If deleted on disk, it's still in git until commit removes it.

## 2026-05-07 [claude] — TRADE AI is already an Obsidian vault

**Trigger:** Found `/TRADE AI/.obsidian/`.
**Lesson:** Don't assume vault location. User may have Obsidian on the same folder as code.
**Rule:** Before any vault-related action, `find ~ -name ".obsidian" -type d -maxdepth 6` first.

## 2026-05-06 [claude] — Workspace folder ≠ git repo location

**Trigger:** Wrote files to `/TRADE AI/Jarvis AI/` (workspace folder), but git repo for "Jarvis AI" is at `/Antigraity/Jarvis AI/`.
**Lesson:** Cowork "selected folder" is a workspace, not necessarily a git root. `Jarvis AI` exists in TWO places with TWO repos.
**Rule:** Always check `git -C <path> remote -v` AND `git -C <path> branch --show-current` before any git op. Memory file `reference_github_repo.md` updated.

## 2026-05-06 [claude] — Bash sandbox can only see workspace mount

**Trigger:** `find /Users/...` returned empty in bash.
**Lesson:** `mcp__workspace__bash` mounts only the selected workspace folder under `/sessions/.../mnt/`. The rest of the Mac is invisible.
**Rule:** For cross-project file ops, use `Read`/`Glob`/`Edit`/`Write` (global access) OR ask user to run on Mac.

## 2026-05-06 [claude] — Heredoc with single-quoted MSG is the safe way to commit multi-line

**Trigger:** zsh parse error on `git commit -m '...(parens)...'`.
**Lesson:** zsh interprets parens, even inside single quotes when followed by certain chars.
**Rule:** Multi-line commit → always `git commit -F - <<'MSG' ... MSG`. Single-quoted delimiter prevents ALL expansion.

---

(future learnings append above this line)
