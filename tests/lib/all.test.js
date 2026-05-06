/**
 * tests/lib/all.test.js — Phase 4 module extract tests
 * Run: node --test tests/lib/all.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createLogger, COLORS } from "../../server/lib/logger.js";
import { startPoller, stopAllPollers, listPollers } from "../../server/lib/sensors.js";
import { createTransporter } from "../../server/lib/transporter.js";
import { createCaptainsLog } from "../../server/lib/database.js";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "jervis-lib-")); }

/* ==================== logger ==================== */
test("logger.log returns record + ring snapshot", () => {
  const { log, snapshot } = createLogger({ ringLimit: 5 });
  const r = log("info", "Test", "hello");
  assert.equal(r.level, "info");
  assert.equal(r.mod, "Test");
  assert.equal(r.msg, "hello");
  assert.equal(snapshot()[0].msg, "hello");
});

test("logger ring caps at ringLimit", () => {
  const { log, snapshot } = createLogger({ ringLimit: 3 });
  for (let i = 0; i < 10; i += 1) log("info", "t", `m${i}`);
  assert.equal(snapshot().length, 3);
});

test("logger fires onRecord callback", () => {
  let captured = null;
  const { log } = createLogger({ onRecord: (r) => { captured = r; } });
  log("ok", "T", "ping");
  assert.equal(captured?.msg, "ping");
});

test("COLORS exposed", () => {
  assert.ok(typeof COLORS.orange === "string");
  assert.ok(typeof COLORS.reset === "string");
});

/* ==================== sensors ==================== */
test("startPoller fires periodically + stops cleanly", async () => {
  const calls = [];
  startPoller({ name: "test-poll", intervalMs: 30, fn: () => { calls.push(Date.now()); return calls.length; } });
  await new Promise((r) => setTimeout(r, 110));
  stopAllPollers();
  assert.ok(calls.length >= 2, `expected >=2 calls, got ${calls.length}`);
  assert.equal(listPollers().length, 0);
});

test("listPollers reflects active pollers", () => {
  startPoller({ name: "a", intervalMs: 9999, fn: () => "a" });
  startPoller({ name: "b", intervalMs: 9999, fn: () => "b" });
  assert.equal(listPollers().length, 2);
  stopAllPollers();
});

test("poller swallows errors via try/catch in fn", async () => {
  const errs = [];
  startPoller({
    name: "boom",
    intervalMs: 20,
    fn: async () => { throw new Error("boom"); },
    log: (lvl, mod, msg) => { if (lvl === "err") errs.push(msg); }
  });
  await new Promise((r) => setTimeout(r, 60));
  stopAllPollers();
  assert.ok(errs.length >= 1);
});

/* ==================== transporter ==================== */
test("transporter write+read roundtrip", async () => {
  const dir = tmp();
  const t = createTransporter(dir);
  await t.write({ from: "claude", note: "hello codex" });
  const r = await t.read();
  assert.equal(r.payload.from, "claude");
  assert.equal(r.payload.note, "hello codex");
});

test("transporter read returns null when empty", async () => {
  const dir = tmp();
  const t = createTransporter(dir);
  assert.equal(await t.read(), null);
});

test("transporter clear removes file", async () => {
  const dir = tmp();
  const t = createTransporter(dir);
  await t.write({ x: 1 });
  await t.clear();
  assert.equal(await t.read(), null);
});

/* ==================== database (Captain's Log) ==================== */
test("captains log creates file with frontmatter on first write", async () => {
  const vault = tmp();
  const cl = createCaptainsLog({ vaultRoot: vault, stardateFn: () => "79126.2" });
  const file = await cl.write({ title: "Boot", body: "All nominal." });
  assert.ok(fs.existsSync(file));
  const content = fs.readFileSync(file, "utf8");
  assert.match(content, /^---\n/);
  assert.match(content, /stardate: 79126\.2/);
  assert.match(content, /## .+ · Boot/);
});

test("captains log appends without re-writing frontmatter", async () => {
  const vault = tmp();
  const cl = createCaptainsLog({ vaultRoot: vault });
  const f1 = await cl.write({ title: "First", body: "a" });
  const f2 = await cl.write({ title: "Second", body: "b" });
  assert.equal(f1, f2);
  const content = fs.readFileSync(f1, "utf8");
  // frontmatter only once
  assert.equal((content.match(/^---/gm) || []).length, 2); // open + close
  assert.match(content, /Second/);
});

test("captains log throws when vault missing", async () => {
  const cl = createCaptainsLog({ vaultRoot: "/nonexistent/path/xyz123" });
  await assert.rejects(() => cl.write({ title: "T", body: "B" }), /vault not found/);
});
