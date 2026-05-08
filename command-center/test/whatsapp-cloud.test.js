import { test } from "node:test";
import assert from "node:assert/strict";
import { SafeWhatsApp, WhatsAppCloudSender } from "../packages/whatsapp/src/index.js";

test("cloud sender posts Meta text payload when enabled", async () => {
  const calls = [];
  const sender = new WhatsAppCloudSender({
    accessToken: "token",
    phoneNumberId: "12345",
    graphVersion: "v25.0",
    realSendEnabled: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ messages: [{ id: "wamid.test" }] })
      };
    }
  });
  const whatsapp = new SafeWhatsApp({ sender });

  const draft = await whatsapp.draftMessage({ to: "40700000000", body: "Salut" });
  const sent = await whatsapp.sendConfirmedDraft(draft.id, "CONFIRM_SEND");

  assert.equal(sent.status, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://graph.facebook.com/v25.0/12345/messages");
  assert.equal(calls[0].options.headers.Authorization, "Bearer token");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.messaging_product, "whatsapp");
  assert.equal(body.to, "40700000000");
  assert.equal(body.type, "text");
  assert.equal(body.text.body, "Salut");
});
