/**
 * router.js — JERVIS Native Agent V3 Phase 2
 * Author: Claude (sesiunea 2026-05-05, doctor mode)
 *
 * Intent router. Collapses the 41 existing flat actions into 12 V3 umbrella
 * categories, plus introduces 5 new IDE-related actions and emergency_stop.
 *
 * Pure ESM, zero dependencies. Deterministic. No side effects.
 *
 * Use:
 *   import { routeIntent, ACTION_TO_CATEGORY, V3_CATEGORIES } from "./intent/router.js";
 *   const decision = routeIntent("hey jervis open trade ai in claude code");
 *   // -> { category: "ide_task", action: "open_in_claude_code", payload: { project: "trade ai" }, score, residual }
 *
 * NOT YET WIRED into /api/jarvis/command. Codex will integrate.
 */

export const V3_CATEGORIES = Object.freeze([
  "chat",            // pure conversation, no tool
  "ide_task",        // open project in Claude Code / Cursor / Antigravity / VS Code / Codex
  "app_open",        // local app launch (non-IDE), aliases catalog
  "browser_tab",     // list / open / focus / close browser tab
  "comm",            // WhatsApp draft/send/contact mgmt, email later
  "memory",          // note write/recall, obsidian export, graphify proposal
  "scheduler",       // reminder, calendar import/export, queue ops
  "risk",            // pending action confirm/cancel, risk_check
  "voice",           // TTS, voice mode change
  "system_status",   // health, status, diagnostic, capability_status
  "learning",        // signals, brief, operational learning loop
  "emergency"        // stop_all, halt, cancel_mission
]);

/**
 * Map every legacy action string to its V3 category.
 * Source: 41 intent labels extracted from server/index.js.
 */
export const ACTION_TO_CATEGORY = Object.freeze({
  // app_open
  open_local_app:        "app_open",
  list_local_apps:       "app_open",
  remember_app_alias:    "app_open",
  delete_app_alias:      "app_open",
  open_local_url:        "app_open",

  // browser_tab
  open_browser_tab:      "browser_tab",
  focus_browser_tab:     "browser_tab",
  close_browser_tab:     "browser_tab",
  list_browser_tabs:     "browser_tab",

  // comm
  whatsapp_draft:        "comm",
  whatsapp_send:         "comm",
  whatsapp_web_open:     "comm",
  contact_create:        "comm",
  contact_update:        "comm",
  contact_delete:        "comm",
  whatsapp_inbound:      "comm",
  whatsapp_status:       "comm",

  // memory
  memory_write:          "memory",
  memory_recall:         "memory",
  graphify_proposal:     "memory",
  obsidian_export:       "memory",
  open_obsidian_note:    "memory",
  operational_brief:     "memory",

  // scheduler
  reminder:              "scheduler",
  schedule_overview:     "scheduler",
  calendar_import:       "scheduler",
  calendar_export:       "scheduler",
  due_item_done:         "scheduler",
  due_item_snooze:       "scheduler",
  due_item_reschedule:   "scheduler",

  // system_status
  graphify_status:       "system_status",
  obsidian_status:       "system_status",
  capability_status:     "system_status",
  time_check:            "system_status",
  mode_change:           "system_status",

  // risk
  risk_check:            "risk",
  external_action:       "risk",

  // voice
  text_to_speech:        "voice",

  // learning
  learning_signal:       "learning",

  // chat
  plan:                  "chat",

  // === V3 NEW (not in legacy 41) ===
  open_in_claude_code:   "ide_task",
  open_in_cursor:        "ide_task",
  open_in_antigravity:   "ide_task",
  open_in_vscode:        "ide_task",
  open_codex_task:       "ide_task",
  project_status:        "ide_task",
  emergency_stop:        "emergency",
  cancel_mission:        "emergency",
  halt_all:              "emergency"
});

/**
 * Lightweight regex matchers per action. Order matters: more specific first.
 * Each entry is { action, patterns: RegExp[], extract: (match) => payload }
 *
 * Patterns are case-insensitive; RO + EN supported where useful.
 */
