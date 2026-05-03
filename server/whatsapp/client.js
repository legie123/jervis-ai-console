export class WhatsAppCloudApi {
  constructor({ accessToken, phoneNumberId, graphVersion = "v25.0", fetchImpl = fetch } = {}) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.graphVersion = graphVersion;
    this.fetch = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  async sendText({ to, text }) {
    if (!this.isConfigured()) {
      const error = new Error("WhatsApp Cloud API is not configured.");
      error.statusCode = 409;
      throw error;
    }

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
            body: text
          }
        })
      }
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body?.error?.message || `WhatsApp send failed with HTTP ${response.status}.`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.providerResponse = body;
      throw error;
    }

    return body;
  }
}
