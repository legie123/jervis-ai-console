/** Stub tiers.js — placeholder. Full at /TRADE AI/server/risk/tiers.js */
export const RISK_TIERS = Object.freeze({ LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", CRITICAL: "CRITICAL" });
const ST = {
  list_local_apps:"LOW", list_browser_tabs:"LOW", schedule_overview:"LOW", memory_recall:"LOW", capability_status:"LOW", time_check:"LOW", risk_check:"LOW", project_status:"LOW", plan:"LOW", learning_signal:"LOW", mode_change:"LOW",
  open_local_app:"MEDIUM", open_browser_tab:"MEDIUM", focus_browser_tab:"MEDIUM", text_to_speech:"MEDIUM", reminder:"MEDIUM", memory_write:"MEDIUM", whatsapp_draft:"MEDIUM", contact_create:"MEDIUM", contact_update:"MEDIUM",
  open_in_claude_code:"MEDIUM", open_in_cursor:"MEDIUM", open_in_antigravity:"MEDIUM", open_in_vscode:"MEDIUM", obsidian_export:"MEDIUM", graphify_proposal:"MEDIUM", calendar_export:"MEDIUM", calendar_import:"MEDIUM",
  close_browser_tab:"HIGH", open_codex_task:"HIGH", external_action:"HIGH",
  whatsapp_send:"CRITICAL", contact_delete:"CRITICAL", emergency_stop:"CRITICAL", cancel_mission:"CRITICAL"
};
function bump(t) { const o = ["LOW","MEDIUM","HIGH","CRITICAL"]; const i = o.indexOf(t); return i < 3 ? o[i+1] : "CRITICAL"; }
export function riskTier({ action, payload = {} } = {}) {
  let t = ST[action] || "MEDIUM";
  if (action === "whatsapp_send" && payload.dry_run === true) t = "HIGH";
  if (action === "whatsapp_send" && payload.dry_run === false && payload.recipient_in_allowlist !== true) t = "CRITICAL";
  if (payload.affects === "system_settings") t = bump(t);
  if (payload.irreversible === true) t = bump(t);
  return t;
}
export function requiresDoubleConfirm(t) { return t === "CRITICAL"; }
export function riskSummary({ action, payload = {}, tier }) {
  const t = tier || riskTier({ action, payload });
  return { tier: t, headline: `Acțiune ${action} clasificată ${t}`, details: [], requiresDoubleConfirm: requiresDoubleConfirm(t), confirmationToken: t === "CRITICAL" ? "CONFIRM" : "" };
}
export function severity(t) { return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[t] || 2; }
