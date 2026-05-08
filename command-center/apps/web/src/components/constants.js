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
 * Runtime override priority (highest first):
 *   1. localStorage `jervis.bootFsmUrls` (operator-edited via Settings dialog)
 *   2. `globalThis.__JARVIS_BOOT_FSM_URLS__` (HTML inject before app.js loads)
 *   3. `BOOT_FSM_URLS` defaults
 * Each entry: `{ url, port?, label? }`.
 */
export const BOOT_FSM_STORAGE_KEY = "jervis.bootFsmUrls";

function normalizeBootEntry(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const url = typeof raw.url === "string" ? raw.url.trim() : null;
  if (!url) return null;
  let port = raw.port;
  if (typeof port === "string") port = parseInt(port, 10);
  if (!Number.isFinite(port)) {
    const parsed = parseInt(new URL(url, "http://x").port || "0", 10);
    port = Number.isFinite(parsed) && parsed > 0 ? parsed : index === 0 ? 7777 : 7778;
  }
  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : `Boot ${index + 1}`;
  return { url, port, label };
}

function safeStorage() {
  try {
    if (typeof globalThis === "undefined") return null;
    const s = globalThis.localStorage;
    if (!s || typeof s.getItem !== "function") return null;
    return s;
  } catch {
    return null;
  }
}

export function loadStoredBootFsmUrls(storage = safeStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BOOT_FSM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const mapped = parsed.map(normalizeBootEntry).filter(Boolean);
    return mapped.length ? mapped : null;
  } catch {
    return null;
  }
}

export function saveStoredBootFsmUrls(entries, storage = safeStorage()) {
  if (!storage) return false;
  try {
    if (!Array.isArray(entries) || entries.length === 0) {
      storage.removeItem(BOOT_FSM_STORAGE_KEY);
      return true;
    }
    const mapped = entries.map(normalizeBootEntry).filter(Boolean);
    if (!mapped.length) {
      storage.removeItem(BOOT_FSM_STORAGE_KEY);
      return true;
    }
    storage.setItem(BOOT_FSM_STORAGE_KEY, JSON.stringify(mapped));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredBootFsmUrls(storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.removeItem(BOOT_FSM_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function resolveBootFsmUrls(storage = safeStorage()) {
  const stored = loadStoredBootFsmUrls(storage);
  if (stored && stored.length) return Object.freeze(stored);
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
