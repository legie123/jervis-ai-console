import assert from "node:assert/strict";
import test from "node:test";
import { loadWhatsAppConfig } from "../server/whatsapp/config.js";
import { diagnoseWhatsAppCloudApi } from "../server/whatsapp/diagnostics.js";

test("diagnoses reachable WhatsApp Cloud API assets without exposing secrets", async () => {
  const calls = [];
  const diagnostics = await diagnoseWhatsAppCloudApi({
    config: loadWhatsAppConfig({
      META_WA_ACCESS_TOKEN: "access-secret",
      META_WA_PHONE_NUMBER_ID: "123456",
      META_WA_BUSINESS_ACCOUNT_ID: "999999",
      JARVIS_OWNER_PHONE_E164: "+40734192640"
    }),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("debug_token")) {
        return {
          status: 200,
          json: async () => ({
            data: {
              is_valid: true,
              type: "USER",
              expires_at: 1777777777,
              scopes: ["whatsapp_business_management", "whatsapp_business_messaging"]
            }
          })
        };
      }
      if (url.includes("123456?")) {
        return {
          status: 200,
          json: async () => ({ id: "123456", display_phone_number: "+1 555 156 1121", verified_name: "Meta Test" })
        };
      }
      if (url.includes("999999/subscribed_apps")) {
        return {
          status: 200,
          json: async () => ({ data: [{ object: "whatsapp_business_account" }] })
        };
      }
      return {
        status: 200,
        json: async () => ({ id: "999999", name: "WABA" })
      };
    }
  });

  assert.equal(diagnostics.token.valid, true);
  assert.equal(diagnostics.token.whatsapp_scopes_present, true);
  assert.equal(diagnostics.phone_number.accessible, true);
  assert.equal(diagnostics.phone_number.display_last4, "1121");
  assert.equal(diagnostics.business_account.accessible, true);
  assert.equal(diagnostics.ready_for_meta_send, true);
  assert.equal(diagnostics.ready_for_waba_subscribe, true);
  assert.equal(JSON.stringify(diagnostics).includes("access-secret"), false);
  assert.equal(calls.every((url) => url.includes("access-secret")), true);
});

test("diagnoses missing Phone ID access as not ready", async () => {
  const diagnostics = await diagnoseWhatsAppCloudApi({
    config: loadWhatsAppConfig({
      META_WA_ACCESS_TOKEN: "access-secret",
      META_WA_PHONE_NUMBER_ID: "123456",
      META_WA_BUSINESS_ACCOUNT_ID: "999999"
    }),
    fetchImpl: async (url) => {
      if (url.includes("debug_token")) {
        return {
          status: 200,
          json: async () => ({
            data: {
              is_valid: true,
              scopes: ["whatsapp_business_management", "whatsapp_business_messaging"]
            }
          })
        };
      }
      return {
        status: 400,
        json: async () => ({
          error: {
            code: 100,
            type: "GraphMethodException",
            message: "Unsupported get request."
          }
        })
      };
    }
  });

  assert.equal(diagnostics.phone_number.accessible, false);
  assert.equal(diagnostics.business_account.accessible, false);
  assert.equal(diagnostics.ready_for_meta_send, false);
  assert.equal(diagnostics.ready_for_waba_subscribe, false);
  assert.equal(diagnostics.phone_number.error.code, 100);
});
