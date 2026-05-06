/**
 * tests/audit/log.test.js — Phase 7 Audit Log tests
 * Run: node --test tests/audit/log.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  appendEvent,
  query,
  summary,
  configure,
  readToday,
  EVENT_TYPES,
  RESULT_STATES,
  _testReset
} from "../../server/audit/log.js";

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "jervis-audit-"));
  return d;
}

test("EVENT_TYPES + RESULT_STATES non-empty", () => {
  assert.ok(EVENT_TYPES.length >= 10);
  assert.ok(RESULT_STATES.includes("ok"));
  assert.ok(RESULT_STATES.includes("failed"));
});

test("appendEvent throws if eventType missing", () => {
  _testReset({ enabled: false });
  assert.throws(() => appendEvent({}), /eventType required/);
});

test("appendEvent normalizes 10 mandatory fields", () => {
  _testReset({ enabled: false });
  const r = appendEvent({ eventType: "tool", action: "open_in_cursor" });
  for (const f of [
    "ts", "sessionId", "agentId", "eventType", "intent",
    "action", "riskLevel", "payloadHash", "result", "durationMs"
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(r, f), `missing field: ${f}`);
  }
  assert.equal(r.eventType, "tool");
  assert.equal(r.action, "open_in_cursor");
  assert.equal(r.riskLevel, "NONE");
  assert.equal(r.result, "ok");
  assert.equal(r.durationMs, 0);
});

test("payloadHash is a sha256 prefix (16 hex chars)", () => {
  _testReset({ enabled: false });
  const r1 = appendEvent({ eventType: "ide", action: "open_codex_task", payload: { task: "refactor" } });
  const r2 = appendEvent({ eventType: "ide", action: "open_codex_task", payload: { task: "refactor" } });
  const r3 = appendEvent({ eventType: "ide", action: "open_codex_task", payload: { task: "different" } });
  assert.match(r1.payloadHash, /^[0-9a-f]{16}$/);
  assert.equal(r1.payloadHash, r2.payloadHash);
  assert.notEqual(r1.payloadHash, r3.payloadHash);
});

test("optional fields stored: error, rollbackPath, project", () => {
  _testReset({ enabled: false });
  const r = appendEvent({
    eventType: "tool",
    error: "boom",
    rollbackPath: "/tmp/x",
    project: "trade ai"
  });
  assert.equal(r.error, "boom");
  assert.equal(r.rollbackPath, "/tmp/x");
  assert.equal(r.project, "trade ai");
});

test("query filters by eventType", () => {
  _testReset({ enabled: false });
  appendEvent({ eventType: "tool", action: "a" });
  appendEvent({ eventType: "voice", action: "b" });
  appendEvent({ eventType: "tool", action: "c" });
  const tools = query({ eventType: "tool" });
  assert.equal(tools.length, 2);
});

test("query respects limit", () => {
  _testReset({ enabled: false });
  for (let i = 0; i < 30; i += 1) appendEvent({ eventType: "tool", action: `a${i}` });
  const r = query({ limit: 5 });
  assert.equal(r.length, 5);
});

test("query latest-first ordering", () => {
  _testReset({ enabled: false });
  appendEvent({ eventType: "tool", action: "first" });
  appendEvent({ eventType: "tool", action: "second" });
  appendEvent({ eventType: "tool", action: "third" });
  const r = query({});
  assert.equal(r[0].action, "third");
  assert.equal(r[2].action, "first");
});

test("query filters by riskLevel", () => {
  _testReset({ enabled: false });
  appendEvent({ eventType: "tool", riskLevel: "LOW" });
  appendEvent({ eventType: "tool", riskLevel: "CRITICAL" });
  appendEvent({ eventType: "tool", riskLevel: "CRITICAL" });
  const crit = query({ riskLevel: "CRITICAL" });
  assert.equal(crit.length, 2);
});

test("summary counts correctly", () => {
  _testReset({ enabled: false });
  appendEvent({ eventType: "tool", riskLevel: "LOW", result: "ok" });
  appendEvent({ eventType: "voice", riskLevel: "MEDIUM", result: "ok" });
  appendEvent({ eventType: "tool", riskLevel: "CRITICAL", result: "failed" });
  const s = summary();
  assert.equal(s.total, 3);
  assert.equal(s.byType.tool, 2);
  assert.equal(s.byType.voice, 1);
  assert.equal(s.byRiskLevel.CRITICAL, 1);
  assert.equal(s.failures, 1);
  assert.equal(s.criticalActions, 1);
});

test("persistence: writes JSONL file when enabled", async () => {
  const dir = tmpDir();
  _testReset({ logDir: dir, enabled: true });
  appendEvent({ eventType: "tool", action: "persistent" });
  // give it a tick to flush
  await new Promise((r) => setTimeout(r, 80));
  const file = path.join(dir, `audit-${new Date().toISOString().slice(0,10)}.jsonl`);
  const exists = fs.existsSync(file);
  assert.equal(exists, true);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(last.action, "persistent");
});

test("readToday returns events from disk newest-first", async () => {
  const dir = tmpDir();
  // wait for any pending persist from prior test to settle into ITS dir
  await new Promise((r) => setTimeout(r, 250));
  _testReset({ logDir: dir, enabled: true });
  appendEvent({ eventType: "tool", action: "alpha-readToday" });
  await new Promise((r) => setTimeout(r, 60));
  appendEvent({ eventType: "tool", action: "beta-readToday" });
  await new Promise((r) => setTimeout(r, 250));
  const events = await readToday(10);
  // filter for our two known entries (robust to leakage)
  const ours = events.filter((e) => /readToday/.test(e.action || ""));
  assert.ok(ours.length >= 2, `expected at least 2 of our events, got ${ours.length}`);
  assert.equal(ours[0].action, "beta-readToday");
});
