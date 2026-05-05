/**
 * tiers.js — JERVIS Native Agent V3 Phase 3
 * Author: Claude (sesiunea 2026-05-05, doctor mode)
 *
 * 4-tier risk taxonomy + double-confirm gating.
 * Replaces the legacy binary `direct_ok` / `confirmation_required` scheme.
 *
 * Pure ESM. Zero deps. Deterministic.
 *
 * Use:
 *   import { riskTier, requiresDoubleConfirm, riskSummary, RISK_TIERS } from "./risk/tiers.js";
 *   const tier = riskTier({ action: "whatsapp_send", payload: { dry_run: false }});
 *   if (requiresDoubleConfirm(tier)) renderTwoStepGate();
 *
 * NOT YET WIRED into pendingAction flow. Codex will integrate.
 */

export const RISK_TIERS = Object.freeze({
  LOW:      "LOW",       // read-only, status, list, recall
  MEDIUM:   "MEDIUM",    // non-destructive write, app launch, draft
  HIGH:     "HIGH",      // external send (drafted), file write, alias mutate
  CRITICAL: "CRITICAL"   // live external send, delete, money, account, install
});

/**
 * Static action → tier baseline. Payload-aware overrides applied in riskTier().
 */
const STATIC_TIER = Object.freeze({
  // === LOW ===
  list_local_apps:        "LOW",
  list_browser_tabs:      "LOW",
  schedule_overview:      "LOW",
  memory_recall:          "LOW",
  capability_status:      "LOW",
  graphify_status:        "LOW",
  obsidian_status:        "LOW",
  time_check:             "LOW",
  operational_brief:      "LOW",
  risk_check:             "LOW",
  project_status:         "LOW",
  whatsapp_status:        "LOW",
  plan:                   "LOW",
  learning_signal:        "LOW",
  mode_change:            "LOW",

  // === MEDIUM ===
  open_local_app:         "MEDIUM",
  open_local_url:         "MEDIUM",
  open_obsidian_note:     "MEDIUM",
  open_browser_tab:       "MEDIUM",
  focus_browser_tab:      "MEDIUM",
  whatsapp_web_open:      "MEDIUM",
  text_to_speech:         "MEDIUM",
  reminder:               "MEDIUM",
  due_item_snooze:        "MEDIUM",
  due_item_reschedule:    "MEDIUM",
  due_item_done:          "MEDIUM",
  memory_write:           "MEDIUM",
  remember_app_alias:     "MEDIUM",
  open_in_claude_code:    "MEDIUM",
  open_in_cursor:         "MEDIUM",
  open_in_antigravity:    "MEDIUM",
  open_in_vscode:         "MEDIUM",
  whatsapp_draft:         "MEDIUM",
  contact_create:         "MEDIUM",
  contact_update:         "MEDIUM",
  graphify_proposal:      "MEDIUM",
  obsidian_export:        "MEDIUM",
  calendar_export:        "MEDIUM",
  calendar_import:        "MEDIUM",
  whatsapp_inbound:       "MEDIUM",

  // === HIGH ===
  close_browser_tab:      "HIGH",     // closes user state
  delete_app_alias:       "HIGH",
  open_codex_task:        "HIGH",     // can spawn agentic external work
  external_action:        "HIGH",

  // === CRITICAL ===
  whatsapp_send:          "CRITICAL", // live external comm (default)
  contact_delete:         "CRITICAL",
  emergency_stop:         "CRITICAL", // operator-initiated; still gated by double-confirm if not voice-fast-path
  cancel_mission:         "CRITICAL",
  halt_all:               "CRITICAL"
});

/**
 * Resolve the effective tier for a request.
 * Honors payload overrides:
 *   - whatsapp_send + payload.dry_run === true  -> HIGH (instead of CRITICAL)
 *   - whatsapp_send + payload.recipient_in_allowlist !== true -> CRITICAL (lock)
 *   - any action + payload.affects === "system_settings" -> bumps tier by one
 *   - emergency_stop via voice "fast path" stays CRITICAL but with override flag
 */
export function riskTier({ action, payload = {} } = {}) {
  let tier = STATIC_TIER[action] || "MEDIUM";

  // dry-run reduces severity for messaging
  if (action === "whatsapp_send" && payload.dry_run === true) {
    tier = "HIGH";
  }
  // explicit live send without allowlist bumps to CRITICAL (default keeps it CRITICAL anyway)
  if (action === "whatsapp_send" && payload.dry_run === false && payload.recipient_in_allowlist !== true) {
    tier = "CRITICAL";
  }
  // bumps for affects flag
  if (payload.affects === "system_settings") {
    tier = bumpTier(tier);
  }
  // bumps for irreversible flag
  if (payload.irreversible === true) {
    tier = bumpTier(tier);
  }

  return tier;
}

function bumpTier(t) {
  const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const i = order.indexOf(t);
  return i < order.length - 1 ? order[i + 1] : "CRITICAL";
}

/**
 * CRITICAL actions (and any tier the operator wants to harden) require a
 * second explicit confirmation step beyond the standard token.
 */
export function requiresDoubleConfirm(tier) {
  return tier === "CRITICAL";
}

/**
 * One-line summary the UI renders alongside the pending-action card.
 */
export function riskSummary({ action, payload = {}, tier }) {
  const t = tier || riskTier({ action, payload });
  const pieces = [];

  switch (action) {
    case "whatsapp_send":
      if (payload.dry_run === false) pieces.push("Trimite WhatsApp LIVE către un destinatar real");
      else pieces.push("Trimite WhatsApp în mod dry-run");
      if (payload.recipient_in_allowlist !== true) pieces.push("destinatarul NU este în allowlist");
      break;
    case "contact_delete":
      pieces.push("Șterge un contact din allowlist (ireversibil fără backup)");
      break;
    case "delete_app_alias":
      pieces.push("Șterge un alias învățat");
      break;
    case "close_browser_tab":
      pieces.push("Închide un tab al userului — pierdere stare neînregistrată");
      break;
    case "emergency_stop":
    case "halt_all":
    case "cancel_mission":
      pieces.push("Oprire totală a tuturor acțiunilor în curs");
      break;
    case "open_codex_task":
      pieces.push("Lansează un task agentic extern (Codex) cu acces de modificare");
      break;
    case "external_action":
      pieces.push("Acțiune externă cu efect asupra unui sistem terț");
      break;
    default:
      pieces.push(`Acțiune ${action} clasificată ${t}`);
  }

  if (payload.affects === "system_settings") pieces.push("afectează setările sistemului");
  if (payload.irreversible === true) pieces.push("IREVERSIBIL");

  return {
    tier: t,
    headline: pieces[0] || `Acțiune ${action}`,
    details: pieces.slice(1),
    requiresDoubleConfirm: requiresDoubleConfirm(t),
    confirmationToken: t === "CRITICAL" ? "CONFIRM" : ""
  };
}

/**
 * Helper for audit log entries — returns numeric severity for sorting/dashboards.
 */
export function severity(tier) {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[tier] || 2;
}

export default {
  RISK_TIERS,
  riskTier,
  requiresDoubleConfirm,
  riskSummary,
  severity
};
