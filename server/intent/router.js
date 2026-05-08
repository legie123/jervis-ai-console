/** Stub router.js — placeholder. Full at /TRADE AI/server/intent/router.js */
export const V3_CATEGORIES = Object.freeze(["chat","ide_task","app_open","browser_tab","comm","memory","scheduler","risk","voice","system_status","learning","emergency"]);
export const ACTION_TO_CATEGORY = Object.freeze({
  open_local_app: "app_open", list_local_apps: "app_open",
  open_browser_tab: "browser_tab", focus_browser_tab: "browser_tab", close_browser_tab: "browser_tab", list_browser_tabs: "browser_tab",
  whatsapp_draft: "comm", whatsapp_send: "comm", contact_create: "comm", contact_update: "comm", contact_delete: "comm",
  memory_write: "memory", memory_recall: "memory", obsidian_export: "memory", graphify_proposal: "memory",
  reminder: "scheduler", schedule_overview: "scheduler", calendar_export: "scheduler",
  capability_status: "system_status", time_check: "system_status", mode_change: "system_status",
  text_to_speech: "voice", risk_check: "risk", learning_signal: "learning", plan: "chat",
  open_in_claude_code: "ide_task", open_in_cursor: "ide_task", open_in_antigravity: "ide_task", open_in_vscode: "ide_task", open_codex_task: "ide_task", project_status: "ide_task",
  emergency_stop: "emergency", cancel_mission: "emergency"
});
const M = [
  { action: "emergency_stop", patterns: [/\b(emergency\s+stop|stop\s+all|halt\s+all|oprire\s+de\s+urgenta|stop\s+tot)\b/i] },
  { action: "open_in_claude_code", patterns: [/\bopen\s+(.+?)\s+in\s+claude\s*(code)?\b/i, /\bclaude\s*code\s+(?:on|for)\s+(.+)\b/i], extract: m => ({ project: (m[1]||"").trim() }) },
  { action: "open_in_cursor", patterns: [/\bopen\s+(.+?)\s+in\s+cursor\b/i], extract: m => ({ project: (m[1]||"").trim() }) },
  { action: "open_in_vscode", patterns: [/\bopen\s+(.+?)\s+in\s+(?:vs\s*code|vscode)\b/i], extract: m => ({ project: (m[1]||"").trim() }) },
  { action: "whatsapp_send", patterns: [/\bsend\s+(?:the\s+)?latest\s+whatsapp/i] },
  { action: "whatsapp_draft", patterns: [/\bdraft\s+whatsapp/i] },
  { action: "memory_recall", patterns: [/\bwhere\s+did\s+we\s+leave\s+off\b/i, /\bunde\s+am\s+ramas\b/i] },
  { action: "memory_write", patterns: [/\bremember\b/i, /\bnoteaza\b/i] },
  { action: "list_browser_tabs", patterns: [/\blist\s+browser\s+tabs?\b/i] },
  { action: "list_local_apps", patterns: [/\blist\s+(?:local\s+)?apps?\b/i] },
  { action: "schedule_overview", patterns: [/\bwhat\s+do\s+I\s+have\s+today\b/i, /\bschedule\b/i] },
  { action: "time_check", patterns: [/\bwhat\s+time\b/i] },
  { action: "mode_change", patterns: [/\bmode\s+(briefing|comm|memory|system|all)\b/i], extract: m => ({ mode: m[1] }) },
  { action: "open_local_app", patterns: [/\bopen\s+(.+)$/i, /\bdeschide\s+(.+)$/i], extract: m => ({ name: (m[1]||"").trim() }) }
];
export function routeIntent(text) {
  const t = String(text||"").trim();
  if (!t) return { category: "chat", action: "plan", payload: {}, score: 0, residual: "", matched: null };
  for (const matcher of M) {
    for (const re of matcher.patterns) {
      const m = t.match(re);
      if (m) {
        const action = matcher.action;
        const category = ACTION_TO_CATEGORY[action] || "chat";
        const payload = matcher.extract ? matcher.extract(m) : {};
        return { category, action, payload, score: 0.85, residual: t.replace(m[0], " ").replace(/\s+/g, " ").trim(), matched: m[0] };
      }
    }
  }
  return { category: "chat", action: "plan", payload: { text: t }, score: 0, residual: t, matched: null };
}
export function actionsInCategory(cat) { return Object.entries(ACTION_TO_CATEGORY).filter(([,c]) => c === cat).map(([a]) => a); }
