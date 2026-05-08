/**
 * server/audit/log.js — JERVIS V3 Phase 7
 * Author: claude-coder (sesiunea 2026-05-06)
 *
 * Structured audit log with 10 mandatory fields per event.
 * JSONL append-only persistence + in-memory ring buffer for fast queries.
 * Pure ESM, deps only on node built-ins.
 *
 * Fields per event:
 *   ts            ISO8601 timestamp
 *   sessionId     active session identifier
 *   agentId       which agent recorded (claude-coder, codex-reviewer, etc.)
 *   eventType     one of EVENT_TYPES
 *   intent        intent label (from intent router) or "" if not applicable
 *   action        the executed action (from intent router or tool name)
 *   riskLevel     LOW / MEDIUM / HIGH / CRITICAL or NONE
 *   payloadHash   sha256 of stringified payload (no payload secrets in log)
 *   result        ok | failed | cancelled | confirmed | declined
 *   durationMs    execution duration (number)
 *
 * Optional fields:
 *   error, rollback_path, confirmation_status, source, project, ip, user
 *
 * Use:
 *   import { appendEvent, query, summary } from "./audit/log.js";
 *   appendEvent({ eventType: "tool", action: "open_in_cursor", riskLevel: "MEDIUM", ... });
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";

export const EVENT_TYPES = Object.freeze([
  "boot",
  "shutdown",
  "intent",
  "tool",
  "voice",
  "scheduler",
  "comm",          // WhatsApp / email
  "memory",
  "shield",        // injection blocked / aidefence
  "emergency",
  "error",
  "fsm_transition",
  "ide",
  "permission",    // gate confirmed / cancelled
  "session"
]);

export const RESULT_STATES = Object.freeze([
  "ok",
  "failed",
  "cancelled",
  "confirmed",
  "declined",
  "pending",
  "blocked"
]);

const BUFFER_LIMIT = 256;
const _buffer = [];
let _writer = null;

/* ============================================================
   CONFIGURATION
   ============================================================ */

let _config = {
  logDir: process.env.JERVIS_AUDIT_DIR || path.join(process.cwd(), "data"),
  rotate: "daily",   // currently only daily; year-month-day jsonl
  fsync: false,
  enabled: true,
  payloadHashAlg: "sha256"
};

export function configure(opts = {}) {
  _config = { ..._config, ...opts };
}

/* ============================================================
   HASH HELPERS
   ============================================================ */

function payloadHash(payload) {
  if (payload == null) return "";
  let s;
  try { s = typeof payload === "string" ? payload : JSON.stringify(payload); }
  catch { s = String(payload); }
  return createHash(_config.payloadHashAlg).update(s).digest("hex").slice(0, 16);
}

/* ============================================================
   PERSISTENCE
   ============================================================ */

function currentLogPath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(_config.logDir, `audit-${date}.jsonl`);
}

async function ensureDir() {
  try { await fs.mkdir(_config.logDir, { recursive: true }); } catch {}
}

async function persist(line) {
  if (!_config.enabled) return;
  await ensureDir();
  const file = currentLogPath();
  await fs.appendFile(file, line + "\n");
}

/* ============================================================
   PUBLIC API
   ============================================================ */

/**
 * Record an event. Returns the normalized record. Best-effort persistence.
 *
 * @param {object} input
 * @param {string} input.eventType      required
 * @param {string} [input.action]       e.g. "open_in_cursor"
 * @param {string} [input.intent]
 * @param {string} [input.riskLevel]    LOW/MEDIUM/HIGH/CRITICAL/NONE
 * @param {string} [input.result]       ok/failed/cancelled/...
 * @param {number} [input.durationMs]
 * @param {object} [input.payload]      hashed; not stored verbatim
 * @param {string} [input.sessionId]
 * @param {string} [input.agentId]
 * @param {string} [input.error]
 * @param {string} [input.rollbackPath]
 * @param {object} [input.meta]         free-form structured data (stored)
 */
