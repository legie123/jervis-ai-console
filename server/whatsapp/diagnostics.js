function graphError(payload) {
  const error = payload?.error;
  if (!error) return null;
  return {
    code: error.code,
    type: error.type,
    message: error.message
  };
}

function hasWhatsAppScopes(scopes = []) {
  return scopes.includes("whatsapp_business_management") && scopes.includes("whatsapp_business_messaging");
}

async function graphRequest({ graphVersion, path, accessToken, fetchImpl }) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetchImpl(`https://graph.facebook.com/${graphVersion}/${path}${separator}access_token=${encodeURIComponent(accessToken)}`);
  const payload = await response.json().catch(() => ({}));
  return { http_status: response.status, payload };
}

export async function diagnoseWhatsAppCloudApi({ config, fetchImpl = fetch } = {}) {
  const accessTokenConfigured = Boolean(config?.accessToken);
  const phoneNumberIdConfigured = Boolean(config?.phoneNumberId);
  const businessAccountIdConfigured = Boolean(config?.businessAccountId);

  const result = {
    provider: "whatsapp_cloud_api",
    graph_version: config?.graphVersion || "v25.0",
    access_token_configured: accessTokenConfigured,
    phone_number_id_configured: phoneNumberIdConfigured,
    business_account_id_configured: businessAccountIdConfigured,
    token: {
      valid: false,
      type: null,
      expires_at_present: false,
      whatsapp_scopes_present: false
    },
    phone_number: {
      accessible: false,
      display_last4: "",
      verified_name_present: false
    },
    business_account: {
      accessible: false,
      name_present: false
    },
    subscribed_apps: {
      checked: false,
      accessible: false,
      count: null
    },
    ready_for_meta_send: false,
    ready_for_waba_subscribe: false
  };

  if (!accessTokenConfigured) {
    result.token.error = { message: "META_WA_ACCESS_TOKEN is not configured." };
    return result;
  }

  const tokenCheck = await graphRequest({
    graphVersion: result.graph_version,
    path: `debug_token?input_token=${encodeURIComponent(config.accessToken)}`,
    accessToken: config.accessToken,
    fetchImpl
  });
  const tokenData = tokenCheck.payload?.data || {};
  result.token.http_status = tokenCheck.http_status;
  result.token.valid = Boolean(tokenData.is_valid);
  result.token.type = tokenData.type || null;
  result.token.expires_at_present = Boolean(tokenData.expires_at);
  result.token.whatsapp_scopes_present = hasWhatsAppScopes(tokenData.scopes || []);
  result.token.error = graphError(tokenCheck.payload);

  if (phoneNumberIdConfigured) {
    const phoneCheck = await graphRequest({
      graphVersion: result.graph_version,
      path: `${encodeURIComponent(config.phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`,
      accessToken: config.accessToken,
      fetchImpl
    });
    result.phone_number.http_status = phoneCheck.http_status;
    result.phone_number.accessible = Boolean(phoneCheck.payload?.id);
    result.phone_number.display_last4 = String(phoneCheck.payload?.display_phone_number || "").replace(/\D/g, "").slice(-4);
    result.phone_number.verified_name_present = Boolean(phoneCheck.payload?.verified_name);
    result.phone_number.error = graphError(phoneCheck.payload);
  } else {
    result.phone_number.error = { message: "META_WA_PHONE_NUMBER_ID is not configured." };
  }

  if (businessAccountIdConfigured) {
    const accountCheck = await graphRequest({
      graphVersion: result.graph_version,
      path: `${encodeURIComponent(config.businessAccountId)}?fields=id,name`,
      accessToken: config.accessToken,
      fetchImpl
    });
    result.business_account.http_status = accountCheck.http_status;
    result.business_account.accessible = Boolean(accountCheck.payload?.id);
    result.business_account.name_present = Boolean(accountCheck.payload?.name);
    result.business_account.error = graphError(accountCheck.payload);

    const subscribedAppsCheck = await graphRequest({
      graphVersion: result.graph_version,
      path: `${encodeURIComponent(config.businessAccountId)}/subscribed_apps`,
      accessToken: config.accessToken,
      fetchImpl
    });
    result.subscribed_apps.checked = true;
    result.subscribed_apps.http_status = subscribedAppsCheck.http_status;
    result.subscribed_apps.accessible = Array.isArray(subscribedAppsCheck.payload?.data);
    result.subscribed_apps.count = Array.isArray(subscribedAppsCheck.payload?.data) ? subscribedAppsCheck.payload.data.length : null;
    result.subscribed_apps.error = graphError(subscribedAppsCheck.payload);
  } else {
    result.business_account.error = { message: "META_WA_BUSINESS_ACCOUNT_ID is not configured." };
  }

  result.ready_for_meta_send = Boolean(result.token.valid && result.token.whatsapp_scopes_present && result.phone_number.accessible);
  result.ready_for_waba_subscribe = Boolean(result.token.valid && result.token.whatsapp_scopes_present && result.business_account.accessible);
  return result;
}
