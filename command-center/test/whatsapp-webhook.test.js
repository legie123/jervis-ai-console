import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { extractInboundMessages, verifyWebhookChallenge, verifyWebhookSignature } from "../packages/whatsapp/src/index.js";

const samplePayload = {
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
                text: { body: "Salut Jarvis" }
              }
            ]
          }
        }
      ]
    }
  ]
};

test("verifies webhook challenge", () => {
  const query = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": "token",
    "hub.challenge": "123"
  });

  assert.equal(verifyWebhookChallenge(query, "token"), "123");
  assert.equal(verifyWebhookChallenge(query, "wrong"), null);
});

test("verifies webhook signature when app secret exists", () => {
  const rawBody = Buffer.from(JSON.stringify(samplePayload));
  const digest = crypto.createHmac("sha256", "secret").update(rawBody).digest("hex");

  assert.equal(
    verifyWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${digest}`,
      appSecret: "secret"
    }).ok,
    true
  );

  assert.equal(
    verifyWebhookSignature({
      rawBody,
      signatureHeader: "sha256=bad",
      appSecret: "secret"
    }).ok,
    false
  );
});

test("extracts inbound text messages", () => {
  const { messages, statuses } = extractInboundMessages(samplePayload);

  assert.equal(statuses.length, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "wamid.1");
  assert.equal(messages[0].from, "40700000000");
  assert.equal(messages[0].displayName, "Client");
  assert.equal(messages[0].body, "Salut Jarvis");
});