export function appendEvent(input = {}) {
  if (!input.eventType) throw new Error("audit: eventType required");

  const record = {
    ts: new Date().toISOString(),
    sessionId: input.sessionId || process.env.JERVIS_SESSION_ID || "",
    agentId: input.agentId || "claude-coder",
    eventType: input.eventType,
    intent: input.intent || "",
    action: input.action || "",
    riskLevel: input.riskLevel || "NONE",
    payloadHash: payloadHash(input.payload),
    result: input.result || "ok",
    durationMs: typeof input.durationMs === "number" ? input.durationMs : 0
  };

  // Optional fields
  if (input.error) record.error = String(input.error).slice(0, 512);
  if (input.rollbackPath) record.rollbackPath = String(input.rollbackPath);
  if (input.confirmationStatus) record.confirmationStatus = String(input.confirmationStatus);
  if (input.source) record.source = String(input.source);
  if (input.project) record.project = String(input.project);
  if (input.user) record.user = String(input.user);
  if (input.meta && typeof input.meta === "object") record.meta = { ...input.meta };

  // Ring buffer
  _buffer.push(record);
  if (_buffer.length > BUFFER_LIMIT) _buffer.splice(0, _buffer.length - BUFFER_LIMIT);

  // Persist (fire-and-forget)
  persist(JSON.stringify(record)).catch((err) => {
    // surface to console, never throw
    console.error(`[audit] persist failed: ${err.message}`);
  });

  return record;
}

/**
 * Query the in-memory ring buffer (latest first).
 * @param {object} [filter]
 * @param {string} [filter.eventType]
 * @param {string} [filter.action]
 * @param {string} [filter.riskLevel]
 * @param {string} [filter.result]
 * @param {number} [filter.sinceMs]   only events newer than now-sinceMs
 * @param {number} [filter.limit]     default 50
 */
export function query(filter = {}) {
  const limit = Math.max(1, Math.min(filter.limit || 50, BUFFER_LIMIT));
  const sinceMs = typeof filter.sinceMs === "number" ? Date.now() - filter.sinceMs : null;

  const matches = [];
  for (let i = _buffer.length - 1; i >= 0 && matches.length < limit; i -= 1) {
    const r = _buffer[i];
    if (filter.eventType && r.eventType !== filter.eventType) continue;
    if (filter.action && r.action !== filter.action) continue;
    if (filter.riskLevel && r.riskLevel !== filter.riskLevel) continue;
    if (filter.result && r.result !== filter.result) continue;
    if (sinceMs && new Date(r.ts).getTime() < sinceMs) continue;
    matches.push({ ...r });
  }
  return matches;
}

/**
 * Summary stats over the in-memory ring.
 */
export function summary() {
  const counts = {
    total: _buffer.length,
    byType: {},
    byResult: {},
    byRiskLevel: {},
    failures: 0,
    criticalActions: 0
  };
  for (const r of _buffer) {
    counts.byType[r.eventType] = (counts.byType[r.eventType] || 0) + 1;
    counts.byResult[r.result]  = (counts.byResult[r.result]  || 0) + 1;
    counts.byRiskLevel[r.riskLevel] = (counts.byRiskLevel[r.riskLevel] || 0) + 1;
    if (r.result === "failed") counts.failures += 1;
    if (r.riskLevel === "CRITICAL") counts.criticalActions += 1;
  }
  return counts;
}

/**
 * For tests: clear ring buffer and reset config snapshot.
 */
export function _testReset(opts = {}) {
  _buffer.length = 0;
  _config = {
    logDir: process.env.JERVIS_AUDIT_DIR || path.join(process.cwd(), "data"),
    rotate: "daily",
    fsync: false,
    enabled: true,
    payloadHashAlg: "sha256",
    ...opts
  };
}

/**
 * Read the current day's persisted audit file (line-by-line, newest first).
 */
export async function readToday(limit = 50) {
  const file = currentLogPath();
  if (!fss.existsSync(file)) return [];
  const raw = await fs.readFile(file, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const slice = lines.slice(-limit).reverse();
  return slice.map((l) => {
    try { return JSON.parse(l); } catch { return { _raw: l, _error: "parse" }; }
  });
}

export default {
  EVENT_TYPES,
  RESULT_STATES,
  appendEvent,
  query,
  summary,
  configure,
  readToday,
  _testReset
};
