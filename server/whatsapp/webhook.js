import crypto from "node:crypto";

export function verifyWebhookSubscription(query, verifyToken) {
  if (query["hub.mode"] !== "subscribe") return null;
  if (!verifyToken || query["hub.verify_token"] !== verifyToken) return null;
  return query["hub.challenge"] || "";
}

export function verifyMetaSignature({ rawBody, signatureHeader, appSecret, nodeEnv }) {
  if (!appSecret) {
    return { ok: nodeEnv !== "production", skipped: true };
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return { ok: false, skipped: false };
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  return {
    ok: expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer),
    skipped: false
  };
}

export function extractWebhookEvents(payload) {
  const messages = [];
  const statuses = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};

      for (const message of value.messages || []) {
        messages.push({
          id: message.id,
          direction: "inbound",
          from: message.from,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text?.body || "",
          phone_number_id: metadata.phone_number_id || "",
          display_phone_number: metadata.display_phone_number || "",
          contact: (value.contacts || []).find((contact) => contact.wa_id === message.from) || null,
          raw: message
        });
      }

      for (const status of value.statuses || []) {
        statuses.push({
          id: status.id,
          recipient_id: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp,
          conversation: status.conversation || null,
          pricing: status.pricing || null,
          errors: status.errors || [],
          raw: status
        });
      }
    }
  }

  return { messages, statuses };
}
