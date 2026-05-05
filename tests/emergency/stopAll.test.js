/**
 * stopAll.test.js — Phase 6 emergency stop tests
 * Run: node --test tests/emergency/stopAll.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registerStoppable,
  listStoppables,
  stopAll,
  isStopping,
  history,
  isEmergencyTrigger,
  VOICE_TRIGGERS
} from "../../server/emergency/stopAll.js";
import { _testReset, getState, transition } from "../../server/state/agentState.js";

test("registerStoppable + listStoppables", () => {
  const off = registerStoppable("test_hook_1", () => {});
  assert.ok(listStoppables().includes("test_hook_1"));
  off();
  assert.ok(!listStoppables().includes("test_hook_1"));
});

test("stopAll runs hooks in order and resets FSM", async () => {
  _testReset();
  transition("LISTENING");
  transition("THINKING");

  const calls = [];
  const off1 = registerStoppable("hook_a", ({ reason }) => calls.push(`a:${reason}`));
  const off2 = registerStoppable("hook_b", () => calls.push("b"));

  const result = await stopAll({ reason: "test", source: "unit" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ranHooks, ["hook_a", "hook_b"]);
  assert.deepEqual(calls, ["a:test", "b"]);
  assert.equal(getState().state, "STANDBY");

  off1(); off2();
});

test("hook errors are isolated", async () => {
  const ranAfter = [];
  const off1 = registerStoppable("bad", () => { throw new Error("boom"); });
  const off2 = registerStoppable("good", () => ranAfter.push("good"));

  const r = await stopAll({ reason: "isolation_test" });
  assert.equal(r.ok, true);
  assert.ok(r.errors.some((e) => e.name === "bad"));
  assert.deepEqual(ranAfter, ["good"]);

  off1(); off2();
});

test("re-entrant stop returns already_stopping", async () => {
  let entered = 0;
  const off = registerStoppable("slow", async () => {
    entered += 1;
    // trigger second stop while first in flight
    const inner = stopAll({ reason: "re-entry" });
    // ensure it short-circuits
    const innerResolved = await inner;
    assert.equal(innerResolved.note, "already_stopping");
  });
  await stopAll({ reason: "outer" });
  off();
  assert.equal(entered, 1);
});

test("VOICE_TRIGGERS non-empty", () => {
  assert.ok(VOICE_TRIGGERS.length >= 5);
});

test("isEmergencyTrigger matches EN + RO", () => {
  assert.equal(isEmergencyTrigger("STOP all please"), true);
  assert.equal(isEmergencyTrigger("oprire de urgenta"), true);
  assert.equal(isEmergencyTrigger("hai sa mancam"), false);
  assert.equal(isEmergencyTrigger(""), false);
});

test("history records last events", async () => {
  await stopAll({ reason: "history_check_1" });
  await stopAll({ reason: "history_check_2" });
  const h = history();
  assert.ok(h.length >= 2);
  assert.equal(h[h.length - 1].reason, "history_check_2");
});

test("isStopping is false after settle", async () => {
  await stopAll({ reason: "settle" });
  assert.equal(isStopping(), false);
});
