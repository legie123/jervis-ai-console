/**
 * router.test.js — Phase 2 intent router tests
 * Run: node --test tests/intent/router.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { routeIntent, V3_CATEGORIES, ACTION_TO_CATEGORY, actionsInCategory }
  from "../../server/intent/router.js";

test("12 V3 categories defined", () => {
  assert.equal(V3_CATEGORIES.length, 12);
  assert.ok(V3_CATEGORIES.includes("ide_task"));
  assert.ok(V3_CATEGORIES.includes("emergency"));
});

test("every action maps to a known category", () => {
  for (const [, cat] of Object.entries(ACTION_TO_CATEGORY)) {
    assert.ok(V3_CATEGORIES.includes(cat), `${cat} unknown`);
  }
});

test("empty input -> chat:plan", () => {
  const r = routeIntent("");
  assert.equal(r.category, "chat");
  assert.equal(r.action, "plan");
});

test("'open Trade AI in Claude Code' -> ide_task:open_in_claude_code", () => {
  const r = routeIntent("open Trade AI in Claude Code");
  assert.equal(r.category, "ide_task");
  assert.equal(r.action, "open_in_claude_code");
  assert.equal(r.payload.project.toLowerCase(), "trade ai");
});

test("'open jervis in cursor' -> ide_task:open_in_cursor", () => {
  const r = routeIntent("open jervis in cursor");
  assert.equal(r.action, "open_in_cursor");
  assert.equal(r.payload.project, "jervis");
});

test("'send latest whatsapp draft' -> comm:whatsapp_send", () => {
  const r = routeIntent("send latest whatsapp draft");
  assert.equal(r.category, "comm");
  assert.equal(r.action, "whatsapp_send");
});

test("'draft whatsapp Andrei: revin' -> comm:whatsapp_draft", () => {
  const r = routeIntent("draft whatsapp Andrei: revin");
  assert.equal(r.action, "whatsapp_draft");
  assert.equal(r.payload.recipient.toLowerCase(), "andrei");
  assert.match(r.payload.message, /revin/i);
});

test("'where did we leave off' -> memory:memory_recall", () => {
  const r = routeIntent("where did we leave off?");
  assert.equal(r.category, "memory");
  assert.equal(r.action, "memory_recall");
});

test("'list browser tabs' -> browser_tab:list_browser_tabs", () => {
  const r = routeIntent("list browser tabs");
  assert.equal(r.category, "browser_tab");
  assert.equal(r.action, "list_browser_tabs");
});

test("'list local apps' -> app_open:list_local_apps", () => {
  const r = routeIntent("list local apps");
  assert.equal(r.action, "list_local_apps");
});

test("'remember app alias dragon for Obsidian' -> app_open:remember_app_alias", () => {
  const r = routeIntent("remember app alias dragon for Obsidian");
  assert.equal(r.action, "remember_app_alias");
  assert.equal(r.payload.alias, "dragon");
  assert.equal(r.payload.app_name, "Obsidian");
});

test("'what time is it' -> system_status:time_check", () => {
  const r = routeIntent("what time is it");
  assert.equal(r.category, "system_status");
  assert.equal(r.action, "time_check");
});

test("'emergency stop' -> emergency:emergency_stop", () => {
  const r = routeIntent("emergency stop");
  assert.equal(r.category, "emergency");
  assert.equal(r.action, "emergency_stop");
});

test("'oprire de urgenta' (RO) -> emergency:emergency_stop", () => {
  const r = routeIntent("oprire de urgenta");
  assert.equal(r.action, "emergency_stop");
});

test("'cancel mission' -> emergency:cancel_mission", () => {
  const r = routeIntent("cancel mission");
  assert.equal(r.action, "cancel_mission");
});

test("'mode comm' -> system_status:mode_change", () => {
  const r = routeIntent("mode comm");
  assert.equal(r.action, "mode_change");
  assert.equal(r.payload.mode, "comm");
});

test("'export calendar' -> scheduler:calendar_export", () => {
  const r = routeIntent("export calendar upcoming");
  assert.equal(r.action, "calendar_export");
});

test("free chat fallback to chat:plan", () => {
  const r = routeIntent("ce mai faci?");
  assert.equal(r.category, "chat");
  assert.equal(r.action, "plan");
});

test("actionsInCategory returns matching actions", () => {
  const ide = actionsInCategory("ide_task");
  assert.ok(ide.includes("open_in_claude_code"));
  assert.ok(ide.includes("open_in_cursor"));
  assert.ok(ide.includes("open_codex_task"));
});
