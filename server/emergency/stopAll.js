/** Stub stopAll.js — placeholder. Full at /TRADE AI/server/emergency/stopAll.js */
import { reset as resetAgentState } from "../state/agentState.js";
const _stoppables = new Map();
const _history = [];
let _stopping = false;
export function registerStoppable(name, fn) {
  if (!name || typeof fn !== "function") return () => {};
  _stoppables.set(name, { fn, registeredAt: Date.now() });
  return () => _stoppables.delete(name);
}
export function listStoppables() { return Array.from(_stoppables.keys()); }
export async function stopAll({ reason = "manual", source = "api" } = {}) {
  if (_stopping) return { ok: true, ranHooks: [], errors: [], at: Date.now(), note: "already_stopping" };
  _stopping = true;
  const at = Date.now();
  const ranHooks = []; const errors = [];
  for (const [name, entry] of _stoppables) {
    try { const r = entry.fn({ reason, source }); if (r && typeof r.then === "function") await r; ranHooks.push(name); }
    catch (err) { errors.push({ name, message: err.message }); }
  }
  try { resetAgentState({ reason: `emergency_stop:${reason}`, event: "reset" }); }
  catch (err) { errors.push({ name: "agent_state", message: err.message }); }
  const record = { at, reason, source, ranHooks: [...ranHooks], errors: [...errors] };
  _history.push(record); if (_history.length > 32) _history.shift();
  _stopping = false;
  return { ok: true, ...record };
}
export function isStopping() { return _stopping; }
export function history() { return [..._history]; }
export const VOICE_TRIGGERS = Object.freeze(["stop all","stop jervis","halt all","emergency stop","cancel mission","oprire de urgenta","anuleaza misiunea","stop tot"]);
export function isEmergencyTrigger(t) {
  const n = String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim();
  return VOICE_TRIGGERS.some(v => n.includes(v));
}
