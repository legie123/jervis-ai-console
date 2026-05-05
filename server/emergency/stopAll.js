/**
 * stopAll.js — JERVIS Native Agent V3 Phase 6
 * Author: Claude (sesiunea 2026-05-05, doctor mode)
 *
 * Real emergency-stop subsystem (replaces the icon-only <CircleStop />).
 * Provides:
 *   - registerStoppable(name, fn)    — subscribe a cleanup hook
 *   - stopAll({ reason, source })    — runs all hooks, transitions FSM to STANDBY
 *   - isStopping()                   — guard re-entry
 *   - history()                      — last 32 stop events
 *
 * Designed to integrate with:
 *   - server/state/agentState.js (calls reset())
 *   - server/index.js — runtime registers WhatsApp send queue, ElevenLabs TTS,
 *     Realtime WebRTC peer, scheduler ticks, browser-tab automation as stoppables.
 *   - frontend Cmd+. shortcut (or "Hey JERVIS, stop all").
 *
 * Pure ESM, zero deps.
 */

import { reset as resetAgentState } from "../state/agentState.js";

const _stoppables = new Map(); // name -> { fn, registeredAt }
const _history = [];
let _stopping = false;

const HISTORY_LIMIT = 32;

/**
 * Register a stoppable hook. Called during stopAll() in registration order.
 * The hook receives { reason, source } and may return a Promise.
 * Errors are isolated; one failing hook does NOT stop the rest.
 *
 * @returns {Function} unregister
 */
export function registerStoppable(name, fn) {
  if (!name || typeof fn !== "function") return () => {};
  _stoppables.set(name, { fn, registeredAt: Date.now() });
  return () => _stoppables.delete(name);
}

/**
 * Returns the names of currently registered stoppables (for diagnostics).
 */
export function listStoppables() {
  return Array.from(_stoppables.keys());
}

/**
 * Halt every registered subsystem and reset the agent state machine.
 * Idempotent: re-entrant calls during an in-flight stop are no-ops.
 *
 * @param {object} [opts]
 * @param {string} [opts.reason]  free-form (e.g. "operator_manual", "voice_command")
 * @param {string} [opts.source]  who triggered (e.g. "ui_keybind", "voice", "api")
 * @returns {{ ok: boolean, ranHooks: string[], errors: object[], at: number }}
 */
export async function stopAll({ reason = "manual", source = "api" } = {}) {
  if (_stopping) {
    return { ok: true, ranHooks: [], errors: [], at: Date.now(), note: "already_stopping" };
  }
  _stopping = true;
  const at = Date.now();
  const ranHooks = [];
  const errors = [];

  for (const [name, entry] of _stoppables) {
    try {
      const result = entry.fn({ reason, source });
      if (result && typeof result.then === "function") {
        await result;
      }
      ranHooks.push(name);
    } catch (err) {
      errors.push({ name, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // Always reset the agent state at the end, regardless of hook errors.
  try {
    resetAgentState({ reason: `emergency_stop:${reason}`, event: "reset" });
  } catch (err) {
    errors.push({ name: "agent_state", message: err instanceof Error ? err.message : String(err) });
  }

  const record = {
    at,
    reason,
    source,
    ranHooks: [...ranHooks],
    errors: [...errors]
  };
  _history.push(record);
  if (_history.length > HISTORY_LIMIT) _history.splice(0, _history.length - HISTORY_LIMIT);

  _stopping = false;
  return { ok: true, ...record };
}

/**
 * Whether a stop is currently in progress (race guard).
 */
export function isStopping() {
  return _stopping;
}

/**
 * Recent stop events (oldest -> newest).
 */
export function history() {
  return _history.map((r) => ({ ...r }));
}

/**
 * Voice phrases that should trigger an emergency stop.
 * Hand off detection to the voice layer; this list is the single source of truth.
 */
export const VOICE_TRIGGERS = Object.freeze([
  "stop all",
  "stop jervis",
  "stop everything",
  "halt all",
  "halt now",
  "emergency stop",
  "cancel mission",
  "abort mission",
  "stop tot",
  "oprire de urgenta",
  "anuleaza misiunea"
]);

/**
 * Lightweight detector for use in the voice path. Returns true on match.
 */
export function isEmergencyTrigger(transcript) {
  const norm = String(transcript || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return false;
  return VOICE_TRIGGERS.some((t) => norm.includes(t));
}

export default {
  registerStoppable,
  listStoppables,
  stopAll,
  isStopping,
  history,
  VOICE_TRIGGERS,
  isEmergencyTrigger
};
