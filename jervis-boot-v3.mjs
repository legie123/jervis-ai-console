#!/usr/bin/env node
/**
 * jervis-boot-v3.mjs — JERVIS V3 companion supervisor
 * Author: claude-coder (sesiunea 2026-05-06)
 *
 * Wires V3 modules into a separate HTTP supervisor on port 7778:
 *   - server/state/agentState.js      (FSM 10 states)
 *   - server/intent/router.js         (Intent Router 12 categories)
 *   - server/risk/tiers.js            (4-tier risk + double-confirm)
 *   - server/emergency/stopAll.js     (Emergency stop + voice triggers)
 *   - server/audit/log.js             (Structured 10-field audit)
 *   - server/ide/index.js + routes    (IDE Layer: Claude Code/Cursor/Antigravity/VS Code/Codex)
 *   - server/comm/email/index.js      (Email pipeline + risk gates)
 *   - server/graphify/index.js        (Mission graph emitter)
 *   - server/lib/{logger,sensors,transporter,database}.js
 *
 * Does NOT touch jervis-boot.mjs (Codex territory). Runs alongside on :7778.
 *
 * HTTP API on :7778:
 *   GET  /                          status snapshot
 *   GET  /fsm                       FSM state + history
 *   POST /fsm/transition            { to, reason, event }
 *   POST /intent                    { text }                     -> route decision
 *   POST /risk                      { action, payload }          -> tier + summary
 *   POST /emergency/stop            { reason, source }           -> halt all
 *   GET  /audit                     ?limit=50&eventType=...
 *   GET  /audit/summary
 *   POST /ide/<action>              { project, task? }
 *   POST /email/draft               { to, subject, body, project? }
 *   POST /email/send                { draftId, dry_run, confirmation_token }
 *   POST /graph/mission             { mission, project, tools, files, result, person }
 *   GET  /graph/summary
 *   POST /graph/export              -> writes Obsidian notes
 *
 * Run:  node jervis-boot-v3.mjs
 * Port: process.env.JERVIS_V3_PORT or 7778
 */

import http from "node:http";
import os from "node:os";

import * as fsm        from "./server/state/agentState.js";
import * as intent     from "./server/intent/router.js";
import * as risk       from "./server/risk/tiers.js";
import * as emergency  from "./server/emergency/stopAll.js";
import * as audit      from "./server/audit/log.js";
import { IDE_REGISTRY } from "./server/ide/index.js";
import { handleIdeRoute } from "./server/ide/routes.mjs";
import * as email      from "./server/comm/email/index.js";
import * as graph      from "./server/graphify/index.js";
import { createLogger } from "./server/lib/logger.js";

