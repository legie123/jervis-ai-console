/** Shared labels for JERVIS Command Center UI (v0). */

export const FSM_STATES = Object.freeze([
  "STANDBY",
  "LISTENING",
  "THINKING",
  "PLANNING",
  "WAITING_CONFIRMATION",
  "ACTING",
  "SPEAKING",
  "BLOCKED",
  "ERROR",
  "DONE"
]);

export const RISK_LEVELS = Object.freeze(["LOW", "MED", "HIGH", "CRIT"]);

/** Boot supervisors — spec: poll :7777 (Codex) + :7778 (Claude V3). */
export const BOOT_FSM_URLS = Object.freeze([
  { url: "http://127.0.0.1:7777/fsm", port: 7777, label: "Codex" },
  { url: "http://127.0.0.1:7778/fsm", port: 7778, label: "Claude V3" }
]);

export function normalizeFsmPayload(json) {
  if (!json || typeof json !== "object") return null;
  const state =
    json.state ??
    json.fsm?.state ??
    json.data?.state ??
    json.current ??
    json.name ??
    null;
  if (typeof state !== "string") return null;
  return state.toUpperCase();
}

export function riskToLedIndex(risk) {
  const r = String(risk || "LOW").toUpperCase();
  if (r.includes("CRIT") || r === "CRITICAL") return 3;
  if (r.includes("HIGH") || r === "DANGEROUS") return 2;
  if (r.includes("MED") || r === "MODERATE") return 1;
  return 0;
}
