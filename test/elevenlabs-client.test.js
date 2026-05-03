import assert from "node:assert/strict";
import test from "node:test";
import { createElevenLabsClient } from "../server/elevenlabs/client.js";

test("classifies ElevenLabs cloud runtime block", async () => {
  const client = createElevenLabsClient({
    env: { ELEVENLABS_API_KEY: "test-key" },
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({
        detail: {
          status: "detected_unusual_activity",
          message: "Free Tier usage disabled from this runtime."
        }
      })
    })
  });

  await assert.rejects(
    () => client.textToSpeech({ text: "Hello" }),
    (error) => {
      assert.equal(error.code, "elevenlabs_cloud_blocked_by_provider");
      assert.equal(error.providerStatus, "detected_unusual_activity");
      assert.match(error.recovery, /local JARVIS/);
      return true;
    }
  );
});
