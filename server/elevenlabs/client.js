const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanId(value, fallback) {
  const clean = String(value || "").trim();
  return clean || fallback;
}

export function createElevenLabsClient({ env = process.env, fetchImpl = fetch } = {}) {
  let apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  let voiceId = cleanId(env.ELEVENLABS_VOICE_ID, "JBFqnCBsd6RMkjVDRZzb");
  let modelId = cleanId(env.ELEVENLABS_MODEL, "eleven_flash_v2_5");
  let outputFormat = cleanId(env.ELEVENLABS_OUTPUT_FORMAT, "mp3_44100_128");

  function getStatus() {
    return {
      status: apiKey ? "ready" : "requires_setup",
      provider: "elevenlabs",
      configured: Boolean(apiKey),
      executor_attached: true,
      voice_id: voiceId,
      model: modelId,
      output_format: outputFormat,
      endpoint: "/api/jarvis/elevenlabs/tts"
    };
  }

  async function textToSpeech({ text, voice_id, model_id } = {}) {
    const spokenText = cleanText(text);
    if (!apiKey) {
      const error = new Error("ElevenLabs requires ELEVENLABS_API_KEY in .env.");
      error.statusCode = 409;
      throw error;
    }
    if (!spokenText) {
      const error = new Error("Text is required for ElevenLabs TTS.");
      error.statusCode = 400;
      throw error;
    }
    if (spokenText.length > 1000) {
      const error = new Error("ElevenLabs preview is limited to 1000 characters.");
      error.statusCode = 413;
      throw error;
    }

    const selectedVoice = cleanId(voice_id, voiceId);
    const selectedModel = cleanId(model_id, modelId);
    const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(selectedVoice)}/stream?output_format=${encodeURIComponent(outputFormat)}`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text: spokenText,
        model_id: selectedModel,
        voice_settings: {
          stability: 0.48,
          similarity_boost: 0.72,
          style: 0.15,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = new Error(`ElevenLabs TTS failed with HTTP ${response.status}.`);
      error.statusCode = response.status;
      error.detail = detail.slice(0, 500);
      throw error;
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audio,
      content_type: response.headers.get("content-type") || "audio/mpeg",
      voice_id: selectedVoice,
      model_id: selectedModel,
      character_count: spokenText.length
    };
  }

  function reloadFromEnv(nextEnv = process.env) {
    apiKey = String(nextEnv.ELEVENLABS_API_KEY || "").trim();
    voiceId = cleanId(nextEnv.ELEVENLABS_VOICE_ID, voiceId);
    modelId = cleanId(nextEnv.ELEVENLABS_MODEL, modelId);
    outputFormat = cleanId(nextEnv.ELEVENLABS_OUTPUT_FORMAT, outputFormat);
    return getStatus();
  }

  return {
    getStatus,
    reloadFromEnv,
    textToSpeech
  };
}

