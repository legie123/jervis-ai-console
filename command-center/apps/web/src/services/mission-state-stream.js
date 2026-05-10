import { resolveApiUrl } from "./api-base.js";

/**
 * Boot supervisor FSM wins whenever non-idle; otherwise show operator mission-derived FSM.
 */
export function mergeBootAndMissionFsm(bootFsm, missionFsm) {
  const boot = bootFsm || "STANDBY";
  const mission = missionFsm || "STANDBY";
  if (boot !== "STANDBY") return boot;
  return mission;
}

/**
 * SSE stream with polling fallback (covers stalled EventSource / proxies).
 */
export function createMissionStateStream({ onPayload, pollMs = 3200 } = {}) {
  let es = null;
  let pollTimer = null;
  let stopped = false;

  async function pollOnce() {
    if (stopped) return;
    try {
      const res = await fetch(resolveApiUrl("/api/missions/state"), {
        headers: { accept: "application/json" },
        cache: "no-store"
      });
      const body = await res.json();
      if (body?.ok && typeof onPayload === "function") onPayload(body);
    } catch {
      /* ignore */
    }
  }

  function stop() {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (es) {
      es.close();
      es = null;
    }
  }

  function start() {
    stopped = false;
    pollOnce();
    pollTimer = setInterval(pollOnce, pollMs);

    if (typeof EventSource !== "undefined") {
      try {
        es = new EventSource(resolveApiUrl("/api/missions/stream"));
        es.onmessage = (ev) => {
          try {
            const body = JSON.parse(ev.data);
            if (body?.ok && typeof onPayload === "function") onPayload(body);
          } catch {
            /* ignore */
          }
        };
      } catch {
        es = null;
      }
    }

    return { stop };
  }

  return { start, stop };
}
