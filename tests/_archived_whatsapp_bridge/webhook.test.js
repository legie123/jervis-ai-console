import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/server.js";

function config(tmpDir, overrides = {}) {
  return {
    port: 0,
    dataDir: tmpDir,
    nodeEnv: "test",
    whatsapp: {
      verifyToken: "verify-me",
      accessToken: "",
      phoneNumberId: "",
      graphVersion: "v25.0",
      appSecret: "",
      ...overrides
    }
  };
}

test("verifies webhook subscription", async () => {
  const tmpDir = `/tmp/jarvis-whatsapp-test-${crypto.randomUUID()}`;
  const app = createApp({ config: config(tmpDir) });
  await request(app)
    .get("/webhooks/whatsapp")
    .query({
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-me",
      "hub.challenge": "12345"
    })
    .expect(200, "12345");
});

test("stores inbound WhatsApp messages", async () => {
  const tmpDir = `/tmp/jarvis-whatsapp-test-${crypto.randomUUID()}`;
  const app = createApp({ config: config(tmpDir) });
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "111", display_phone_number: "15550001111" },
              contacts: [{ wa_id: "40700000000", profile: { name: "Client" } }],
              messages: [
                {
                  id: "wamid.1",
                  from: "40700000000",
                  timestamp: "1777777777",
                  type: "text",
                  text: { body: "Salut" }
                }
              ]
            }
          }
        ]
      }
    ]
  };

  await request(app)
    .post("/webhooks/whatsapp")
    .set("content-type", "application/json")
    .send(JSON.stringify(payload))
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.messages, 1);
    });

  await request(app)
    .get("/api/whatsapp/messages")
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.messages[0].id, "wamid.1");
      assert.equal(body.messages[0].text, "Salut");
    });
});

test("rejects bad webhook signature in production", async () => {
  const tmpDir = `/tmp/jarvis-whatsapp-test-${crypto.randomUUID()}`;
  const app = createApp({
    config: config(tmpDir, { appSecret: "secret" })
  });
  app.set("env", "production");

  await request(app)
    .post("/webhooks/whatsapp")
    .set("content-type", "application/json")
    .set("x-hub-signature-256", "sha256=bad")
    .send(JSON.stringify({ entry: [] }))
    .expect(403);
});
