/** Stub agentState.js — placeholder. Real implementation at /TRADE AI/server/state/agentState.js */
export const STATES = Object.freeze(["STANDBY","LISTENING","THINKING","PLANNING","WAITING_CONFIRMATION","ACTING","SPEAKING","BLOCKED","ERROR","DONE"]);
export const EVENTS = Object.freeze(["wake_phrase","user_text","intent_resolved","needs_confirmation","user_confirmed","user_cancelled","tool_started","tool_completed","tts_started","tts_completed","permission_denied","external_error","reset","init"]);
const TRANSITIONS = { STANDBY:["LISTENING","THINKING","BLOCKED","ERROR"], LISTENING:["THINKING","STANDBY","BLOCKED","ERROR"], THINKING:["PLANNING","ACTING","SPEAKING","STANDBY","BLOCKED","ERROR"], PLANNING:["WAITING_CONFIRMATION","ACTING","STANDBY","BLOCKED","ERROR"], WAITING_CONFIRMATION:["ACTING","STANDBY","BLOCKED","ERROR"], ACTING:["SPEAKING","DONE","BLOCKED","ERROR"], SPEAKING:["STANDBY","LISTENING","BLOCKED","ERROR"], BLOCKED:["STANDBY","ERROR"], ERROR:["STANDBY"], DONE:["STANDBY"] };
let _s = "STANDBY";
const _h = [{ from: null, to: "STANDBY", at: Date.now(), reason: "init", event: "init" }];
export function getState() { return { state: _s, lastTransition: _h[_h.length-1], historyLength: _h.length }; }
export function transition(to, meta = {}) {
  if (!STATES.includes(to)) return { ok: false, error: `unknown state '${to}'` };
  const allowed = TRANSITIONS[_s] || [];
  if (!allowed.includes(to)) return { ok: false, error: `'${_s}'->'${to}' not allowed`, from: _s, allowed };
  const r = { from: _s, to, at: Date.now(), reason: meta.reason || "", event: meta.event || "" };
  _s = to; _h.push(r); if (_h.length > 64) _h.shift();
  return { ok: true, ...r };
}
export function reset() { _s = "STANDBY"; _h.push({ from: null, to: "STANDBY", at: Date.now(), reason: "reset", event: "reset" }); return { ok: true, to: "STANDBY" }; }
export function getHistory() { return [..._h]; }
export function allowedNext(s = _s) { return [...(TRANSITIONS[s] || [])]; }
