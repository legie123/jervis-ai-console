import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/server.js";

function config(tmpDir, elevenlabs = {}) {
  return {
    port: 0,
    dataDir: tmpDir,
    nodeEnv: "test",
    whatsapp: {
      verifyToken: "verify-me",
      accessToken: "",
      phoneNumberId: "",
      graphVersion: "v25.0",
      appSecret: ""
    },
    elevenlabs: {
      apiKey: "eleven-key",
      voiceId: "voice-123",
      altVoiceId: "voice-alt-456",
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
      ...elevenlabs
    }
  };
}

test("creates ElevenLabs speech and serves local audio", async () => {
  const tmpDir = `/tmp/jarvis-elevenlabs-test-${crypto.randomUUID()}`;
  const calls = [];
  const audio = Buffer.from("fake-mp3");
  const app = createApp({
    config: config(tmpDir),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        arrayBuffer: async () => audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength)
      };
    }
  });

  const created = await request(app)
    .post("/api/voice/speech")
    .send({ text: "Salut. JARVIS voce." })
    .expect(201);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/text-to-speech\/voice-123\?output_format=mp3_44100_128$/);
  assert.equal(calls[0].options.headers["xi-api-key"], "eleven-key");
  assert.equal(JSON.parse(calls[0].options.body).model_id, "eleven_multilingual_v2");
  assert.equal(created.body.speech.status, "created");
  assert.equal(created.body.speech.risk, "DANGEROUS_third_party_text_transfer");

  await request(app)
    .get(created.body.speech.audioUrl)
    .expect(200)
    .expect((response) => {
      assert.equal(response.body.toString("utf8"), "fake-mp3");
    });
});

test("creates ElevenLabs speech with alternate configured voice", async () => {
  const tmpDir = `/tmp/jarvis-elevenlabs-test-${crypto.randomUUID()}`;
  const calls = [];
  const app = createApp({
    config: config(tmpDir),
    fetchImpl: async (url) => {
      calls.push({ url: String(url) });
      return {
        ok: true,
        arrayBuffer: async () => Buffer.from("alt-mp3").buffer
      };
    }
  });

  await request(app)
    .post("/api/voice/speech")
    .send({ text: "Voce alternativa.", voice: "alternate" })
    .expect(201)
    .expect(({ body }) => {
      assert.equal(body.speech.voice, "alternate");
    });

  assert.match(calls[0].url, /\/v1\/text-to-speech\/voice-alt-456\?output_format=mp3_44100_128$/);
});

test("does not call ElevenLabs when speech text is invalid", async () => {
  const tmpDir = `/tmp/jarvis-elevenlabs-test-${crypto.randomUUID()}`;
  let calls = 0;
  const app = createApp({
    config: config(tmpDir),
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not be called");
    }
  });

  await request(app).post("/api/voice/speech").send({ text: "" }).expect(400);

  assert.equal(calls, 0);
});

test("rejects unknown ElevenLabs voice selector", async () => {
  const tmpDir = `/tmp/jarvis-elevenlabs-test-${crypto.randomUUID()}`;
  let calls = 0;
  const app = createApp({
    config: config(tmpDir),
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not be called");
    }
  });

  await request(app)
    .post("/api/voice/speech")
    .send({ text: "Salut", voice: "random" })
    .expect(400);

  assert.equal(calls, 0);
});

test("reports ElevenLabs as unconfigured without API key", async () => {
  const tmpDir = `/tmp/jarvis-elevenlabs-test-${crypto.randomUUID()}`;
  const app = createApp({
    config: config(tmpDir, { apiKey: "" })
  });

  await request(app)
    .get("/health")
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.elevenlabs.ttsConfigured, false);
      assert.equal(body.elevenlabs.voiceConfigured, true);
      assert.equal(body.elevenlabs.alternateVoiceConfigured, true);
    });
});
