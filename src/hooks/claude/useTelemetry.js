/**
 * useTelemetry.js — Faza P4 lightweight in-process tracker
 * Author: Claude (sesiunea 2026-05-05)
 *
 * Drop-in hook. Captures user interactions and surfaces them to
 * `/api/jarvis/audit` via the Express bridge (already exists).
 *
 * Usage:
 *   const track = useTelemetry();
 *   track.event("capability_chip", { title: "Voice" });
 *   track.error("voice_command", err);
 *   track.timing("voice_wake_to_listen", 142);
 *
 * NOT WIRED YET. Scaffolded for P4 — integrate in App() when ready.
 * Reversibil prin neimport.
 */

import { useCallback, useEffect, useRef } from "react";

const ENDPOINT = "/api/jarvis/audit";
const SESSION_KEY = "jarvis.telemetrySessionId";
const MAX_QUEUE = 64;

function readSessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `sess_anon_${Date.now()}`;
  }
}

function readToken() {
  try {
    return localStorage.getItem("jarvis.accessToken") || "";
  } catch {
    return "";
  }
}

export function useTelemetry({ enabled = true } = {}) {
  const queueRef = useRef([]);
  const sessionIdRef = useRef(readSessionId());
  const flushTimerRef = useRef(null);

  const flush = useCallback(async () => {
    if (!enabled || queueRef.current.length === 0) return;
    const batch = queueRef.current.splice(0, MAX_QUEUE);
    try {
      const headers = { "Content-Type": "application/json" };
      const token = readToken();
      if (token) headers["X-Jarvis-Key"] = token;
      await fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          source: "telemetry",
          session_id: sessionIdRef.current,
          batch
        })
      });
    } catch {
      // Silent — telemetry never throws.
    }
  }, [enabled]);

  const enqueue = useCallback((entry) => {
    if (!enabled) return;
    queueRef.current.push({
      ts: new Date().toISOString(),
      session_id: sessionIdRef.current,
      ...entry
    });
    if (queueRef.current.length >= 16) {
      flush();
    } else {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flush, 4000);
    }
  }, [enabled, flush]);

  // Flush on unmount + page hide
  useEffect(() => {
    if (!enabled) return undefined;
    const onHide = () => {
      // navigator.sendBeacon would be better; fall back to fetch.
      flush();
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
      clearTimeout(flushTimerRef.current);
      flush();
    };
  }, [enabled, flush]);

  const event = useCallback((name, props = {}) => {
    enqueue({ kind: "event", name, props });
  }, [enqueue]);

  const error = useCallback((scope, err) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    enqueue({ kind: "error", scope, message, stack });
  }, [enqueue]);

  const timing = useCallback((name, ms, props = {}) => {
    enqueue({ kind: "timing", name, ms, props });
  }, [enqueue]);

  const screen = useCallback((view) => {
    enqueue({ kind: "screen", view });
  }, [enqueue]);

  return { event, error, timing, screen, flush };
}

// Singleton for non-component contexts (error boundary, etc.)
let _singleton = null;
export function getTelemetrySingleton() {
  if (_singleton) return _singleton;
  const queue = [];
  _singleton = {
    event(name, props = {}) {
      queue.push({ kind: "event", name, props, ts: new Date().toISOString() });
    },
    error(scope, err) {
      const message = err instanceof Error ? err.message : String(err);
      queue.push({ kind: "error", scope, message, ts: new Date().toISOString() });
    },
    flush() {
      if (queue.length === 0) return Promise.resolve();
      const batch = queue.splice(0, MAX_QUEUE);
      const headers = { "Content-Type": "application/json" };
      let token = "";
      try { token = localStorage.getItem("jarvis.accessToken") || ""; } catch {}
      if (token) headers["X-Jarvis-Key"] = token;
      return fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({ source: "telemetry-singleton", batch })
      }).catch(() => undefined);
    }
  };
  return _singleton;
}
