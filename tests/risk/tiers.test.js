/**
 * tiers.test.js — Phase 3 risk-tier tests
 * Run: node --test tests/risk/tiers.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { riskTier, requiresDoubleConfirm, riskSummary, severity, RISK_TIERS }
  from "../../server/risk/tiers.js";

test("4 tiers defined", () => {
  assert.deepEqual(Object.keys(RISK_TIERS).sort(), ["CRITICAL","HIGH","LOW","MEDIUM"]);
});

test("LOW: list_local_apps", () => {
  assert.equal(riskTier({ action: "list_local_apps" }), "LOW");
  assert.equal(requiresDoubleConfirm("LOW"), false);
});

test("MEDIUM: open_in_claude_code", () => {
  assert.equal(riskTier({ action: "open_in_claude_code", payload: { project: "trade ai" } }), "MEDIUM");
  assert.equal(requiresDoubleConfirm("MEDIUM"), false);
});

test("HIGH: close_browser_tab", () => {
  assert.equal(riskTier({ action: "close_browser_tab" }), "HIGH");
  assert.equal(requiresDoubleConfirm("HIGH"), false);
});

test("CRITICAL: whatsapp_send live without allowlist", () => {
  const t = riskTier({ action: "whatsapp_send", payload: { dry_run: false, recipient_in_allowlist: false } });
  assert.equal(t, "CRITICAL");
  assert.equal(requiresDoubleConfirm(t), true);
});

test("whatsapp_send dry_run -> HIGH (not CRITICAL)", () => {
  const t = riskTier({ action: "whatsapp_send", payload: { dry_run: true } });
  assert.equal(t, "HIGH");
});

test("affects system_settings bumps tier by one", () => {
  const t = riskTier({ action: "memory_write", payload: { affects: "system_settings" } });
  assert.equal(t, "HIGH"); // MEDIUM -> HIGH
});

test("irreversible bumps tier by one (and saturates at CRITICAL)", () => {
  const t1 = riskTier({ action: "list_local_apps", payload: { irreversible: true } });
  assert.equal(t1, "MEDIUM"); // LOW -> MEDIUM

  const t2 = riskTier({ action: "whatsapp_send", payload: { dry_run: false, recipient_in_allowlist: true, irreversible: true } });
  assert.equal(t2, "CRITICAL"); // saturates
});

test("severity numeric ordering", () => {
  assert.ok(severity("LOW") < severity("MEDIUM"));
  assert.ok(severity("MEDIUM") < severity("HIGH"));
  assert.ok(severity("HIGH") < severity("CRITICAL"));
});

test("riskSummary returns full structure for whatsapp_send", () => {
  const s = riskSummary({ action: "whatsapp_send", payload: { dry_run: false, recipient_in_allowlist: false } });
  assert.equal(s.tier, "CRITICAL");
  assert.match(s.headline, /WhatsApp LIVE/);
  assert.equal(s.requiresDoubleConfirm, true);
  assert.equal(s.confirmationToken, "CONFIRM");
});

test("riskSummary for emergency_stop", () => {
  const s = riskSummary({ action: "emergency_stop" });
  assert.equal(s.tier, "CRITICAL");
  assert.match(s.headline, /Oprire totala/i);
});
