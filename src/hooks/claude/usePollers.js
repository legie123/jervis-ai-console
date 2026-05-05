/**
 * usePollers.js — Faza P3 consolidated polling hook
 * Author: Claude (sesiunea 2026-05-05)
 *
 * Replaces the 7+ scattered setInterval(30s) blocks in App() with a single
 * shared cadence + cancellation. Returns a stable `register` function.
 *
 * Usage (when P2 refactor lands):
 *   const pollers = usePollers({ intervalMs: 30000 });
 *   pollers.register("status",   refreshStatus);
 *   pollers.register("alerts",   refreshAlerts);
 *   pollers.register("schedule", refreshSchedule);
 *
 * Each poller fires on register (immediate) and every interval thereafter.
 * Cleanup happens on hook unmount. Per-poller backoff applied on errors.
 *
 * NOT WIRED YET. Scaffolded for P3.
 */

import { useCallback, useEffect, useRef } from "react";

const DEFAULT_INTERVAL = 30000;
const MAX_BACKOFF = 5 * 60 * 1000; // 5 min

export function usePollers({ intervalMs = DEFAULT_INTERVAL, enabled = true } = {}) {
  const pollersRef = useRef(new Map());
  const tickTimerRef = useRef(null);
  const lastTickRef = useRef(0);

  const tick = useCallback(async () => {
    const now = Date.now();
    lastTickRef.current = now;

    const promises = [];
    for (const [name, entry] of pollersRef.current.entries()) {
      if (!entry.enabled) continue;
      const dueAt = entry.lastRunAt + (entry.backoffMs || intervalMs);
      if (now < dueAt) continue;

      promises.push((async () => {
        try {
          await entry.fn();
          entry.lastRunAt = now;
          entry.backoffMs = 0;
          entry.failures = 0;
        } catch (err) {
          entry.lastRunAt = now;
          entry.failures = (entry.failures || 0) + 1;
          entry.backoffMs = Math.min(intervalMs * Math.pow(2, entry.failures), MAX_BACKOFF);
          if (typeof entry.onError === "function") entry.onError(err);
        }
      })());
    }
    await Promise.all(promises);
  }, [intervalMs]);

  useEffect(() => {
    if (!enabled) return undefined;

    // First run after mount
    tick();
    tickTimerRef.current = setInterval(tick, Math.min(intervalMs, 5000));

    return () => {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    };
  }, [enabled, intervalMs, tick]);

  const register = useCallback((name, fn, opts = {}) => {
    pollersRef.current.set(name, {
      fn,
      lastRunAt: 0,
      backoffMs: 0,
      failures: 0,
      enabled: opts.enabled !== false,
      onError: opts.onError
    });
    return () => {
      pollersRef.current.delete(name);
    };
  }, []);

  const setEnabled = useCallback((name, value) => {
    const entry = pollersRef.current.get(name);
    if (entry) entry.enabled = Boolean(value);
  }, []);

  const triggerNow = useCallback((name) => {
    const entry = pollersRef.current.get(name);
    if (entry) {
      entry.lastRunAt = 0;
      entry.backoffMs = 0;
      tick();
    }
  }, [tick]);

  return { register, setEnabled, triggerNow };
}
