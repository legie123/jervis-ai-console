import crypto from "node:crypto";
import { WhatsAppCloudApi } from "./client.js";
import { loadWhatsAppConfig, publicWhatsAppConfigStatus } from "./config.js";

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

function isOwnerRecipient(to, ownerPhoneE164) {
  return Boolean(to && ownerPhoneE164 && cleanPhone(to) === cleanPhone(ownerPhoneE164));
}

function contactAllowsWhatsapp(contact) {
  return Boolean(contact?.whatsapp_allowed === true || contact?.whatsapp_opted_in === true);
}

function executorError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createWhatsAppExecutor({ env = process.env, config = loadWhatsAppConfig(env), fetchImpl = fetch } = {}) {
  const client = new WhatsAppCloudApi({
    accessToken: config.accessToken,
    phoneNumberId: config.phoneNumberId,
    graphVersion: config.graphVersion,
    fetchImpl
  });

  let dryRun = normalizeEnvFlag(config.dryRun, true);

  function getStatus() {
    return {
      ...publicWhatsAppConfigStatus({ ...config, dryRun, liveSendAllowed: Boolean(config.configured && config.sendEnabled && !dryRun) }),
      executor_attached: true,
      provider: "whatsapp_cloud_api",
      dry_run: dryRun,
      configured: client.isConfigured(),
      phone_number_id_configured: Boolean(config.phoneNumberId),
      access_token_configured: Boolean(config.accessToken)
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

    if (!config.sendEnabled) {
      throw executorError("WhatsApp live send blocked: WHATSAPP_SEND_ENABLED=true is required.", 409);
    }
    if (!client.isConfigured()) {
      throw executorError("WhatsApp live send blocked: META_WA_ACCESS_TOKEN and META_WA_PHONE_NUMBER_ID are required.", 409);
    }
    const ownerRecipient = isOwnerRecipient(to, config.ownerPhoneE164);
    if (!contact && !ownerRecipient) {
      throw executorError("WhatsApp live send blocked: recipient is not the configured owner or an allowlisted contact.", 409);
    }
    if (contact && !contactAllowsWhatsapp(contact) && !ownerRecipient) {
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
