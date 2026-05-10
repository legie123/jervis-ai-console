/** Browser-only scratch + priorities — namespaced jarvis.personal.* */

export const JARVIS_PERSONAL_KEYS = Object.freeze({
  scratch: "jarvis.personal.scratch",
  priorities: "jarvis.personal.priorities"
});

export function loadScratch(storage = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null) {
  if (!storage) return "";
  try {
    return String(storage.getItem(JARVIS_PERSONAL_KEYS.scratch) || "");
  } catch {
    return "";
  }
}

export function saveScratch(text, storage = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null) {
  if (!storage) return false;
  try {
    storage.setItem(JARVIS_PERSONAL_KEYS.scratch, String(text ?? ""));
    return true;
  } catch {
    return false;
  }
}

export function loadPriorities(storage = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(JARVIS_PERSONAL_KEYS.priorities);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePriorities(rows, storage = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null) {
  if (!storage) return false;
  try {
    storage.setItem(JARVIS_PERSONAL_KEYS.priorities, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}
