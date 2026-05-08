/**
 * tests/ide/router.test.js — Phase 5 IDE Layer tests
 * Run: node --test tests/ide/router.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveProjectPath,
  PROJECT_ALIASES,
  ALLOWED_PROJECT_ROOTS,
  IDE_REGISTRY,
  generateCodexPrompt
} from "../../server/ide/index.js";

test("3 allowed roots defined", () => {
  assert.equal(ALLOWED_PROJECT_ROOTS.length, 3);
});

test("PROJECT_ALIASES has expected keys", () => {
  assert.ok(PROJECT_ALIASES["trade ai"]);
  assert.ok(PROJECT_ALIASES["jervis"]);
  assert.ok(PROJECT_ALIASES["jarvis ai"]);
});

test("resolve 'trade ai' -> TRADE AI path", () => {
  assert.equal(
    resolveProjectPath("trade ai"),
    "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
  );
});

test("resolve 'jervis' -> TRADE AI path", () => {
  assert.equal(
    resolveProjectPath("jervis"),
    "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
  );
});

test("resolve 'jarvis ai' -> Jarvis AI path", () => {
  assert.equal(
    resolveProjectPath("jarvis ai"),
    "/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI"
  );
});

test("resolve absolute path inside allowlist passes", () => {
  const p = "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/src/main.jsx";
  assert.equal(resolveProjectPath(p), p);
});

test("resolve absolute path outside allowlist throws", () => {
  assert.throws(
    () => resolveProjectPath("/etc/passwd"),
    /not in allowed roots/
  );
});

test("resolve unknown alias throws", () => {
  assert.throws(
    () => resolveProjectPath("foobar-random-project"),
    /unknown project/
  );
});

test("resolve empty throws", () => {
  assert.throws(() => resolveProjectPath(""), /empty/);
  assert.throws(() => resolveProjectPath(null), /empty/);
});

test("partial match: 'trade' resolves to TRADE AI", () => {
  assert.equal(
    resolveProjectPath("trade"),
    "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI"
  );
});

test("IDE_REGISTRY has 6 actions", () => {
  const actions = Object.keys(IDE_REGISTRY).sort();
  assert.deepEqual(actions, [
    "open_codex_task",
    "open_in_antigravity",
    "open_in_claude_code",
    "open_in_cursor",
    "open_in_vscode",
    "project_status"
  ]);
});

test("each registry entry is a function", () => {
  for (const fn of Object.values(IDE_REGISTRY)) {
    assert.equal(typeof fn, "function");
  }
});

test("generateCodexPrompt with empty task fails gracefully", async () => {
  const r = await generateCodexPrompt("");
  assert.equal(r.ok, false);
  assert.match(r.error, /empty/);
});

test("generateCodexPrompt with unknown project fails", async () => {
  const r = await generateCodexPrompt("hello world", { project: "foobar-random" });
  assert.equal(r.ok, false);
  assert.match(r.error, /project resolve|unknown project/);
});

test("generateCodexPrompt builds prompt with context", async () => {
  // pbcopy may fail in CI/sandbox — we still get { ok: false, prompt }
  const r = await generateCodexPrompt("refactor server/index.js", { project: "jervis" });
  assert.match(r.prompt, /Project context: \/Users\/user/);
  assert.match(r.prompt, /refactor server\/index\.js/);
});
