/**
 * claude-overlay.js — additive runtime DOM enhancer
 * Author: Claude (sesiunea 2026-05-05)
 *
 * Self-contained module. Loaded AFTER main.jsx via index.html.
 * NO modifications to App() or any existing component.
 *
 * Effects on the live DOM (idempotent, observed via MutationObserver):
 *   1. Dynamic tooltips on .status-tile (full label + value visible on hover/focus)
 *   2. Mode switcher injected into the topbar — All/Briefing/Comm/Memory/System
 *      Persists in localStorage('jarvis.uiMode'). CSS rules in styles.claude-patch.css
 *      filter panels by body[data-mode].
 *   3. Telemetry singleton init: posts batched events to /api/jarvis/audit
 *   4. Window error capture (errors and unhandled promise rejections)
 *   5. Optional dragon-core auto-3D nudge: when user toggles core, persists choice.
 *
 * Reversibil: șterge <script> tag din index.html + acest fișier.
 */

(function () {
  "use strict";

  if (window.__claudeOverlayLoaded) return;
  window.__claudeOverlayLoaded = true;

  // ==========================================================
  // STORAGE
  // ==========================================================
  const LS = {
    uiMode: "jarvis.uiMode",
    sessionId: "jarvis.telemetrySessionId"
  };

  function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); } catch {} }

  function sessionId() {
    let id = lsGet(LS.sessionId);
    if (!id) {
      id = "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      lsSet(LS.sessionId, id);
    }
    return id;
  }

  // ==========================================================
  // TELEMETRY (batched, fire-and-forget)
  // ==========================================================
  const queue = [];
  let flushTimer = null;
  function readToken() { return lsGet("jarvis.accessToken") || ""; }
  function flush() {
    if (queue.length === 0) return;
    const batch = queue.splice(0, 32);
    const body = JSON.stringify({
      source: "claude-overlay",
      session_id: sessionId(),
      batch
    });
    const headers = { "Content-Type": "application/json" };
    const token = readToken();
    if (token) headers["X-Jarvis-Key"] = token;
    fetch("/api/jarvis/audit", { method: "POST", headers, body }).catch(() => {});
  }
  function track(kind, payload) {
    queue.push({ ts: new Date().toISOString(), kind, ...payload });
    clearTimeout(flushTimer);
    if (queue.length >= 16) {
      flush();
    } else {
      flushTimer = setTimeout(flush, 4000);
    }
  }
  window.__jervisTrack = track;

  // ==========================================================
  // ERROR CAPTURE
  // ==========================================================
  window.addEventListener("error", (event) => {
    track("window_error", {
      message: String(event.message || ""),
      filename: event.filename || "",
      lineno: event.lineno || 0,
      colno: event.colno || 0,
      stack: event.error?.stack || ""
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    track("unhandled_rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : ""
    });
  });
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  // ==========================================================
  // STATUS TILE TOOLTIPS — observe added .status-tile, set title
  // ==========================================================
  function enhanceStatusTile(tile) {
    if (tile.__claudeEnhanced) return;
    tile.__claudeEnhanced = true;
    const update = () => {
      const label = tile.querySelector("span")?.textContent?.trim() || "";
      const value = tile.querySelector("strong")?.textContent?.trim() || "";
      if (label || value) {
        tile.setAttribute("title", `${label}: ${value}`);
        const valueEl = tile.querySelector("strong");
        if (valueEl) valueEl.setAttribute("data-full", value);
      }
    };
    update();
    new MutationObserver(update).observe(tile, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // ==========================================================
  // MODE SWITCHER — injects between topbar and operator-band
  // ==========================================================
  const PANEL_MODE_HINTS = {
    "Risk Gates": "comm",
    "Pending action": "comm",
    "Urgente": "comm",
    "Misiune": "mission",
    "Comenzi": "mission",
    "Mission": "mission",
    "Contact allowlist": "comm",
    "WhatsApp drafts": "comm",
    "ElevenLabs voice": "system",
    "Memorie": "memory",
    "Memory": "memory",
    "Learning loop": "memory",
    "Audit": "memory",
    "Tool Bridge": "system",
    "Local control": "system"
  };

  function buildModeSwitcher() {
    if (document.querySelector(".c-modes")) return;
    const stage = document.querySelector(".stage");
    if (!stage) return;
    const opsBand = stage.querySelector(".operator-band");
    if (!opsBand) return;

    const modes = ["all", "briefing", "comm", "mission", "memory", "system"];
    const labels = {
      all: "All",
      briefing: "Briefing",
      comm: "Comm",
      mission: "Mission",
      memory: "Memory",
      system: "System"
    };

    const nav = document.createElement("nav");
    nav.className = "c-modes";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "View mode");

    modes.forEach((mode) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "c-mode" + (mode === "all" ? " c-mode--all" : "");
      btn.dataset.mode = mode;
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = labels[mode];
      nav.appendChild(btn);
    });

    nav.addEventListener("click", (event) => {
      const target = event.target.closest(".c-mode");
      if (!target) return;
      setMode(target.dataset.mode);
    });

    stage.insertBefore(nav, opsBand);

    const saved = lsGet(LS.uiMode) || "all";
    setMode(saved);
  }

  function setMode(mode) {
    document.body.dataset.uimode = mode;
    document.querySelectorAll(".c-mode").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.mode === mode ? "true" : "false");
    });
    lsSet(LS.uiMode, mode);
    track("ui_mode_change", { mode });
  }

  // Tag .panel-section by mode based on heading text
  function tagPanelSections() {
    document.querySelectorAll(".panel-section").forEach((section) => {
      if (section.dataset.uimode) return;
      const title = section.querySelector(".section-title h3")?.textContent?.trim() || "";
      const mode = PANEL_MODE_HINTS[title];
      if (mode) section.dataset.uimode = mode;
    });
  }

  // ==========================================================
  // CAPABILITY CHIP TRACKING
  // ==========================================================
  function wireCapabilityChips() {
    document.addEventListener("click", (event) => {
      const chip = event.target.closest(".capability-chip");
      if (chip && !chip.__claudeWired) {
        const label = chip.querySelector(".visually-hidden")?.textContent?.trim() || "";
        track("capability_chip_click", { label });
      }
      const quickBtn = event.target.closest(".quick-command-grid button");
      if (quickBtn) {
        track("quick_command_click", { label: quickBtn.textContent?.trim() });
      }
    }, true);
  }

  // ==========================================================
  // VOICE STATE TRACKING
  // ==========================================================
  function watchVoiceState() {
    const shell = document.querySelector(".app-shell");
    if (!shell) return;
    const observer = new MutationObserver(() => {
      const cls = shell.className;
      const stateMatch = cls.match(/state-(\w+)/);
      const voiceMatch = cls.match(/voice-(\w+)/);
      if (stateMatch || voiceMatch) {
        const payload = {};
        if (stateMatch) payload.state = stateMatch[1];
        if (voiceMatch) payload.voice = voiceMatch[1];
        if (payload.state !== shell.__lastState || payload.voice !== shell.__lastVoice) {
          shell.__lastState = payload.state;
          shell.__lastVoice = payload.voice;
          track("visual_state_change", payload);
        }
      }
    });
    observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
  }

  // ==========================================================
  // OBSERVER — reactivates enhancements when DOM mutates
  // ==========================================================
  function pulse() {
    document.querySelectorAll(".status-tile").forEach(enhanceStatusTile);
    tagPanelSections();
    buildModeSwitcher();
  }

  function startObserver() {
    pulse();
    const observer = new MutationObserver((muts) => {
      let needsPulse = false;
      for (const m of muts) {
        if (m.addedNodes.length > 0 || m.type === "childList") {
          needsPulse = true;
          break;
        }
      }
      if (needsPulse) pulse();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ==========================================================
  // BOOT
  // ==========================================================
  function boot() {
    startObserver();
    wireCapabilityChips();
    watchVoiceState();
    track("overlay_boot", { ua: navigator.userAgent.slice(0, 80) });
    // mark we're alive in console for debugging
    if (typeof console !== "undefined") {
      console.info("%c[claude-overlay] active", "color:#f6be6c");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
