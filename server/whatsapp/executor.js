import crypto from "node:crypto";
import { WhatsAppCloudApi } from "./client.js";

function normalizeEnvFlag(value, fallback = true) {
  const clean = String(value ?? "").trim().toLowerCase();
  if (!clean) return fallback;
  return !["0", "false", "off", "no"].includes(clean);
}

function cleanText(value, max = 4096) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 20 ? digits : "";
}

function contactAllowsWhatsapp(contact) {
  return Boolean(contact?.whatsapp_allowed === true || contact?.whatsapp_opted_in === true);
}

function executorError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createWhatsAppExecutor({ env = process.env, fetchImpl = fetch } = {}) {
  const client = new WhatsAppCloudApi({
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    graphVersion: env.WHATSAPP_GRAPH_VERSION || "v25.0",
    fetchImpl
  });

  let dryRun = normalizeEnvFlag(env.WHATSAPP_DRY_RUN, true);

  function getStatus() {
    return {
      executor_attached: true,
      provider: "whatsapp_cloud_api",
      dry_run: dryRun,
      configured: client.isConfigured(),
      phone_number_id_configured: Boolean(env.WHATSAPP_PHONE_NUMBER_ID),
      access_token_configured: Boolean(env.WHATSAPP_ACCESS_TOKEN),
      mode: dryRun ? "dry_run" : client.isConfigured() ? "live" : "blocked_missing_config"
    };
  }

  async function sendDraft({ draft, confirmationId, contact = null }) {
    const recipientLabel = cleanText(draft?.recipient || draft?.to || "unknown", 160);
    const message = cleanText(draft?.message || draft?.text);
    const to = cleanPhone(contact?.phone_e164 || contact?.phone || draft?.phone_e164 || draft?.recipient_phone || draft?.to);

    if (!message) {
      throw executorError("WhatsApp draft has no message body.");
    }

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        provider: "whatsapp_cloud_api",
        status: "dry_run_sent",
        execution_state: "dry_run",
        message_id: `dry_run_${crypto.randomUUID()}`,
        recipient: recipientLabel,
        to: to || null,
        sent_at: new Date().toISOString(),
        confirmation_id: confirmationId,
        note: "Dry run only. No WhatsApp API call was made."
      };
    }

    if (!client.isConfigured()) {
      throw executorError("WhatsApp live send blocked: WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required.", 409);
    }
    if (!contact) {
      throw executorError("WhatsApp live send blocked: recipient is not in the contact allowlist.", 409);
    }
    if (!contactAllowsWhatsapp(contact)) {
      throw executorError("WhatsApp live send blocked: contact is not opted in for WhatsApp.", 409);
    }
    if (!to) {
      throw executorError("WhatsApp live send blocked: recipient phone_e164 is missing or invalid.", 400);
    }

    const providerResponse = await client.sendText({ to, text: message });
    return {
      ok: true,
      dry_run: false,
      provider: "whatsapp_cloud_api",
      status: "sent",
      execution_state: "sent",
      message_id: providerResponse?.messages?.[0]?.id || null,
      recipient: recipientLabel,
      to,
      sent_at: new Date().toISOString(),
      confirmation_id: confirmationId,
      provider_response: providerResponse,
      note: "WhatsApp Cloud API accepted the message."
    };
  }

  return {
    getStatus,
    setDryRun(nextDryRun) {
      dryRun = Boolean(nextDryRun);
      return getStatus();
    },
    sendDraft
  };
}
