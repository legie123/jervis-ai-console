/**
 * server/ide/index.js — JERVIS V3 Phase 5 IDE Agent Layer
 * Author: claude-coder (sesiunea 2026-05-06, doctor mode)
 *
 * Safe launchers for operator IDEs: Claude Code, Cursor, Antigravity, VS Code, Codex CLI.
 * Plus project_status (git-aware diagnostic).
 *
 * Safety contract:
 *   - resolveProjectPath() rejects anything outside ALLOWED_PROJECT_ROOTS
 *   - execFile with explicit args — no shell injection
 *   - Codex tasks NEVER auto-execute — only clipboard handoff
 *
 * Pure ESM, deps only on node built-ins. No side effects on import.
 *
 * Use:
 *   import { IDE_REGISTRY } from "./server/ide/index.js";
 *   const r = await IDE_REGISTRY.open_in_claude_code("trade ai");
 *   const status = await IDE_REGISTRY.project_status("jervis");
 *
 * HTTP wire: see server/ide/routes.mjs (companion).
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const exec = promisify(execFile);

/** Hard allowlist. Anything else throws. */
export const ALLOWED_PROJECT_ROOTS = Object.freeze([
  "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI",
  "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI",
  "/Users/user/projects"
]);

/** Friendly aliases (lowercase). */
export const PROJECT_ALIASES = Object.freeze({
  "trade ai":         "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI",
  "tradeai":          "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI",
  "jervis":           "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI",
  "jervis console":   "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI",
  "jarvis":           "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI",
  "jarvis ai":        "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI",
  "jarvisai":         "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI",
  "jervis bridge":    "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI",
  "bridge":           "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
});

/**
 * Resolve free-form project name to absolute disk path.
 * Throws on unknown or path outside allowlist.
 */
export function resolveProjectPath(project) {
  const raw = String(project || "").trim();
  if (!raw) throw new Error("empty project name");

  if (path.isAbsolute(raw)) {
    if (!ALLOWED_PROJECT_ROOTS.some((r) => raw === r || raw.startsWith(r + "/"))) {
      throw new Error(`path not in allowed roots: ${raw}`);
    }
    return raw;
  }

  const norm = raw.toLowerCase();
  if (PROJECT_ALIASES[norm]) return PROJECT_ALIASES[norm];

  for (const [alias, target] of Object.entries(PROJECT_ALIASES)) {
    if (norm.includes(alias) || alias.includes(norm)) return target;
  }

  for (const root of ALLOWED_PROJECT_ROOTS) {
    if (root.toLowerCase().includes(norm)) return root;
  }

  throw new Error(`unknown project: ${raw}`);
}

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/* ============================================================
   LAUNCHERS — each returns { ok, ide, method, path, error? }
   ============================================================ */

export async function openInClaudeCode(project) {
  const p = resolveProjectPath(project);
  if (!(await pathExists(p))) return { ok: false, error: `project path missing: ${p}` };
  try {
    await exec("claude", ["code", p]);
    return { ok: true, ide: "claude-code", method: "cli", path: p };
  } catch {
    try {
      await exec("open", ["-a", "Claude", p]);
      return { ok: true, ide: "claude-code", method: "open-app", path: p };
    } catch (err) {
      return { ok: false, ide: "claude-code", error: err.message, path: p };
    }
  }
}

export async function openInCursor(project) {
  const p = resolveProjectPath(project);
  if (!(await pathExists(p))) return { ok: false, error: `project path missing: ${p}` };
  try {
    await exec("cursor", [p]);
    return { ok: true, ide: "cursor", method: "cli", path: p };
  } catch {
    try {
      await exec("open", ["-a", "Cursor", p]);
      return { ok: true, ide: "cursor", method: "open-app", path: p };
    } catch (err) {
      return { ok: false, ide: "cursor", error: err.message, path: p };
    }
  }
}

export async function openInAntigravity(project) {
  const p = resolveProjectPath(project);
  if (!(await pathExists(p))) return { ok: false, error: `project path missing: ${p}` };
  try {
    await exec("open", ["-a", "Antigravity", p]);
    return { ok: true, ide: "antigravity", method: "open-app", path: p };
  } catch (err) {
    return { ok: false, ide: "antigravity", error: err.message, path: p };
  }
}

export async function openInVsCode(project) {
  const p = resolveProjectPath(project);
  if (!(await pathExists(p))) return { ok: false, error: `project path missing: ${p}` };
  try {
    await exec("code", [p]);
    return { ok: true, ide: "vscode", method: "cli", path: p };
  } catch {
    try {
      await exec("open", ["-a", "Visual Studio Code", p]);
      return { ok: true, ide: "vscode", method: "open-app", path: p };
    } catch (err) {
      return { ok: false, ide: "vscode", error: err.message, path: p };
    }
  }
}

