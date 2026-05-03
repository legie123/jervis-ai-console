import assert from "node:assert/strict";
import test from "node:test";
import { loadWhatsAppConfig, publicWhatsAppConfigStatus } from "../server/whatsapp/config.js";

test("WhatsApp config defaults to dry-run and blocked sends", () => {
  const config = loadWhatsAppConfig({});
  const status = publicWhatsAppConfigStatus(config);

  assert.equal(config.dryRun, true);
  assert.equal(config.sendEnabled, false);
  assert.equal(config.configured, false);
  assert.equal(status.mode, "dry_run");
});

test("WhatsApp config reads canonical Meta env names", () => {
  const config = loadWhatsAppConfig({
    META_WA_VERIFY_TOKEN: "verify-token",
    META_WA_ACCESS_TOKEN: "access-token",
    META_WA_PHONE_NUMBER_ID: "123456",
    META_WA_BUSINESS_ACCOUNT_ID: "789",
    META_WA_APP_SECRET: "app-secret",
    JARVIS_OWNER_PHONE_E164: "+40740111222",
    WHATSAPP_SEND_ENABLED: "true",
    WHATSAPP_DRY_RUN: "false"
  });

  assert.equal(config.verifyToken, "verify-token");
  assert.equal(config.accessToken, "access-token");
  assert.equal(config.phoneNumberId, "123456");
  assert.equal(config.businessAccountId, "789");
  assert.equal(config.appSecret, "app-secret");
  assert.equal(config.ownerPhoneE164, "+40740111222");
  assert.equal(config.liveSendAllowed, true);
});

test("WhatsApp public status does not expose secrets", () => {
  const config = loadWhatsAppConfig({
    META_WA_VERIFY_TOKEN: "verify-token-secret",
    META_WA_ACCESS_TOKEN: "access-token-secret",
    META_WA_PHONE_NUMBER_ID: "123456",
    META_WA_APP_SECRET: "app-secret-secret",
    JARVIS_OWNER_PHONE_E164: "+40740111222"
  });
  const statusText = JSON.stringify(publicWhatsAppConfigStatus(config));

  assert.equal(statusText.includes("verify-token-secret"), false);
  assert.equal(statusText.includes("access-token-secret"), false);
  assert.equal(statusText.includes("app-secret-secret"), false);
});
