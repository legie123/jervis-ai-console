import { BOOT_FSM_URLS, normalizeFsmPayload } from "./constants.js";

/**
 * First successful JSON wins (Promise.any).
 */
export async function fetchFsmFromBoots(timeoutMs = 1800) {
  const tasks = BOOT_FSM_URLS.map(({ url, port, label }) =>
    (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const state = normalizeFsmPayload(json);
        return {
          ok: true,
          offline: false,
          raw: json,
          state: state || "STANDBY",
          port,
          label
        };
      } catch {
        clearTimeout(timer);
        throw new Error("unavailable");
      }
    })()
  );

  try {
    return await Promise.any(tasks);
  } catch {
    return { ok: false, offline: true };
  }
}

/**
 * @param {{ onTick: (result: object) => void, baseMs?: number }} opts
 */
export function createBootPoller(opts) {
  const baseMs = opts.baseMs ?? 2800;
  let timer = null;
  let backoffMs = baseMs;
  let stopped = false;

  async function tick() {
    const result = await fetchFsmFromBoots();
    if (result.offline) {
      backoffMs = Math.min(Math.round(backoffMs * 1.45), 28000);
      opts.onTick({ ...result, backoffMs });
    } else {
      backoffMs = baseMs;
      opts.onTick({ ...result, backoffMs });
    }
    if (!stopped) {
      clearTimeout(timer);
      timer = setTimeout(tick, backoffMs);
    }
  }

  return {
    start() {
      stopped = false;
      tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    }
  };
}
