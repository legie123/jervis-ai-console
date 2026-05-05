import crypto from "node:crypto";

export function verifyWebhookChallenge(query, verifyToken) {
  if (query.get("hub.mode") !== "subscribe") return null;
  if (!verifyToken || query.get("hub.verify_token") !== verifyToken) return null;
  return query.get("hub.challenge") || "";
}

export function verifyWebhookSignature({ rawBody, signatureHeader, appSecret }) {
  if (!appSecret) return { ok: true, skipped: true };
  if (!signatureHeader?.startsWith("sha256=")) return { ok: false, skipped: false };

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  return {
    ok:
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer),
    skipped: false
  };
}

export function extractInboundMessages(payload) {
  const messages = [];
  const statuses = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const contacts = value.contacts || [];

      for (const message of value.messages || []) {
        const contact = contacts.find((item) => item.wa_id === message.from) || null;
        messages.push({
          id: message.id,
          from: message.from,
          displayName: contact?.profile?.name || "",
          type: message.type,
          body: message.text?.body || "",
          timestamp: message.timestamp || "",
          phoneNumberId: metadata.phone_number_id || "",
          displayPhoneNumber: metadata.display_phone_number || "",
          receivedAt: new Date().toISOString(),
          raw: message
        });
      }

      for (const status of value.statuses || []) {
        statuses.push({
          id: status.id,
          recipientId: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp || "",
          raw: status
        });
      }
    }
  }

  return { messages, statuses };
}
