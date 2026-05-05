/**
 * agentState.js — JERVIS Native Agent V3 Phase 1
 * Author: Claude (sesiunea 2026-05-05, doctor mode)
 *
 * 10-state agent state machine with explicit transitions.
 * Pure ESM module. Zero dependencies. No side-effects on import.
 *
 * Flow contract:
 *   STANDBY -> LISTENING -> THINKING -> PLANNING -> WAITING_CONFIRMATION
 *   -> ACTING -> SPEAKING -> STANDBY
 *   Side branches: BLOCKED, ERROR, DONE.
 *
 * Use:
 *   import { transition, getState, allowedNext, reset, STATES, EVENTS }
 *     from "./state/agentState.js";
 *   transition("LISTENING", { reason: "wake_phrase", source: "voice" });
 *
 * NOT YET WIRED into server/index.js or main.jsx. Codex will integrate.
 */

export const STATES = Object.freeze([
  "STANDBY",                  // idle, awaiting wake or click
  "LISTENING",                // mic active, capturing user input
  "THINKING",                 // routing intent, deciding action
  "PLANNING",                 // building draft for risky actions
  "WAITING_CONFIRMATION",     // gated, awaiting operator approve/cancel
  "ACTING",                   // executing tool / native bridge / scheduler
  "SPEAKING",                 // TTS in progress (browser or ElevenLabs)
  "BLOCKED",                  // permission/auth/quota issue, recoverable
  "ERROR",                    // hard failure, requires reset
  "DONE"                      // terminal state for a single mission
]);

export const TRANSITIONS = Object.freeze({
  STANDBY:              ["LISTENING", "THINKING", "BLOCKED", "ERROR"],
  LISTENING:            ["THINKING", "STANDBY", "BLOCKED", "ERROR"],
  THINKING:             ["PLANNING", "ACTING", "SPEAKING", "STANDBY", "BLOCKED", "ERROR"],
  PLANNING:             ["WAITING_CONFIRMATION", "ACTING", "STANDBY", "BLOCKED", "ERROR"],
  WAITING_CONFIRMATION: ["ACTING", "STANDBY", "BLOCKED", "ERROR"],
  ACTING:               ["SPEAKING", "DONE", "BLOCKED", "ERROR"],
  SPEAKING:             ["STANDBY", "LISTENING", "BLOCKED", "ERROR"],
  BLOCKED:              ["STANDBY", "ERROR"],
  ERROR:                ["STANDBY"],
  DONE:                 ["STANDBY"]
});

/** Semantic events that can drive transitions. Free-form; recorded in audit. */
export const EVENTS = Object.freeze([
  "wake_phrase",
  "user_text",
  "intent_resolved",
  "needs_confirmation",
  "user_confirmed",
  "user_cancelled",
  "tool_started",
  "tool_completed",
  "tts_started",
  "tts_completed",
  "permission_denied",
  "external_error",
  "reset",
  "init"
]);

const HISTORY_LIMIT = 64;

let _state = "STANDBY";
let _lastTransition = {
  from: null,
  to: "STANDBY",
  at: Date.now(),
  reason: "init",
  event: "init",
  meta: {}
};
const _history = [_lastTransition];
const _listeners = new Set();

/**
 * Get the current state plus the last transition record.
 */
export function getState() {
  return {
    state: _state,
    lastTransition: { ..._lastTransition },
    historyLength: _history.length
  };
}

/**
 * Inspect the state graph for a given state without mutating anything.
 */
export function allowedNext(from = _state) {
  return TRANSITIONS[from] ? [...TRANSITIONS[from]] : [];
}

/**
 * Attempt a transition. Returns { ok: true, from, to, at } on success,
 * { ok: false, error, allowed } if the transition is invalid.
 *
 * @param {string} to                target state
 * @param {object} [meta]            { reason, event, source, intent, riskTier, ... }
 */
export function transition(to, meta = {}) {
  if (!STATES.includes(to)) {
    return { ok: false, error: `unknown state '${to}'`, knownStates: [...STATES] };
  }
  const allowed = TRANSITIONS[_state] || [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `transition '${_state}' -> '${to}' is not allowed`,
      from: _state,
      allowed
    };
  }
  const from = _state;
  const record = {
    from,
    to,
    at: Date.now(),
    reason: typeof meta.reason === "string" ? meta.reason : "",
    event: typeof meta.event === "string" ? meta.event : "",
    meta: meta && typeof meta === "object" ? { ...meta } : {}
  };
  _state = to;
  _lastTransition = record;
  _history.push(record);
  if (_history.length > HISTORY_LIMIT) _history.splice(0, _history.length - HISTORY_LIMIT);
  for (const fn of _listeners) {
    try { fn(record); } catch { /* listener errors never affect FSM */ }
  }
  return { ok: true, from, to, at: record.at };
}

/**
 * Force the FSM back to STANDBY. Use sparingly — for emergencyStop()
 * and operator-level resets.
 */
export function reset(meta = { reason: "manual_reset", event: "reset" }) {
  const from = _state;
  _state = "STANDBY";
  _lastTransition = {
    from,
    to: "STANDBY",
    at: Date.now(),
    reason: meta.reason || "reset",
    event: meta.event || "reset",
    meta: { ...meta }
  };
  _history.push(_lastTransition);
  if (_history.length > HISTORY_LIMIT) _history.splice(0, _history.length - HISTORY_LIMIT);
  for (const fn of _listeners) {
    try { fn(_lastTransition); } catch {}
  }
  return { ok: true, from, to: "STANDBY", at: _lastTransition.at };
}

/**
 * Subscribe to state transitions. Returns an unsubscribe function.
 */
export function onTransition(fn) {
  if (typeof fn !== "function") return () => {};
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/**
 * Read the recent transition history (oldest -> newest).
 */
export function getHistory() {
  return _history.map((r) => ({ ...r, meta: { ...r.meta } }));
}

/**
 * For tests: hard reset the in-memory FSM (state, history, listeners).
 */
export function _testReset() {
  _state = "STANDBY";
  _lastTransition = {
    from: null,
    to: "STANDBY",
    at: Date.now(),
    reason: "test_reset",
    event: "reset",
    meta: {}
  };
  _history.length = 0;
  _history.push(_lastTransition);
  _listeners.clear();
}

export default {
  STATES,
  TRANSITIONS,
  EVENTS,
  getState,
  transition,
  reset,
  onTransition,
  allowedNext,
  getHistory,
  _testReset
};
