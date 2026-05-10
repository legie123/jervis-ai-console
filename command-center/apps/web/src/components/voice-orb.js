const VOICE_STATE_COPY = {
  idle: "Voice idle",
  listening: "Listening...",
  processing: "Processing...",
  speaking: "Speaking...",
  unsupported: "Speech API unavailable",
  error: "Voice channel error"
};

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readTargetFor(text) {
  if (text.includes("selected") || text.includes("selection") || text.includes("this")) return "selected";
  if (text.includes("last") || text.includes("latest")) return "last";
  return "selected";
}

function stripLeading(cmd, prefixes) {
  const t = String(cmd || "").trim();
  for (const pre of prefixes) {
    const p = pre.toLowerCase();
    const low = t.toLowerCase();
    if (low.startsWith(p)) {
      return t.slice(pre.length).trim();
    }
  }
  return "";
}

function extractAfterKeyword(raw, keywords) {
  const low = raw.toLowerCase();
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    const idx = low.indexOf(k);
    if (idx >= 0) {
      return raw.slice(idx + kw.length).trim();
    }
  }
  return "";
}

export function parseVoiceCommand(input) {
  const raw = String(input || "").trim();
  const normalized = normalizeText(input);
  if (!normalized) {
    return { intent: "unknown", normalized, target: "selected", confidence: 0, payload: {} };
  }

  const openRest =
    stripLeading(raw, ["open ", "launch ", "start "]) ||
    stripLeading(raw, ["deschide ", "deschidă ", "porneste ", "pornește "]);
  if (openRest) {
    const app = openRest.replace(/\s+/g, " ").trim();
    if (app.length > 0 && app.length <= 64 && /^[\p{L}\p{N}][\p{L}\p{N}\s.'-]*$/u.test(app)) {
      return {
        intent: "desk_open_app",
        normalized,
        target: "selected",
        confidence: 0.91,
        payload: { app }
      };
    }
  }

  const noteText = extractAfterKeyword(raw, [
    "adaugă nota ",
    "adauga nota ",
    "scrie nota ",
    "scrie notă ",
    "ia notă ",
    "ia nota ",
    "notiță ",
    "notita ",
    "notă ",
    "nota ",
    "note "
  ]);
  if (noteText.length > 0 && noteText.length <= 8000) {
    return {
      intent: "desk_note",
      normalized,
      target: "selected",
      confidence: 0.87,
      payload: { text: noteText }
    };
  }

  const priorityText = extractAfterKeyword(raw, [
    "adaugă prioritate ",
    "adauga prioritate ",
    "adauga o prioritate ",
    "add priority ",
    "prioritate ",
    "priority "
  ]);
  if (priorityText.length > 0 && priorityText.length <= 500) {
    return {
      intent: "desk_add_priority",
      normalized,
      target: "selected",
      confidence: 0.88,
      payload: { text: priorityText }
    };
  }

  const hasInboxWords = /(message|messages|inbox|in box)/.test(normalized);
  if (hasInboxWords && /(show|open|focus|refresh|new|latest|check)/.test(normalized)) {
    return { intent: "show_new_messages", normalized, target: "selected", confidence: 0.92, payload: {} };
  }

  if (/(approve|confirm|accept)/.test(normalized) && /(last|latest|top|pending|queue)/.test(normalized)) {
    return { intent: "approve_last", normalized, target: "last", confidence: 0.96, payload: {} };
  }

  if (/(read|speak|say)/.test(normalized) && /(aloud|out loud|selected|selection|this|item|message)/.test(normalized)) {
    return { intent: "read_aloud", normalized, target: readTargetFor(normalized), confidence: 0.93, payload: {} };
  }

  if (/(voice|dictate|spoken)/.test(normalized) && /(reply|response|respond)/.test(normalized)) {
    return { intent: "voice_reply", normalized, target: readTargetFor(normalized), confidence: 0.86, payload: {} };
  }

  return { intent: "unknown", normalized, target: "selected", confidence: 0.1, payload: {} };
}

function transcriptFromRecognition(event) {
  const first = event?.results?.[0]?.[0]?.transcript;
  return String(first || "").trim();
}

function intentLabel(intent) {
  if (intent === "show_new_messages") return "show messages";
  if (intent === "approve_last") return "approve last";
  if (intent === "read_aloud") return "read aloud";
  if (intent === "voice_reply") return "voice reply";
  if (intent === "desk_note") return "save note";
  if (intent === "desk_add_priority") return "add priority";
  if (intent === "desk_open_app") return "open app";
  return "unknown";
}

export function mountVoiceOrb(container, options = {}) {
  const { onToggle, commandHandlers = {}, language = "en-US" } = options;

  container.innerHTML = `
    <section class="voice-orb-shell" data-state="idle" aria-live="polite">
      <button type="button" class="voice-orb-btn voice-orb-trigger" aria-pressed="false" aria-label="Voice command orb" title="Voice command orb">
        <span class="voice-orb-core" aria-hidden="true">
          <span class="voice-orb-ring voice-orb-ring-outer"></span>
          <span class="voice-orb-ring voice-orb-ring-inner"></span>
          <span class="voice-orb-glyph">⌁</span>
        </span>
      </button>
      <div class="voice-orb-waveform" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <p class="voice-orb-status">Voice idle</p>
      <p class="voice-orb-hint">Try: "show new messages", "note …", "prioritate …", "open Safari"</p>
    </section>
  `;

  const root = container.querySelector(".voice-orb-shell");
  const button = container.querySelector(".voice-orb-trigger");
  const statusEl = container.querySelector(".voice-orb-status");
  const hintEl = container.querySelector(".voice-orb-hint");

  const win = typeof window !== "undefined" ? window : null;
  const RecognitionCtor = win ? win.SpeechRecognition || win.webkitSpeechRecognition : null;
  const supportsRecognition = Boolean(RecognitionCtor);
  const supportsSynthesis = Boolean(win && win.speechSynthesis && win.SpeechSynthesisUtterance);

  const recognition = supportsRecognition ? new RecognitionCtor() : null;
  if (recognition) {
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
  }

  let voiceState = "idle";
  let listening = false;
  let handlingCommand = false;
  let pendingVoiceReply = null;

  function setState(nextState, message = VOICE_STATE_COPY[nextState] || VOICE_STATE_COPY.idle) {
    voiceState = nextState;
    root.dataset.state = nextState;
    statusEl.textContent = message;
    button.setAttribute("aria-pressed", String(listening));
  }

  function setListeningFlag(on) {
    listening = on;
    button.setAttribute("aria-pressed", String(on));
    if (typeof onToggle === "function") onToggle(on);
  }

  function speak(text, { interrupt = true, onEnd } = {}) {
    const phrase = String(text || "").trim();
    if (!phrase) return false;
    if (!supportsSynthesis) {
      setState("unsupported", "Speech synthesis unavailable");
      return false;
    }

    try {
      if (interrupt) win.speechSynthesis.cancel();
      const utterance = new win.SpeechSynthesisUtterance(phrase);
      utterance.lang = language;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => setState("speaking");
      utterance.onend = () => {
        setState("idle");
        if (typeof onEnd === "function") onEnd();
      };
      utterance.onerror = () => setState("error", "Speech output failed");
      win.speechSynthesis.speak(utterance);
      return true;
    } catch {
      setState("error", "Speech output failed");
      return false;
    }
  }

  function startListening() {
    if (!recognition) {
      setState("unsupported", "Speech recognition unavailable");
      return false;
    }

    if (listening) return true;

    try {
      recognition.start();
      return true;
    } catch (error) {
      setState("error", error?.message || "Microphone start failed");
      return false;
    }
  }

  function stopListening() {
    if (!recognition || !listening) return false;
    try {
      recognition.stop();
      return true;
    } catch {
      return false;
    }
  }

  function startVoiceReply({ prompt = "Dictate your reply now.", onTranscript } = {}) {
    if (typeof onTranscript !== "function") return false;
    if (!recognition) {
      setState("unsupported", "Speech recognition unavailable");
      return false;
    }
    pendingVoiceReply = onTranscript;
    if (prompt && supportsSynthesis) {
      const queued = speak(prompt, { onEnd: () => startListening() });
      if (queued) return true;
    }
    return startListening();
  }

  async function runParsedCommand(parsed, transcript) {
    handlingCommand = true;
    setState("processing", `Command: ${intentLabel(parsed.intent)}`);
    try {
      const handler = commandHandlers[parsed.intent];
      if (typeof handler !== "function") {
        const fallback = parsed.intent === "unknown" ? `No match for "${transcript}"` : `${intentLabel(parsed.intent)} unavailable`;
        setState("idle", fallback);
        return;
      }

      const result = await handler({
        parsed,
        transcript,
        speak,
        startListening,
        stopListening,
        startVoiceReply,
        focus: () => button.focus(),
        setStatus: (message) => setState("idle", message)
      });

      if (typeof result === "string") {
        speak(result);
      } else if (result?.spokenText) {
        speak(result.spokenText);
      } else if (result?.statusText) {
        setState("idle", result.statusText);
      } else if (parsed.intent !== "unknown") {
        setState("idle", `Done: ${intentLabel(parsed.intent)}`);
      } else {
        setState("idle", `Heard "${transcript}"`);
      }
    } catch (error) {
      setState("error", error?.message || "Voice command failed");
    } finally {
      handlingCommand = false;
    }
  }

  if (recognition) {
    recognition.onstart = () => {
      setListeningFlag(true);
      setState("listening");
    };

    recognition.onresult = (event) => {
      const transcript = transcriptFromRecognition(event);
      if (!transcript) return;

      if (pendingVoiceReply) {
        const consumeTranscript = pendingVoiceReply;
        pendingVoiceReply = null;
        setState("processing", "Capturing voice reply...");
        Promise.resolve(consumeTranscript(transcript))
          .then(() => setState("idle", "Voice reply captured"))
          .catch((error) => setState("error", error?.message || "Voice reply failed"));
        return;
      }

      const parsed = parseVoiceCommand(transcript);
      runParsedCommand(parsed, transcript);
    };

    recognition.onerror = (event) => {
      setListeningFlag(false);
      setState("error", `Microphone ${event?.error || "error"}`);
    };

    recognition.onend = () => {
      setListeningFlag(false);
      if (!handlingCommand && voiceState === "listening") {
        setState("idle");
      }
    };
  }

  button.addEventListener("click", () => {
    if (!supportsRecognition) {
      setState("unsupported", "Speech recognition unavailable");
      return;
    }
    if (listening) {
      stopListening();
      return;
    }
    startListening();
  });

  if (!supportsRecognition) {
    hintEl.textContent = "Voice commands are disabled in this browser.";
  }

  if (!supportsRecognition && !supportsSynthesis) {
    setState("unsupported");
  } else {
    setState("idle");
  }

  return {
    setListening(on) {
      if (on) startListening();
      else stopListening();
    },
    startListening,
    stopListening,
    startVoiceReply,
    speak,
    focus() {
      button.focus();
    },
    getState() {
      return voiceState;
    },
    supports: {
      recognition: supportsRecognition,
      synthesis: supportsSynthesis
    }
  };
}