const PORT = Number(process.env.JERVIS_V3_PORT || 7778);
const SESSION_ID = `jervisv3_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const STARDATE = (() => {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  return `${now.getFullYear() - 1947}${String(dayOfYear).padStart(3, "0")}.${now.getHours()}`;
})();

const logger = createLogger({
  ringLimit: 80,
  onRecord: (r) => {
    audit.appendEvent({
      eventType: "boot",
      action: `log_${r.level}`,
      result: "ok",
      meta: { mod: r.mod, msg: String(r.msg).slice(0, 200) }
    });
  }
});
const log = logger.log;

/* ============================================================
   STATUS SNAPSHOT
   ============================================================ */

function statusPayload() {
  return {
    sessionId: SESSION_ID,
    stardate: STARDATE,
    boot: "v3",
    port: PORT,
    fsm: fsm.getState(),
    audit: audit.summary(),
    graph: graph.summary(),
    ide: { actions: Object.keys(IDE_REGISTRY) },
    email: email.configSnapshot(),
    emergency: { stoppables: emergency.listStoppables(), recentStops: emergency.history().slice(-3) },
    intent: { categories: intent.V3_CATEGORIES },
    risk: { tiers: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
    process: { node: process.version, platform: os.platform(), pid: process.pid, uptimeSec: Math.floor(process.uptime()) }
  };
}

/* ============================================================
   HTTP HANDLERS
   ============================================================ */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 64 * 1024) reject(new Error("body too large")); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(JSON.stringify(payload, null, 2));
}

async function parseJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (err) { throw Object.assign(new Error(`bad JSON: ${err.message}`), { http: 400 }); }
}

/* ============================================================
   ROUTER
   ============================================================ */

async function route(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const m = req.method;

  try {
    if ((p === "/" || p === "/status") && m === "GET") return send(res, 200, statusPayload());

    // FSM
    if (p === "/fsm" && m === "GET") return send(res, 200, { ...fsm.getState(), history: fsm.getHistory().slice(-12) });
    if (p === "/fsm/transition" && m === "POST") {
      const body = await parseJson(req);
      const result = fsm.transition(body.to, { reason: body.reason, event: body.event, ...body });
      audit.appendEvent({ eventType: "fsm_transition", action: `${result.from || "?"}->${body.to}`, result: result.ok ? "ok" : "blocked", error: result.error });
      return send(res, result.ok ? 200 : 400, result);
    }

    // INTENT
    if (p === "/intent" && m === "POST") {
      const body = await parseJson(req);
      const r = intent.routeIntent(body.text || "");
      audit.appendEvent({ eventType: "intent", action: r.action, intent: r.category, payload: body, result: "ok" });
      return send(res, 200, r);
    }

    // RISK
    if (p === "/risk" && m === "POST") {
      const body = await parseJson(req);
      const tier = risk.riskTier({ action: body.action, payload: body.payload });
      const sum = risk.riskSummary({ action: body.action, payload: body.payload, tier });
      return send(res, 200, sum);
    }

    // EMERGENCY
    if (p === "/emergency/stop" && m === "POST") {
      const body = await parseJson(req);
      const r = await emergency.stopAll({ reason: body.reason || "api", source: body.source || "http" });
      audit.appendEvent({ eventType: "emergency", action: "stop_all", result: r.ok ? "ok" : "failed", riskLevel: "CRITICAL", meta: { hooksRan: r.ranHooks?.length, errors: r.errors?.length } });
      return send(res, 200, r);
    }

    // AUDIT
    if (p === "/audit" && m === "GET") {
      const filter = {
        eventType: url.searchParams.get("eventType") || undefined,
        action:    url.searchParams.get("action")    || undefined,
        riskLevel: url.searchParams.get("riskLevel") || undefined,
        result:    url.searchParams.get("result")    || undefined,
        limit: Number(url.searchParams.get("limit") || 50)
      };
      return send(res, 200, audit.query(filter));
    }
    if (p === "/audit/summary" && m === "GET") return send(res, 200, audit.summary());

    // IDE — delegate
    if (p.startsWith("/api/ide/") || p.startsWith("/ide/")) {
      // normalize /ide/* to /api/ide/* for the existing handler
      if (p.startsWith("/ide/")) req.url = "/api/ide/" + p.slice(5) + url.search;
      const handled = await handleIdeRoute(req, res);
      if (handled) return;
    }

    // EMAIL
    if (p === "/email/draft" && m === "POST") {
      const body = await parseJson(req);
      try {
        const r = email.draftEmail(body);
        return send(res, 200, r);
      } catch (err) { return send(res, 400, { ok: false, error: err.message }); }
    }
    if (p === "/email/send" && m === "POST") {
      const body = await parseJson(req);
      const r = await email.sendEmail(body.draftId, body);
      return send(res, r.ok ? 200 : 400, r);
    }
    if (p === "/email/list" && m === "GET") {
      return send(res, 200, email.listDrafts({ status: url.searchParams.get("status") || undefined, limit: Number(url.searchParams.get("limit") || 20) }));
    }

    // GRAPH
    if (p === "/graph/mission" && m === "POST") {
      const body = await parseJson(req);
      const r = graph.emitMission(body);
      return send(res, 200, r);
    }
    if (p === "/graph/summary" && m === "GET") return send(res, 200, graph.summary());
    if (p === "/graph/export" && m === "POST") {
      const r = await graph.exportObsidian();
      return send(res, r.ok ? 200 : 400, r);
    }

    // 404
    send(res, 404, {
      error: "not found",
      endpoints: [
        "GET /", "GET /status",
        "GET /fsm", "POST /fsm/transition",
        "POST /intent", "POST /risk",
        "POST /emergency/stop",
        "GET /audit", "GET /audit/summary",
        "POST /ide/<action>",
        "POST /email/draft", "POST /email/send", "GET /email/list",
        "POST /graph/mission", "GET /graph/summary", "POST /graph/export"
      ]
    });
  } catch (err) {
    audit.appendEvent({ eventType: "error", action: p, result: "failed", error: err.message });
    send(res, err.http || 500, { ok: false, error: err.message });
  }
}

/* ============================================================
   STARTUP + STOPPABLE REGISTRATION
   ============================================================ */

const server = http.createServer((req, res) => { route(req, res).catch(() => {}); });

emergency.registerStoppable("http_v3", () => {
  return new Promise((resolve) => server.close(resolve));
});
emergency.registerStoppable("email_drafts_quiesce", () => {
  // future: cancel any in-flight scheduler
});

server.listen(PORT, () => {
  console.log(`\n\x1b[38;5;208m╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║       JERVIS V3 SUPERVISOR · port ${String(PORT).padEnd(5)}                 ║`);
  console.log(`║       session ${SESSION_ID.padEnd(40)}      ║`);
  console.log(`║       stardate ${STARDATE.padEnd(40)}     ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\x1b[0m\n`);

  log("mod", "WarpCoreV3", `node ${process.version} on ${os.platform()} ${os.arch()}`);
  log("ok", "FSM",        `state machine ready: ${fsm.STATES.length} states, ${fsm.EVENTS.length} events`);
  log("ok", "Intent",     `${intent.V3_CATEGORIES.length} V3 categories, ${Object.keys(intent.ACTION_TO_CATEGORY).length} actions mapped`);
  log("ok", "Risk",       `4-tier taxonomy LOW/MEDIUM/HIGH/CRITICAL`);
  log("ok", "Emergency",  `${emergency.VOICE_TRIGGERS.length} voice triggers, ${emergency.listStoppables().length} stoppables registered`);
  log("ok", "Audit",      `${audit.EVENT_TYPES.length} event types, JSONL persist enabled`);
  log("ok", "IDE",        `${Object.keys(IDE_REGISTRY).length} actions: ${Object.keys(IDE_REGISTRY).join(", ")}`);
  log("ok", "Email",      `${email.configSnapshot().transportName} transport, dry-run default`);
  log("ok", "Graphify",   `${graph.NODE_TYPES.length} node types, ${graph.EDGE_TYPES.length} edge types`);

  audit.appendEvent({ eventType: "boot", action: "supervisor_v3_started", result: "ok", meta: { sessionId: SESSION_ID, stardate: STARDATE, port: PORT } });

  fsm.transition("STANDBY", { reason: "boot_complete", event: "init" });

  console.log(`\n\x1b[36m► Status:    \x1b[0mhttp://localhost:${PORT}/status`);
  console.log(`\x1b[36m► FSM:       \x1b[0mhttp://localhost:${PORT}/fsm`);
  console.log(`\x1b[36m► Audit:     \x1b[0mhttp://localhost:${PORT}/audit`);
  console.log(`\x1b[36m► IDE:       \x1b[0mPOST http://localhost:${PORT}/ide/open_in_cursor  (body: {project: "trade ai"})`);
  console.log(`\x1b[36m► Emergency: \x1b[0mPOST http://localhost:${PORT}/emergency/stop  {reason: "operator"}`);
  console.log(`\x1b[2m\n  (Ctrl+C to shut down)\x1b[0m\n`);
});

/* ============================================================
   SHUTDOWN
   ============================================================ */

async function shutdown(sig) {
  console.log(`\n\x1b[33m── ${sig} received — graceful shutdown\x1b[0m`);
  audit.appendEvent({ eventType: "shutdown", action: "supervisor_v3_stop", result: "ok", meta: { sig } });
  await emergency.stopAll({ reason: `signal:${sig}`, source: "process" });
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
