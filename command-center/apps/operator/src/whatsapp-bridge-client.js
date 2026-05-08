const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8787";
const BRIDGE_SEND_TOKEN = "CONFIRM_BRIDGE_SEND";

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BRIDGE_URL).replace(/\/+$/, "");
}

async function readJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Bridge HTTP ${response.status}`);
  return body;
}

export function createWhatsAppBridgeClient({
  baseUrl = process.env.JARVIS_WHATSAPP_BRIDGE_URL || DEFAULT_BRIDGE_URL,
  fetchImpl = fetch
} = {}) {
  const url = cleanBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const response = await fetchImpl(`${url}${path}`, {
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options
    });
    return readJsonResponse(response);
  }

  async function status() {
    try {
      const health = await request("/health");
      return {
        ok: true,
        status: "REAL",
        url,
        health
      };
    } catch (error) {
      return {
        ok: false,
        status: "OFFLINE",
        url,
        error: error.message
      };
    }
  }

  return {
    url,
    status,
    async preflight() {
      const result = await request("/api/whatsapp/preflight");
      return { ok: true, source: "whatsapp_bridge", preflight: result };
    },
    async listMessages() {
      const result = await request("/api/whatsapp/messages");
      return { ok: true, source: "whatsapp_bridge", messages: result.messages || [] };
    },
    async listDrafts() {
      const result = await request("/api/whatsapp/drafts");
      return { ok: true, source: "whatsapp_bridge", drafts: result.drafts || [] };
    },
    async createDraft({ to, body, text, reason }) {
      return request("/api/whatsapp/drafts", {
        method: "POST",
        body: JSON.stringify({
          to,
          text: text || body,
          reason: reason || "Created from JARVIS Command Center bridge"
        })
      });
    },
    async confirmDraft({ id, confirmToken }) {
      if (confirmToken !== BRIDGE_SEND_TOKEN) {
        throw new Error(`Bridge send blocked. Type ${BRIDGE_SEND_TOKEN}.`);
      }

      return request(`/api/whatsapp/drafts/${encodeURIComponent(id)}/confirm`, {
        method: "POST"
      });
    }
  };
}

export { BRIDGE_SEND_TOKEN };
