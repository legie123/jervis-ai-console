function cleanEnv(value) {
  return String(value || "").trim();
}

function envFlag(value, fallback) {
  const clean = cleanEnv(value).toLowerCase();
  if (!clean) return fallback;
  return ["1", "true", "yes", "on"].includes(clean);
}

function phoneE164(value) {
  const raw = cleanEnv(value);
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 6 || digits.length > 20) return "";
  return `+${digits}`;
}

export function loadWhatsAppConfig(env = process.env) {
  const accessToken = cleanEnv(env.META_WA_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = cleanEnv(env.META_WA_PHONE_NUMBER_ID || env.WHATSAPP_PHONE_NUMBER_ID);
  const verifyToken = cleanEnv(env.META_WA_VERIFY_TOKEN || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || env.WHATSAPP_VERIFY_TOKEN);
  const businessAccountId = cleanEnv(env.META_WA_BUSINESS_ACCOUNT_ID);
  const appSecret = cleanEnv(env.META_WA_APP_SECRET || env.WHATSAPP_APP_SECRET);
  const graphVersion = cleanEnv(env.META_WA_GRAPH_VERSION || env.WHATSAPP_GRAPH_VERSION) || "v25.0";
  const ownerPhoneE164 = phoneE164(env.JARVIS_OWNER_PHONE_E164);
  const sendEnabled = envFlag(env.WHATSAPP_SEND_ENABLED, false);
  const dryRun = envFlag(env.WHATSAPP_DRY_RUN, true);

  const missing = [];
  if (!verifyToken) missing.push("META_WA_VERIFY_TOKEN");
  if (!accessToken) missing.push("META_WA_ACCESS_TOKEN");
  if (!phoneNumberId) missing.push("META_WA_PHONE_NUMBER_ID");
  if (!ownerPhoneE164) missing.push("JARVIS_OWNER_PHONE_E164");

  const warnings = [];
  if (!businessAccountId) warnings.push("META_WA_BUSINESS_ACCOUNT_ID is not configured.");
  if (!appSecret) warnings.push("META_WA_APP_SECRET is not configured. Signature verification is relaxed outside production.");
  if (!sendEnabled) warnings.push("WHATSAPP_SEND_ENABLED is false. Live sends are blocked.");
  if (dryRun) warnings.push("WHATSAPP_DRY_RUN is true. Outbound sends remain drafts/logs.");

  return {
    provider: "whatsapp_cloud_api",
    graphVersion,
    verifyToken,
    accessToken,
    phoneNumberId,
    businessAccountId,
    appSecret,
    ownerPhoneE164,
    sendEnabled,
    dryRun,
    configured: Boolean(accessToken && phoneNumberId),
    webhookConfigured: Boolean(verifyToken),
    ownerConfigured: Boolean(ownerPhoneE164),
    liveSendAllowed: Boolean(accessToken && phoneNumberId && sendEnabled && !dryRun),
    validation: {
      missing,
      warnings
    }
  };
}

export function publicWhatsAppConfigStatus(config) {
  const mode = config.liveSendAllowed
    ? "live_ready"
    : config.dryRun
      ? "dry_run"
      : config.sendEnabled
        ? "blocked_missing_config"
        : "blocked_send_disabled";

  return {
    provider: config.provider,
    graph_version: config.graphVersion,
    mode,
    configured: config.configured,
    webhook_configured: config.webhookConfigured,
    owner_configured: config.ownerConfigured,
    send_enabled: config.sendEnabled,
    dry_run: config.dryRun,
    live_send_allowed: config.liveSendAllowed,
    access_token_configured: Boolean(config.accessToken),
    phone_number_id_configured: Boolean(config.phoneNumberId),
    business_account_id_configured: Boolean(config.businessAccountId),
    app_secret_configured: Boolean(config.appSecret),
    missing: config.validation.missing,
    warnings: config.validation.warnings
  };
}
