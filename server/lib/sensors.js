/**
 * server/lib/sensors.js — Phase 4 (extract pollers from jervis-boot.mjs)
 * Author: claude-coder
 * Stub pollers; hookable for real bridge calls.
 */

const _intervals = new Set();

export function startPoller({ name, intervalMs, fn, log }) {
  const id = setInterval(async () => {
    try {
      const r = await fn();
      if (log) log("info", "Sensors", `${name} sweep — ${r ?? "ok"}`);
    } catch (err) {
      if (log) log("err", "Sensors", `${name} failed: ${err.message}`);
    }
  }, intervalMs);
  _intervals.add({ name, id, intervalMs });
  return id;
}

export function stopAllPollers() {
  for (const entry of _intervals) {
    try { clearInterval(entry.id); } catch {}
  }
  _intervals.clear();
}

export function listPollers() {
  return Array.from(_intervals).map(({ name, intervalMs }) => ({ name, intervalMs }));
}

export default { startPoller, stopAllPollers, listPollers };
