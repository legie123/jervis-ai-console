export class ElevenLabsClient {
  constructor({
    apiKey,
    voiceId,
    modelId = "eleven_multilingual_v2",
    outputFormat = "mp3_44100_128",
    fetchImpl = fetch
  }) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.modelId = modelId;
    this.outputFormat = outputFormat;
    this.fetch = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.voiceId);
  }

  async createSpeech({ text, voiceId = this.voiceId }) {
    if (!this.isConfigured()) {
      throw new Error("ElevenLabs API is not configured");
    }

    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`);
    url.searchParams.set("output_format", this.outputFormat);

    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: this.modelId
      })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = body?.detail?.message || body?.message || `ElevenLabs TTS failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