/**
 * Codex: clipboard handoff only. Never auto-execute.
 * @param {string} task user task description
 * @param {object} [opts]
 * @param {string} [opts.project] optional context
 */
export async function generateCodexPrompt(task, opts = {}) {
  const text = String(task || "").trim();
  if (!text) return { ok: false, error: "empty task" };

  let context = "";
  if (opts.project) {
    try {
      const p = resolveProjectPath(opts.project);
      context = `[Project context: ${p}]\n\n`;
    } catch (err) {
      return { ok: false, error: `project resolve: ${err.message}` };
    }
  }

  const prompt = `${context}${text}`;

  return new Promise((resolve) => {
    try {
      const child = spawn("pbcopy", []);
      child.on("error", (err) => resolve({ ok: false, ide: "codex", error: err.message, prompt }));
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ ok: true, ide: "codex", method: "clipboard", prompt, promptLength: prompt.length });
        } else {
          resolve({ ok: false, ide: "codex", error: `pbcopy exit ${code}`, prompt });
        }
      });
      child.stdin.end(prompt);
    } catch (err) {
      resolve({ ok: false, ide: "codex", error: err.message, prompt });
    }
  });
}

/**
 * Project status — git branch, dirty, last commit, remote, total commits.
 */
export async function projectStatus(project) {
  const p = resolveProjectPath(project);
  if (!(await pathExists(p))) return { ok: false, error: `project path missing: ${p}` };

  const result = { ok: true, path: p };

  try {
    const r = await exec("git", ["-C", p, "rev-parse", "--abbrev-ref", "HEAD"]);
    result.branch = r.stdout.trim();
  } catch (err) {
    return { ok: false, path: p, error: `not a git repo: ${err.message}` };
  }

  try {
    const r = await exec("git", ["-C", p, "status", "--short"]);
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    result.dirty = lines.length;
    result.dirtyFiles = lines.slice(0, 12);
  } catch { result.dirty = -1; }

  try {
    const r = await exec("git", ["-C", p, "log", "-1", "--format=%h %s"]);
    result.lastCommit = r.stdout.trim();
  } catch { result.lastCommit = ""; }

  try {
    const r = await exec("git", ["-C", p, "remote", "get-url", "origin"]);
    result.remote = r.stdout.trim();
  } catch { result.remote = ""; }

  try {
    const r = await exec("git", ["-C", p, "rev-list", "--count", "HEAD"]);
    result.totalCommits = Number(r.stdout.trim()) || 0;
  } catch { result.totalCommits = 0; }

  return result;
}

/**
 * Detect available IDEs on the host. Best-effort.
 */
export async function detectAvailableIdes() {
  const results = {};
  for (const [cli, key] of [["claude", "claude-code"], ["cursor", "cursor"], ["code", "vscode"]]) {
    try {
      await exec("which", [cli]);
      results[key] = { installed: true, method: "cli", cli };
    } catch {
      results[key] = { installed: false };
    }
  }
  for (const [app, key] of [["Claude", "claude-code"], ["Cursor", "cursor"], ["Antigravity", "antigravity"], ["Visual Studio Code", "vscode"]]) {
    if (results[key] && results[key].installed) continue;
    try {
      const r = await exec("mdfind", [`kMDItemCFBundleName == "${app}"`]);
      if (r.stdout.trim()) {
        results[key] = { installed: true, method: "open-app", app };
      } else {
        results[key] = results[key] || { installed: false };
      }
    } catch {
      results[key] = results[key] || { installed: false };
    }
  }
  results.codex = { installed: true, method: "clipboard" };
  return results;
}

/* ============================================================
   REGISTRY — single source of truth for HTTP routes + tests
   ============================================================ */

export const IDE_REGISTRY = Object.freeze({
  open_in_claude_code: openInClaudeCode,
  open_in_cursor:      openInCursor,
  open_in_antigravity: openInAntigravity,
  open_in_vscode:      openInVsCode,
  open_codex_task:     generateCodexPrompt,
  project_status:      projectStatus
});

export default {
  ALLOWED_PROJECT_ROOTS,
  PROJECT_ALIASES,
  resolveProjectPath,
  openInClaudeCode,
  openInCursor,
  openInAntigravity,
  openInVsCode,
  generateCodexPrompt,
  projectStatus,
  detectAvailableIdes,
  IDE_REGISTRY
};
