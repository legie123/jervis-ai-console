/**
 * wake.js — JERVIS Native Agent V3 Phase 8 (parallel, additive)
 * Author: Claude (sesiunea 2026-05-05, doctor mode)
 *
 * Wake-phrase detector. Standalone module — does NOT touch
 * src/voice/jervisVoice.js (which is dirty with Codex's lazy core
 * + Lite mode upgrades). When Codex's branch lands, integrate via:
 *
 *   import { createWakeListener } from "./voice/wake.js";
 *   const wake = createWakeListener({
 *     onWake: (transcript) => voiceController.handleWake(transcript)
 *   });
 *   wake.start();
 *
 * Until then, this file is unwired. Loaded lazily from main.jsx
 * once the integration is approved by Codex.
 */

const DEFAULT_PHRASES = [
  "hey jervis",
  "hi jervis",
  "ok jervis",
  "hey jarvis",
  "hi jarvis",
  "ok jarvis",
  "salut jervis",
  "salut jarvis"
];

/**
 * Normalize for fuzzy matching:
 *   lowercase, strip diacritics, collapse whitespace, drop punctuation.
 */
function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Determine whether a transcript contains any wake phrase.
 * Returns the matched phrase or null. Tolerates 1 inserted/missing
 * char between words (lightweight Levenshtein not needed yet).
 */
export function detectWake(transcript, phrases = DEFAULT_PHRASES) {
  const norm = normalize(transcript);
  if (!norm) return null;
  for (const phrase of phrases) {
    const normPhrase = normalize(phrase);
    if (norm.includes(normPhrase)) return phrase;
  }
  // softer: handle "hey-jervis", "heyjervis" stuck words
  const stripped = norm.replace(/\s+/g, "");
  for (const phrase of phrases) {
    const stripPhrase = normalize(phrase).replace(/\s+/g, "");
    if (stripped.includes(stripPhrase)) return phrase;
  }
  return null;
}

/**
 * Strip the wake phrase from the transcript so the residual command
 * can be passed downstream. "hey jervis open Claude Code" -> "open Claude Code".
 */
export function stripWake(transcript, phrases = DEFAULT_PHRASES) {
  if (!transcript) return "";
  let out = String(transcript);
  for (const phrase of phrases) {
    const re = new RegExp(`(^|\\s)(${phrase.replace(/\s+/g, "\\s+")})(\\s|$)`, "ig");
    out = out.replace(re, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Browser-side wake listener. Wraps Web Speech API in continuous mode.
 * Calls onWake({ phrase, transcript, residual }) when matched.
 *
 * The listener auto-restarts on silent end events to keep the wake
 * surface always-armed without burning CPU on a tight loop.
 */
export function createWakeListener({
  phrases = DEFAULT_PHRASES,
  onWake,
  onError,
  lang = "en-US",
  alternativeLang = "ro-RO"
} = {}) {
  const Ctor =
    typeof window !== "undefined"
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
  if (!Ctor) {
    return {
      ok: false,
      error: "SpeechRecognition unsupported in this browser",
      start() { return false; },
      stop() {},
      isActive() { return false; },
      setPhrases() {}
    };
  }

  let recognition = null;
  let active = false;
  let stopRequested = false;
  let livePhrases = [...phrases];
  let currentLang = lang;

  function build() {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = currentLang;
    rec.maxAlternatives = 2;

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        for (let j = 0; j < result.length; j += 1) {
          const transcript = result[j].transcript || "";
          const matched = detectWake(transcript, livePhrases);
          if (matched) {
            const residual = stripWake(transcript, livePhrases);
            try { onWake?.({ phrase: matched, transcript, residual, isFinal: result.isFinal }); }
            catch (err) { try { onError?.(err); } catch {} }
          }
        }
      }
    };

    rec.onerror = (event) => {
      try { onError?.(event.error || event); } catch {}
      // alternate languages on error: en-US -> ro-RO -> en-US
      if (event.error === "language-not-supported") {
        currentLang = currentLang === lang ? alternativeLang : lang;
      }
    };

    rec.onend = () => {
      active = false;
      if (!stopRequested) {
        // auto-restart with a small backoff to avoid hot loop on browsers that throttle
        setTimeout(() => {
          if (!stopRequested) start();
        }, 320);
      }
    };

    return rec;
  }

  function start() {
    if (active) return true;
    stopRequested = false;
    try {
      recognition = build();
      recognition.start();
      active = true;
      return true;
    } catch (err) {
      active = false;
      try { onError?.(err); } catch {}
      return false;
    }
  }

  function stop() {
    stopRequested = true;
    active = false;
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
  }

  function isActive() { return active; }

  function setPhrases(next) {
    if (Array.isArray(next) && next.length > 0) {
      livePhrases = next.map((p) => String(p || "").trim()).filter(Boolean);
    }
  }

  return { ok: true, start, stop, isActive, setPhrases };
}

export const WAKE_PHRASES = DEFAULT_PHRASES;

export default {
  WAKE_PHRASES,
  detectWake,
  stripWake,
  createWakeListener
};
