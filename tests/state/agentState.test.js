/**
 * agentState.test.js — Phase 1 FSM unit tests
 * Author: Claude (sesiunea 2026-05-05)
 *
 * Run with: node --test tests/state/agentState.test.js
 * (Vite project uses node --test wrapper via scripts/use-supported-node.mjs)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATES,
  TRANSITIONS,
  EVENTS,
  getState,
  transition,
  reset,
  allowedNext,
  getHistory,
  onTransition,
  _testReset
} from "../../server/state/agentState.js";

test("starts in STANDBY", () => {
  _testReset();
  assert.equal(getState().state, "STANDBY");
});

test("STATES contains all 10 expected", () => {
  assert.deepEqual(
    [...STATES].sort(),
    [
      "ACTING", "BLOCKED", "DONE", "ERROR", "LISTENING",
      "PLANNING", "SPEAKING", "STANDBY", "THINKING", "WAITING_CONFIRMATION"
    ]
  );
});

test("EVENTS list non-empty", () => {
  assert.ok(EVENTS.includes("wake_phrase"));
  assert.ok(EVENTS.includes("user_confirmed"));
});

test("STANDBY -> LISTENING is allowed", () => {
  _testReset();
  const r = transition("LISTENING", { reason: "wake", event: "wake_phrase" });
  assert.equal(r.ok, true);
  assert.equal(r.from, "STANDBY");
  assert.equal(r.to, "LISTENING");
  assert.equal(getState().state, "LISTENING");
});

test("STANDBY -> SPEAKING is NOT allowed", () => {
  _testReset();
  const r = transition("SPEAKING");
  assert.equal(r.ok, false);
  assert.match(r.error, /not allowed/);
  assert.equal(getState().state, "STANDBY");
});

test("unknown target state is rejected", () => {
  _testReset();
  const r = transition("FLYING_DRAGON");
  assert.equal(r.ok, false);
  assert.match(r.error, /unknown state/);
});

test("full happy-path flow", () => {
  _testReset();
  assert.equal(transition("LISTENING", { event: "wake_phrase" }).ok, true);
  assert.equal(transition("THINKING", { event: "user_text" }).ok, true);
  assert.equal(transition("PLANNING", { event: "intent_resolved" }).ok, true);
  assert.equal(transition("WAITING_CONFIRMATION", { event: "needs_confirmation" }).ok, true);
  assert.equal(transition("ACTING", { event: "user_confirmed" }).ok, true);
  assert.equal(transition("SPEAKING", { event: "tts_started" }).ok, true);
  assert.equal(transition("STANDBY", { event: "tts_completed" }).ok, true);
});

test("BLOCKED can come from any operational state", () => {
  for (const from of ["STANDBY", "LISTENING", "THINKING", "PLANNING", "WAITING_CONFIRMATION", "ACTING", "SPEAKING"]) {
    _testReset();
    if (from !== "STANDBY") {
      // walk to from
      const path = {
        LISTENING: ["LISTENING"],
        THINKING: ["LISTENING", "THINKING"],
        PLANNING: ["LISTENING", "THINKING", "PLANNING"],
        WAITING_CONFIRMATION: ["LISTENING", "THINKING", "PLANNING", "WAITING_CONFIRMATION"],
        ACTING: ["LISTENING", "THINKING", "PLANNING", "WAITING_CONFIRMATION", "ACTING"],
        SPEAKING: ["LISTENING", "THINKING", "SPEAKING"]
      }[from];
      for (const step of path) {
        const r = transition(step);
        assert.equal(r.ok, true, `path step ${step} from ${getState().state} failed: ${r.error}`);
      }
    }
    const r = transition("BLOCKED", { event: "permission_denied" });
    assert.equal(r.ok, true, `BLOCKED from ${from} failed: ${r.error}`);
  }
});

test("DONE only goes to STANDBY", () => {
  _testReset();
  transition("LISTENING");
  transition("THINKING");
  transition("ACTING");
  const r1 = transition("DONE", { event: "tool_completed" });
  assert.equal(r1.ok, true);
  // DONE -> LISTENING should be invalid
  const r2 = transition("LISTENING");
  assert.equal(r2.ok, false);
  // DONE -> STANDBY ok
  const r3 = transition("STANDBY");
  assert.equal(r3.ok, true);
});

test("reset() always lands in STANDBY", () => {
  _testReset();
  transition("LISTENING");
  transition("THINKING");
  transition("ACTING");
  const r = reset({ reason: "operator_emergency_stop", event: "reset" });
  assert.equal(r.ok, true);
  assert.equal(r.to, "STANDBY");
  assert.equal(getState().state, "STANDBY");
});

test("allowedNext mirrors TRANSITIONS", () => {
  _testReset();
  assert.deepEqual(allowedNext("STANDBY"), TRANSITIONS.STANDBY);
  assert.deepEqual(allowedNext("ERROR"), TRANSITIONS.ERROR);
});

test("history captures transitions", () => {
  _testReset();
  transition("LISTENING", { event: "wake_phrase" });
  transition("THINKING", { event: "user_text" });
  const h = getHistory();
  assert.ok(h.length >= 3); // init + 2 transitions
  const last = h[h.length - 1];
  assert.equal(last.to, "THINKING");
  assert.equal(last.event, "user_text");
});

test("onTransition listener fires", () => {
  _testReset();
  let captured = null;
  const off = onTransition((rec) => { captured = rec; });
  transition("LISTENING", { reason: "test_listener" });
  assert.ok(captured);
  assert.equal(captured.to, "LISTENING");
  off();
  // after unsubscribe, no more capture
  captured = null;
  transition("THINKING");
  assert.equal(captured, null);
});

test("listener exceptions do not break FSM", () => {
  _testReset();
  onTransition(() => { throw new Error("boom"); });
  const r = transition("LISTENING");
  assert.equal(r.ok, true);
  assert.equal(getState().state, "LISTENING");
});
