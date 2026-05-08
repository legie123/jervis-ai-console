export class WhatsAppCloudSender {
  constructor({
    accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v25.0",
    realSendEnabled = process.env.WHATSAPP_REAL_SEND_ENABLED === "true",
    fetchImpl = fetch
  } = {}) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.graphVersion = graphVersion;
    this.realSendEnabled = realSendEnabled;
    this.fetch = fetchImpl;
  }

  status() {
    return {
      status: this.isReady() ? "REAL" : "PARTIAL",
      configured: Boolean(this.accessToken && this.phoneNumberId),
      realSendEnabled: this.realSendEnabled,
      graphVersion: this.graphVersion
    };
  }

  isReady() {
    return Boolean(this.realSendEnabled && this.accessToken && this.phoneNumberId);
  }

  async sendText({ to, body }) {
    if (!this.realSendEnabled) {
      throw new Error("WhatsApp real send is disabled. Set WHATSAPP_REAL_SEND_ENABLED=true.");
    }
    if (!this.accessToken) throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
    if (!this.phoneNumberId) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
    if (!to) throw new Error("Recipient is required");
    if (!body) throw new Error("Message body is required");

    const response = await this.fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            preview_url: false,
            body
          }
        })
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || `WhatsApp send failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }
}