const MATCHERS = [
  // --- emergency (highest priority, must short-circuit) ---
  { action: "emergency_stop",   patterns: [/\b(emergency\s+stop|stop\s+all|stop\s+jervis|halt\s+all|halt\s+now)\b/i, /\boprire\s+de\s+urgenta\b/i, /\bstop\s+tot\b/i] },
  { action: "cancel_mission",   patterns: [/\b(cancel\s+mission|abort\s+mission)\b/i, /\banuleaza\s+misiunea\b/i] },

  // --- ide_task (IDE control — V3 NEW) ---
  { action: "open_in_claude_code",
    patterns: [/\bopen\s+(.+?)\s+in\s+claude\s*(code)?\b/i, /\bclaude\s*code\s+(?:on|for)\s+(.+)\b/i, /\bdeschide\s+(.+?)\s+in\s+claude\s*(code)?\b/i],
    extract: (m) => ({ project: (m[1] || "").trim() }) },
  { action: "open_in_cursor",
    patterns: [/\bopen\s+(.+?)\s+in\s+cursor\b/i, /\bcursor\s+(?:on|for)\s+(.+)\b/i, /\bdeschide\s+(.+?)\s+in\s+cursor\b/i],
    extract: (m) => ({ project: (m[1] || "").trim() }) },
  { action: "open_in_antigravity",
    patterns: [/\bopen\s+(.+?)\s+in\s+antigrav(?:ity)?\b/i, /\bantigrav(?:ity)?\s+(?:on|for)\s+(.+)\b/i],
    extract: (m) => ({ project: (m[1] || "").trim() }) },
  { action: "open_in_vscode",
    patterns: [/\bopen\s+(.+?)\s+in\s+(?:vs\s*code|vscode)\b/i, /\bvs\s*code\s+(?:on|for)\s+(.+)\b/i],
    extract: (m) => ({ project: (m[1] || "").trim() }) },
  { action: "open_codex_task",
    patterns: [/\b(?:codex|open\s+codex)\s+(?:task\s+)?(?:for\s+)?(.+)\b/i, /\bnew\s+codex\s+task\s+(.+)\b/i],
    extract: (m) => ({ task: (m[1] || "").trim() }) },
  { action: "project_status",
    patterns: [/\bproject\s+status\b/i, /\bstatus\s+pe\s+proiect\b/i] },

  // --- comm (WhatsApp + contacts) ---
  { action: "whatsapp_send",
    patterns: [/\bsend\s+(?:the\s+)?latest\s+whatsapp\s+draft\b/i, /\btrimite\s+ultimul\s+draft\s+whatsapp\b/i, /\bwhatsapp\s+send\b/i] },
  { action: "whatsapp_draft",
    patterns: [/\bdraft\s+(?:a\s+)?whatsapp(?:\s+to\s+(.+?))?(?:\s*:\s*(.+))?$/i, /\bdraft\s+whatsapp\s+(.+?)(?::\s*(.+))?$/i],
    extract: (m) => ({ recipient: (m[1] || "").trim(), message: (m[2] || "").trim() }) },
  { action: "whatsapp_web_open",
    patterns: [/\bopen\s+whatsapp\s*(web)?\b/i, /\bdeschide\s+whatsapp\s*(web)?\b/i] },
  { action: "contact_create",   patterns: [/\b(?:add|create|new)\s+contact\b/i, /\b(?:adauga|creaza|nou)\s+contact\b/i] },
  { action: "contact_update",   patterns: [/\b(?:update|edit)\s+contact\b/i, /\bmodifica\s+contact\b/i] },
  { action: "contact_delete",   patterns: [/\b(?:delete|remove)\s+contact\b/i, /\b(?:sterge|elimina)\s+contact\b/i] },

  // --- scheduler ---
  { action: "schedule_overview",patterns: [/\bwhat\s+do\s+I\s+have\s+today\b/i, /\bschedule\s+(today|overview|queue)\b/i, /\bce\s+am\s+azi\b/i] },
  { action: "calendar_export",  patterns: [/\bexport\s+calendar\b/i, /\bexport\s+ics\b/i] },
  { action: "calendar_import",  patterns: [/\bimport\s+calendar\b/i, /\bimport\s+ics\b/i] },
  { action: "reminder",         patterns: [/\b(remind\s+me|reminder)\b/i, /\bamintestemi\b/i, /\bseteaza\s+reminder\b/i] },
  { action: "due_item_done",    patterns: [/\bmark\s+done\b/i, /\bgata\s+cu\b/i] },
  { action: "due_item_snooze",  patterns: [/\bsnooze\b/i, /\bamana\b/i] },
  { action: "due_item_reschedule", patterns: [/\breschedule\b/i, /\breprogrameaza\b/i] },

  // --- memory ---
  { action: "memory_write",     patterns: [/\bremember\s+(?:that|this|note)\b/i, /\bnoteaza\b/i, /\btine\s+minte\b/i] },
  { action: "memory_recall",    patterns: [/\bwhere\s+did\s+we\s+leave\s+off\b/i, /\brecall\b/i, /\bunde\s+am\s+ramas\b/i] },
  { action: "open_obsidian_note", patterns: [/\bopen\s+(?:obsidian\s+)?note\s+(.+)\b/i, /\bdeschide\s+nota\s+(.+)\b/i],
    extract: (m) => ({ note: (m[1] || "").trim() }) },
  { action: "obsidian_export",  patterns: [/\bobsidian\s+export\b/i, /\bsync\s+obsidian\b/i] },
  { action: "graphify_proposal",patterns: [/\bgraphify\s+(propose|proposal|edge|node)\b/i] },
  { action: "operational_brief",patterns: [/\boperational\s+brief\b/i, /\bbrief\s+today\b/i, /\bmorning\s+brief\b/i] },

  // --- browser_tab ---
  { action: "list_browser_tabs",patterns: [/\blist\s+browser\s+tabs?\b/i, /\bshow\s+(?:open\s+)?tabs?\b/i] },
  { action: "focus_browser_tab",patterns: [/\bfocus\s+(?:tab\s+)?(.+)\b/i],
    extract: (m) => ({ query: (m[1] || "").trim() }) },
  { action: "close_browser_tab",patterns: [/\bclose\s+(?:tab\s+)?(.+)\b/i],
    extract: (m) => ({ query: (m[1] || "").trim() }) },
  { action: "open_browser_tab", patterns: [/\bopen\s+(?:tab\s+)?(?:url\s+)?(https?:\/\/\S+)/i, /\bopen\s+localhost(?::\d+)?\b/i],
    extract: (m) => ({ url: (m[1] || "").trim() }) },

  // --- app_open ---
  { action: "list_local_apps",  patterns: [/\blist\s+(?:local\s+)?apps?\b/i, /\bshow\s+apps?\b/i] },
  { action: "remember_app_alias",patterns: [/\bremember\s+(?:app\s+)?alias\s+(.+?)\s+for\s+(.+)\b/i],
    extract: (m) => ({ alias: (m[1] || "").trim(), app_name: (m[2] || "").trim() }) },
  { action: "delete_app_alias", patterns: [/\bdelete\s+alias\s+(.+)\b/i, /\bsterge\s+alias\s+(.+)\b/i],
    extract: (m) => ({ alias: (m[1] || "").trim() }) },
  { action: "open_local_url",   patterns: [/\bopen\s+(https?:\/\/\S+)/i],
    extract: (m) => ({ url: (m[1] || "").trim() }) },
  { action: "open_local_app",   patterns: [/\bopen\s+(.+)$/i, /\bdeschide\s+(.+)$/i, /\blaunch\s+(.+)$/i],
    extract: (m) => ({ name: (m[1] || "").trim() }) },

  // --- voice ---
  { action: "text_to_speech",   patterns: [/\btest\s+elevenlabs\b/i, /\btts\b/i, /\bspune\b/i] },

  // --- system_status ---
  { action: "graphify_status",  patterns: [/\bgraphify\s+status\b/i] },
  { action: "obsidian_status",  patterns: [/\bobsidian\s+status\b/i] },
  { action: "capability_status",patterns: [/\bcapability\s+status\b/i, /\bce\s+poti\s+sa\s+faci\b/i] },
  { action: "time_check",       patterns: [/\bwhat\s+time\b/i, /\bcat\s+e\s+ceasul\b/i] },
  { action: "mode_change",      patterns: [/\bmode\s+(briefing|comm|memory|system|all)\b/i],
    extract: (m) => ({ mode: (m[1] || "").trim() }) },

  // --- risk ---
  { action: "risk_check",       patterns: [/\brun\s+risk\s+check\b/i, /\briscul\b/i] },

  // --- learning ---
  { action: "learning_signal",  patterns: [/\b(?:i\s+(?:like|prefer|don't\s+like)|teach|learn|preference)\b/i] }
];

/**
 * Score a transcript against an action's patterns. Returns the best regex
 * match payload + score (1.0 perfect, 0.0 none).
 */
function scoreMatcher(transcript, matcher) {
  for (const re of matcher.patterns) {
    const m = transcript.match(re);
    if (m) {
      const span = (m[0] || "").length;
      const score = Math.min(1, 0.6 + span / Math.max(transcript.length, 1));
      const payload = matcher.extract ? matcher.extract(m) : {};
      return { score, payload, match: m[0] };
    }
  }
  return null;
}

/**
 * Public entrypoint. Routes a free-text user transcript to a V3 decision.
 *
 * @param {string} text raw user input
 * @returns {{
 *   category: string,
 *   action: string,
 *   payload: object,
 *   score: number,
 *   residual: string,
 *   matched: string|null
 * }}
 */
export function routeIntent(text) {
  const transcript = String(text || "").trim();
  if (!transcript) {
    return {
      category: "chat",
      action: "plan",
      payload: { text: "" },
      score: 0,
      residual: "",
      matched: null
    };
  }

  let best = { matcher: null, score: 0, payload: {}, match: null };
  for (const matcher of MATCHERS) {
    const result = scoreMatcher(transcript, matcher);
    if (result && result.score > best.score) {
      best = { matcher, ...result };
    }
  }

  if (!best.matcher) {
    return {
      category: "chat",
      action: "plan",
      payload: { text: transcript },
      score: 0,
      residual: transcript,
      matched: null
    };
  }

  const action = best.matcher.action;
  const category = ACTION_TO_CATEGORY[action] || "chat";
  const matched = best.match || "";
  const residual = transcript.replace(matched, " ").replace(/\s+/g, " ").trim();

  return {
    category,
    action,
    payload: best.payload || {},
    score: best.score,
    residual,
    matched: matched || null
  };
}

/**
 * Inverse mapping: list all actions in a given category.
 */
export function actionsInCategory(category) {
  return Object.entries(ACTION_TO_CATEGORY)
    .filter(([, cat]) => cat === category)
    .map(([act]) => act);
}

export default {
  V3_CATEGORIES,
  ACTION_TO_CATEGORY,
  routeIntent,
  actionsInCategory
};
