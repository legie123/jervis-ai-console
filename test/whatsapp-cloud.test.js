import assert from "node:assert/strict";
import test from "node:test";
import { WhatsAppCloudApi } from "../server/whatsapp/client.js";
import { loadWhatsAppConfig, publicWhatsAppConfigStatus } from "../server/whatsapp/config.js";
import { createWhatsAppExecutor } from "../server/whatsapp/executor.js";
import {
  extractWebhookEvents,
  isOwnerWhatsAppPhone,
  verifyMetaSignature,
  verifyWebhookSubscription
} from "../server/whatsapp/webhook.js";

test("GET webhook valid token returns challenge helper result", () => {
  const challenge = verifyWebhookSubscription({
    "hub.mode": "subscribe",
    "hub.verify_token": "verify-me",
    "hub.challenge": "abc123"
  }, "verify-me");

  assert.equal(challenge, "abc123");
});

test("GET webhook invalid token is rejected by helper", () => {
  const challenge = verifyWebhookSubscription({
    "hub.mode": "subscribe",
    "hub.verify_token": "wrong",
    "hub.challenge": "abc123"
  }, "verify-me");

  assert.equal(challenge, null);
});

test("POST webhook parser extracts inbound text", () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "111", display_phone_number: "15550001111" },
          messages: [{
            id: "wamid.1",
            from: "40740111222",
            timestamp: "1777777777",
            type: "text",
            text: { body: "Salut JARVIS" }
          }]
        }
      }]
    }]
  };

  const events = extractWebhookEvents(payload);
  assert.equal(events.messages.length, 1);
  assert.equal(events.messages[0].from, "40740111222");
  assert.equal(events.messages[0].text, "Salut JARVIS");
  assert.equal(events.messages[0].type, "text");
});

test("POST webhook owner filter rejects non-owner phone", () => {
  assert.equal(isOwnerWhatsAppPhone("40740111222", "+40740111222"), true);
  assert.equal(isOwnerWhatsAppPhone("40740999999", "+40740111222"), false);
});

test("send adapter does not call Cloud API when dry-run is true", async () => {
  const calls = [];
  const config = loadWhatsAppConfig({
    META_WA_ACCESS_TOKEN: "token",
    META_WA_PHONE_NUMBER_ID: "123",
    WHATSAPP_SEND_ENABLED: "true",
    WHATSAPP_DRY_RUN: "true"
  });
  const executor = createWhatsAppExecutor({
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({}) };
    }
  });

  const result = await executor.sendDraft({
    draft: { recipient: "Andrei", message: "Salut", to: "+40740111222" },
    confirmationId: "confirm-1"
  });

  assert.equal(result.dry_run, true);
  assert.equal(calls.length, 0);
});

test("send adapter permits live send to configured owner after confirmation path", async () => {
  const calls = [];
  const config = loadWhatsAppConfig({
    META_WA_ACCESS_TOKEN: "token",
    META_WA_PHONE_NUMBER_ID: "123",
    JARVIS_OWNER_PHONE_E164: "+40740111222",
    WHATSAPP_SEND_ENABLED: "true",
    WHATSAPP_DRY_RUN: "false"
  });
  const executor = createWhatsAppExecutor({
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ messages: [{ id: "wamid.owner" }] }) };
    }
  });

  const result = await executor.sendDraft({
    draft: { recipient: "+40740111222", message: "Confirmat", to: "+40740111222" },
    confirmationId: "confirm-owner"
  });

  assert.equal(result.dry_run, false);
  assert.equal(result.status, "sent");
  assert.equal(calls.length, 1);
});

test("send adapter blocks live send to non-owner without allowlisted contact", async () => {
  const config = loadWhatsAppConfig({
    META_WA_ACCESS_TOKEN: "token",
    META_WA_PHONE_NUMBER_ID: "123",
    JARVIS_OWNER_PHONE_E164: "+40740111222",
    WHATSAPP_SEND_ENABLED: "true",
    WHATSAPP_DRY_RUN: "false"
  });
  const executor = createWhatsAppExecutor({
    config,
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    }
  });

  await assert.rejects(
    () => executor.sendDraft({
      draft: { recipient: "+40740999999", message: "Nu trimite", to: "+40740999999" },
      confirmationId: "confirm-blocked"
    }),
    /recipient is not the configured owner or an allowlisted contact/
  );
});

test("Cloud API client builds correct text payload", async () => {
  const calls = [];
  const client = new WhatsAppCloudApi({
    accessToken: "secret-token",
    phoneNumberId: "123456",
    graphVersion: "v25.0",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.sent" }] })
      };
    }
  });

  await client.sendText({ to: "40740111222", text: "Salut" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://graph.facebook.com/v25.0/123456/messages");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.messaging_product, "whatsapp");
  assert.equal(body.to, "40740111222");
  assert.equal(body.type, "text");
  assert.equal(body.text.body, "Salut");
});

test("Meta signature is required in production when app secret is missing", () => {
  const signature = verifyMetaSignature({
    rawBody: Buffer.from(JSON.stringify({ entry: [] })),
    signatureHeader: "",
    appSecret: "",
    nodeEnv: "production"
  });

  assert.equal(signature.ok, false);
  assert.equal(signature.skipped, true);
});

test("WhatsApp public status does not include access tokens", () => {
  const status = publicWhatsAppConfigStatus(loadWhatsAppConfig({
    META_WA_VERIFY_TOKEN: "verify-secret",
    META_WA_ACCESS_TOKEN: "access-secret",
    META_WA_PHONE_NUMBER_ID: "123",
    META_WA_APP_SECRET: "app-secret",
    JARVIS_OWNER_PHONE_E164: "+40740111222"
  }));
  const text = JSON.stringify(status);

  assert.equal(text.includes("verify-secret"), false);
  assert.equal(text.includes("access-secret"), false);
  assert.equal(text.includes("app-secret"), false);
});
