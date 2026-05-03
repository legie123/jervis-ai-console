export function createAudioReactiveMeter(callbacks = {}) {
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let frameId = 0;
  let data = null;

  const stop = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    callbacks.onLevel?.(0);
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
    callbacks.onLevel?.(Math.min(1, rms * 4.2));
    frameId = requestAnimationFrame(tick);
  };

  return {
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        const message = "Microphone API unavailable. Manual command mode remains available.";
        callbacks.onError?.(message);
        return { ok: false, error: message };
      }

      stop();

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
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
          ? error.message
          : "Microphone permission failed. Manual command mode remains available.";
        callbacks.onError?.(message);
        return { ok: false, error: message };
      }
    },
    stop
  };
}
