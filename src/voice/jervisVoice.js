export const JERVIS_GREETING = "Good morning, sir. JERVIS online. I am standing by.";

export const JERVIS_WAKE_PHRASES = [
  "hey jervis",
  "jervis",
  "hei jervis",
  "hey jarvis",
  "jarvis"
];

export const VOICE_UNAVAILABLE_MESSAGE =
  "Voice recognition unavailable in this browser. Use Chrome or enable manual command mode.";

export function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionCtor());
}

function normalizeSpeech(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWakePhrase(value) {
  const clean = normalizeSpeech(value);
  return JERVIS_WAKE_PHRASES.some((phrase) => clean.includes(phrase));
}

function safeCallback(callback, payload) {
  if (typeof callback !== "function") return;
  try {
    callback(payload);
  } catch (error) {
    console.warn("JERVIS voice callback failed", error);
  }
}

function pickVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => /en[-_]/i.test(voice.lang) && /male|daniel|alex|fred|arthur|george/i.test(voice.name)) ||
    voices.find((voice) => /en[-_]/i.test(voice.lang)) ||
    voices[0] ||
    null
  );
}

export function createJervisVoiceController(callbacks = {}) {
  const RecognitionCtor = getSpeechRecognitionCtor();
  let recognition = null;
  let mode = "idle";
  let active = false;
  let restarting = false;
  let lastFinalText = "";
  let recognitionStarted = false;

  const emitState = (state) => safeCallback(callbacks.onState, state);
  const emitError = (message) => safeCallback(callbacks.onError, message);

  const stopRecognition = () => {
    restarting = false;
    recognitionStarted = false;
    try {
      recognition?.stop();
    } catch {
      // SpeechRecognition throws if it is already stopped.
    }
  };

  const startRecognition = () => {
    if (!recognition || !active || recognitionStarted) return;
    try {
      recognition.start();
      recognitionStarted = true;
    } catch (error) {
      const isAlreadyStarted =
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "InvalidStateError";
      if (!isAlreadyStarted) {
        emitError("Voice recognition could not start. Manual command mode remains available.");
      }
    }
  };

  const configureRecognition = () => {
    recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript || "";
        if (event.results[index].isFinal) finalText += transcript;
        else interim += transcript;
      }

      const visible = (finalText || interim).trim();
      if (visible) {
        safeCallback(callbacks.onTranscript, {
          phase: mode,
          transcript: visible,
          final: Boolean(finalText)
        });
      }

      const cleanFinal = finalText.trim();
      if (!cleanFinal || cleanFinal === lastFinalText) return;
      lastFinalText = cleanFinal;

      if (mode === "wake") {
        if (!hasWakePhrase(cleanFinal)) return;
        mode = "command";
        emitState("listening");
        safeCallback(callbacks.onWake, cleanFinal);
        return;
      }

      if (mode === "command") {
        mode = "busy";
        emitState("thinking");
        safeCallback(callbacks.onFinalCommand, cleanFinal);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      active = false;
      restarting = false;
      recognitionStarted = false;
      const message = event.error === "not-allowed"
        ? "Microphone permission denied. Manual command mode remains available."
        : event.error === "service-not-allowed"
          ? "Voice recognition service is blocked. Manual command mode remains available."
        : `Voice recognition failed: ${event.error || "unknown error"}`;
      emitState("unavailable");
      emitError(message);
    };

    recognition.onend = () => {
      recognitionStarted = false;
      if (!active || !restarting) return;
      window.setTimeout(startRecognition, 220);
    };
  };

  return {
    isSupported: Boolean(RecognitionCtor),
    startWake() {
      if (!RecognitionCtor) {
        emitState("unavailable");
        emitError(VOICE_UNAVAILABLE_MESSAGE);
        return { ok: false, error: VOICE_UNAVAILABLE_MESSAGE };
      }

      if (!recognition) configureRecognition();
      active = true;
      restarting = true;
      mode = "wake";
      lastFinalText = "";
      emitState("standbyListeningForWake");
      startRecognition();
      return { ok: true };
    },
    listenForCommand() {
      if (!active) return;
      mode = "command";
      restarting = true;
      emitState("listening");
      startRecognition();
    },
    resumeWake() {
      if (!active) return;
      mode = "wake";
      lastFinalText = "";
      restarting = true;
      emitState("standbyListeningForWake");
      startRecognition();
    },
    pauseRecognition() {
      restarting = false;
      stopRecognition();
    },
    async speak(text, options = {}) {
      const clean = String(text || "").trim();
      if (!clean || typeof window === "undefined" || !window.speechSynthesis) return;

      this.pauseRecognition();
      emitState(options.state || "speaking");
      safeCallback(callbacks.onResponse, clean);
      window.speechSynthesis.cancel();

      await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(clean);
        const voice = pickVoice();
        if (voice) utterance.voice = voice;
        utterance.rate = 0.92;
        utterance.pitch = 0.85;
        utterance.volume = 1;
        utterance.onend = resolve;
        utterance.onerror = resolve;
        window.speechSynthesis.speak(utterance);
      });
    },
    stop() {
      active = false;
      restarting = false;
      mode = "idle";
      stopRecognition();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      emitState("standby");
    }
  };
}
