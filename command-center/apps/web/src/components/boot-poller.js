import { resolveBootFsmUrls, normalizeFsmPayload } from "./constants.js";

async function fetchBootEntry({ url, port, label }, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      throw {
        code: "http_error",
        status: res.status,
        message: `HTTP ${res.status}`,
        url,
        port,
        label
      };
    }
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
  } catch (error) {
    if (error?.name === "AbortError") {
      throw {
        code: "timeout",
        status: null,
        message: "timeout",
        url,
        port,
        label
      };
    }
    throw {
      code: error?.code || "unavailable",
      status: Number.isFinite(error?.status) ? error.status : null,
      message: error?.message || "unavailable",
      url,
      port,
      label
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * First successful JSON wins (Promise.any).
 */
export async function fetchFsmFromBoots(timeoutMs = 1800, boots = resolveBootFsmUrls()) {
  const tasks = boots.map((entry) => fetchBootEntry(entry, timeoutMs));

  try {
    return await Promise.any(tasks);
  } catch (error) {
    const failures = Array.isArray(error?.errors) ? error.errors : [];
    const statusCodes = failures.map((failure) => failure?.status).filter((status) => Number.isFinite(status));
    const all503 = statusCodes.length > 0 && statusCodes.every((status) => status === 503);
    return { ok: false, offline: true, failures, statusCodes, all503 };
  }
}

/**
 * @param {{ onTick: (result: object) => void, baseMs?: number }} opts
 */
export function createBootPoller(opts) {
  const baseMs = opts.baseMs ?? 2800;
  const maxBackoffMs = opts.maxBackoffMs ?? 28000;
  const breakerThreshold = opts.breakerThreshold ?? 3;
  const breakerCooldownMs = opts.breakerCooldownMs ?? 60000;
  const fetchFsm = opts.fetchFsm ?? fetchFsmFromBoots;
  let timer = null;
  let backoffMs = baseMs;
  let consecutive503 = 0;
  let breakerRetryAtMs = 0;
  let running = false;
  let forceNext = false;
  let stopped = false;

  function schedule(ms = backoffMs) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      tick();
    }, ms);
  }

  async function tick({ force = false } = {}) {
    if (running) {
      if (force) forceNext = true;
      return;
    }

    running = true;
    const forcedRun = force || forceNext;
    forceNext = false;

    try {
      const now = Date.now();
      if (!forcedRun && breakerRetryAtMs > now) {
        backoffMs = Math.max(breakerRetryAtMs - now, baseMs);
        opts.onTick({
          ok: false,
          offline: true,
          reason: "breaker_open",
          cooldownActive: true,
          retryAtMs: breakerRetryAtMs,
          consecutive503,
          backoffMs
        });
        return;
      }

      const result = await fetchFsm();
      if (result.offline) {
        consecutive503 = result.all503 ? consecutive503 + 1 : 0;
        const shouldOpenBreaker = result.all503 && consecutive503 >= breakerThreshold;
        if (shouldOpenBreaker) {
          breakerRetryAtMs = Date.now() + breakerCooldownMs;
          backoffMs = breakerCooldownMs;
        } else {
          breakerRetryAtMs = 0;
          backoffMs = Math.min(Math.round(backoffMs * 1.45), maxBackoffMs);
        }
        opts.onTick({
          ...result,
          breakerOpened: shouldOpenBreaker,
          cooldownActive: breakerRetryAtMs > Date.now(),
          retryAtMs: breakerRetryAtMs || 0,
          consecutive503,
          backoffMs
        });
      } else {
        consecutive503 = 0;
        breakerRetryAtMs = 0;
        backoffMs = baseMs;
        opts.onTick({
          ...result,
          cooldownActive: false,
          retryAtMs: 0,
          consecutive503,
          backoffMs
        });
      }
    } finally {
      running = false;
      schedule(backoffMs);
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
    },
    retryNow() {
      if (stopped) return;
      consecutive503 = 0;
      breakerRetryAtMs = 0;
      backoffMs = baseMs;
      clearTimeout(timer);
      tick({ force: true });
    }
  };
}
