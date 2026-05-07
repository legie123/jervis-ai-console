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

/**
 * Runtime override: set `globalThis.__JARVIS_BOOT_FSM_URLS__` to an array of
 * `{ url, port?, label? }` before `app.js` loads (see index.html example).
 */
function normalizeBootEntry(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const url = typeof raw.url === "string" ? raw.url : null;
  if (!url) return null;
  let port = raw.port;
  if (typeof port === "string") port = parseInt(port, 10);
  if (!Number.isFinite(port)) port = index === 0 ? 7777 : 7778;
  const label = typeof raw.label === "string" ? raw.label : `Boot ${index + 1}`;
  return { url, port, label };
}

export function resolveBootFsmUrls() {
  const raw =
    typeof globalThis !== "undefined" ? globalThis.__JARVIS_BOOT_FSM_URLS__ : undefined;
  if (!Array.isArray(raw) || raw.length === 0) return BOOT_FSM_URLS;
  const mapped = raw.map(normalizeBootEntry).filter(Boolean);
  return mapped.length ? Object.freeze(mapped) : BOOT_FSM_URLS;
}

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
