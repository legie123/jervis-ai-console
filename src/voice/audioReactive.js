export function createAudioReactiveMeter(callbacks = {}) {
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let frameId = 0;
  let data = null;
  let startToken = 0;

  const emitLevel = (level) => {
    try {
      callbacks.onLevel?.(level);
    } catch (error) {
      console.warn("JERVIS audio level callback failed", error);
    }
  };

  const emitError = (message) => {
    try {
      callbacks.onError?.(message);
    } catch (error) {
      console.warn("JERVIS audio error callback failed", error);
    }
  };

  const stop = () => {
    startToken += 1;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    emitLevel(0);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
    }
    audioContext = null;
    analyser = null;
    data = null;
  };

  const tick = () => {
    if (!analyser || !data) return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) {
      const centered = (data[index] - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / data.length);
    emitLevel(Math.min(1, rms * 4.2));
    frameId = requestAnimationFrame(tick);
  };

  return {
    async start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        const message = "Microphone API unavailable. Manual command mode remains available.";
        emitError(message);
        return { ok: false, error: message };
      }

      stop();
      const token = startToken;

      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        if (token !== startToken) {
          nextStream.getTracks().forEach((track) => track.stop());
          return { ok: false, error: "Microphone startup cancelled. Manual command mode remains available." };
        }
        stream = nextStream;
        const AudioContextCtor = typeof window !== "undefined"
          ? window.AudioContext || window.webkitAudioContext
          : null;
        if (!AudioContextCtor) {
          throw new Error("Web Audio API unavailable. Manual command mode remains available.");
        }
        audioContext = new AudioContextCtor();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.78;
        data = new Uint8Array(analyser.fftSize);
        source.connect(analyser);
        tick();
        return { ok: true, stream };
      } catch (error) {
        stop();
        const message = error instanceof Error
          ? error.name === "NotAllowedError"
            ? "Microphone permission denied. Manual command mode remains available."
            : error.name === "NotFoundError"
              ? "No microphone found. Manual command mode remains available."
              : error.message
          : "Microphone permission failed. Manual command mode remains available.";
        emitError(message);
        return { ok: false, error: message };
      }
    },
    stop
  };
}
