import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/server.js";

function config(tmpDir) {
  return {
    port: 0,
    dataDir: tmpDir,
    nodeEnv: "test",
    whatsapp: {
      verifyToken: "verify-me",
      accessToken: "token",
      phoneNumberId: "123",
      graphVersion: "v25.0",
      appSecret: ""
    }
  };
}

test("creates draft and sends only after confirmation", async () => {
  const tmpDir = `/tmp/jarvis-whatsapp-test-${crypto.randomUUID()}`;
  const calls = [];
  const app = createApp({
    config: config(tmpDir),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.sent" }] })
      };
    }
  });

  const created = await request(app)
    .post("/api/whatsapp/drafts")
    .send({ to: "40700000000", text: "Salut. Revin imediat." })
    .expect(201);

  assert.equal(calls.length, 0);
  assert.equal(created.body.draft.status, "pending_confirmation");

  await request(app)
    .post(`/api/whatsapp/drafts/${created.body.draft.id}/confirm`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.draft.status, "sent");
    });

  assert.equal(calls.length, 1);
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.to, "40700000000");
  assert.equal(sentBody.text.body, "Salut. Revin imediat.");
});
