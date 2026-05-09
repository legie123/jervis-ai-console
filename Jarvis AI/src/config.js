import path from "node:path";

export function getConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || "./data");

  return {
    port: Number(env.PORT || 8787),
    dataDir,
    nodeEnv: env.NODE_ENV || "development",
    whatsapp: {
      verifyToken: env.WHATSAPP_VERIFY_TOKEN || "",
      accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
      graphVersion: env.WHATSAPP_GRAPH_VERSION || "v25.0",
      appSecret: env.WHATSAPP_APP_SECRET || ""
    },
    elevenlabs: {
      apiKey: env.ELEVENLABS_API_KEY || "",
      voiceId: env.ELEVENLABS_VOICE_ID || "",
      altVoiceId: env.ELEVENLABS_ALT_VOICE_ID || "",
      modelId: env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
      outputFormat: env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128"
    }
  };
}
