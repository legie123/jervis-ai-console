/**
 * server/comm/email/index.js — JERVIS V3 Phase 9
 * Author: claude-coder (sesiunea 2026-05-06)
 *
 * Email scheduler/sender pipeline. Mirrors WhatsApp draft+gate+audit pattern.
 * - draftEmail()  → never sends, always queues
 * - listDrafts()  → ring buffer + JSONL persist
 * - sendEmail()   → risk-gated, requires confirmation token for LIVE
 * - dry_run by default. LIVE requires:
 *     * recipient in allowlist
 *     * confirmation_token === "CONFIRM_EMAIL_SEND"
 *     * payload.dry_run === false explicit
 *
 * Audit emits an event on every draft + send attempt.
 *
 * Pure ESM. Deps: built-ins only. Transport pluggable.
 */

import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import { appendEvent } from "../../audit/log.js";
import { createDryRunTransport } from "./transport.js";

const DRAFT_BUFFER_LIMIT = 128;
const _drafts = [];

let _config = {
  storeDir: process.env.JERVIS_EMAIL_DIR || path.join(process.cwd(), "data", "email"),
  allowlist: new Set(),
  defaultDryRun: true,
  fromAddress: process.env.JERVIS_EMAIL_FROM || "jervis@local",
  transport: createDryRunTransport()
};

export const RISK_TOKEN_LIVE_EMAIL = "CONFIRM_EMAIL_SEND";

/* ============================================================
   CONFIGURATION
   ============================================================ */

export function configure(opts = {}) {
  if (opts.storeDir) _config.storeDir = opts.storeDir;
  if (typeof opts.defaultDryRun === "boolean") _config.defaultDryRun = opts.defaultDryRun;
  if (opts.fromAddress) _config.fromAddress = opts.fromAddress;
  if (opts.transport) _config.transport = opts.transport;
  if (Array.isArray(opts.allowlist)) {
    _config.allowlist = new Set(opts.allowlist.map((a) => String(a).toLowerCase()));
  } else if (opts.allowlist instanceof Set) {
    _config.allowlist = opts.allowlist;
  }
}

export function configSnapshot() {
  return {
    storeDir: _config.storeDir,
    defaultDryRun: _config.defaultDryRun,
    fromAddress: _config.fromAddress,
    allowlistCount: _config.allowlist.size,
    transportName: _config.transport?.name || "unknown"
  };
}

/* ============================================================
   ALLOWLIST
   ============================================================ */

export function allowRecipient(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e || !e.includes("@")) throw new Error(`invalid email: ${email}`);
  _config.allowlist.add(e);
  return e;
}

export function revokeRecipient(email) {
  const e = String(email || "").trim().toLowerCase();
  return _config.allowlist.delete(e);
}

export function isRecipientAllowed(email) {
  const e = String(email || "").trim().toLowerCase();
  return _config.allowlist.has(e);
}

/* ============================================================
   DRAFTING
   ============================================================ */

export function draftEmail({ to, subject, body, project, scheduleFor, meta = {} } = {}) {
  if (!to || !String(to).includes("@")) throw new Error("draftEmail: invalid 'to' address");
  if (!subject || !String(subject).trim()) throw new Error("draftEmail: subject required");
  if (!body || !String(body).trim())       throw new Error("draftEmail: body required");

  const draft = {
    id: `email_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    to: String(to).trim().toLowerCase(),
    subject: String(subject).trim().slice(0, 256),
    body: String(body),
    project: project || "",
    scheduleFor: scheduleFor ? new Date(scheduleFor).toISOString() : null,
    status: "drafted",
    sendAttempts: 0,
    bodyHash: createHash("sha256").update(String(body)).digest("hex").slice(0, 16),
    meta: meta && typeof meta === "object" ? { ...meta } : {}
  };

  _drafts.push(draft);
  if (_drafts.length > DRAFT_BUFFER_LIMIT) _drafts.splice(0, _drafts.length - DRAFT_BUFFER_LIMIT);

  appendEvent({
    eventType: "comm",
    action: "email_draft",
    riskLevel: "MEDIUM",
    result: "ok",
    project,
    payload: { to: draft.to, subject: draft.subject, bodyHash: draft.bodyHash },
    meta: { draftId: draft.id }
  });

  persistDraft(draft).catch((err) => {
    appendEvent({ eventType: "error", action: "email_persist", result: "failed", error: err.message });
  });

  return { ok: true, draft };
}

async function persistDraft(draft) {
  await fs.mkdir(_config.storeDir, { recursive: true });
  const file = path.join(_config.storeDir, "drafts.jsonl");
  await fs.appendFile(file, JSON.stringify(draft) + "\n");
}

export function listDrafts({ status, limit = 50 } = {}) {
  const filtered = status ? _drafts.filter((d) => d.status === status) : _drafts;
  return filtered.slice(-limit).reverse().map((d) => ({ ...d }));
}

export function getDraft(id) {
  return _drafts.find((d) => d.id === id) || null;
}

/* ============================================================
   SENDING (risk-gated)
   ============================================================ */

export async function sendEmail(draftId, opts = {}) {
  const draft = getDraft(draftId);
  if (!draft) {
    appendEvent({ eventType: "comm", action: "email_send", result: "failed", error: "draft not found", meta: { draftId } });
    return { ok: false, error: `draft not found: ${draftId}` };
  }

  const dryRun = opts.dry_run !== undefined ? Boolean(opts.dry_run) : _config.defaultDryRun;
  const isLive = !dryRun;

  // Risk gating
  if (isLive) {
    if (!isRecipientAllowed(draft.to)) {
      appendEvent({
        eventType: "comm", action: "email_send", riskLevel: "CRITICAL", result: "blocked",
        error: "recipient not in allowlist", project: draft.project, meta: { draftId }
      });
      return { ok: false, error: `recipient not in allowlist: ${draft.to}`, riskLevel: "CRITICAL" };
    }
    if (opts.confirmation_token !== RISK_TOKEN_LIVE_EMAIL) {
      appendEvent({
        eventType: "comm", action: "email_send", riskLevel: "CRITICAL", result: "blocked",
        error: "confirmation_token missing/invalid", project: draft.project, meta: { draftId }
      });
      return { ok: false, error: `confirmation_token must be '${RISK_TOKEN_LIVE_EMAIL}'`, riskLevel: "CRITICAL" };
    }
  }

  draft.sendAttempts += 1;
  draft.lastAttemptAt = new Date().toISOString();

  const start = Date.now();
  try {
    const result = await _config.transport.send({
      from: _config.fromAddress,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      dryRun
    });
    const durationMs = Date.now() - start;

    draft.status = dryRun ? "dry_run_sent" : "sent";
    draft.sentAt = new Date().toISOString();
    draft.transportResponse = result?.id || result?.messageId || "";

    appendEvent({
      eventType: "comm",
      action: "email_send",
      riskLevel: dryRun ? "MEDIUM" : "CRITICAL",
      result: "ok",
      project: draft.project,
      durationMs,
      meta: { draftId, dryRun, transport: _config.transport.name }
    });

    persistDraft(draft).catch(() => {});
    return { ok: true, status: draft.status, dryRun, draft, transport: _config.transport.name };
  } catch (err) {
    const durationMs = Date.now() - start;
    draft.status = "send_failed";
    draft.lastError = err.message;

    appendEvent({
      eventType: "comm",
      action: "email_send",
      riskLevel: dryRun ? "MEDIUM" : "CRITICAL",
      result: "failed",
      error: err.message,
      project: draft.project,
      durationMs,
      meta: { draftId, dryRun }
    });
    return { ok: false, error: err.message, draft };
  }
}

/* ============================================================
   QUEUE OPS (cancel, reschedule)
   ============================================================ */

export function cancelDraft(draftId) {
  const draft = getDraft(draftId);
  if (!draft) return { ok: false, error: "draft not found" };
  if (draft.status === "sent") return { ok: false, error: "cannot cancel sent draft" };
  draft.status = "cancelled";
  draft.cancelledAt = new Date().toISOString();
  appendEvent({ eventType: "comm", action: "email_cancel", result: "ok", meta: { draftId } });
  return { ok: true, draft };
}

export function rescheduleDraft(draftId, newWhen) {
  const draft = getDraft(draftId);
  if (!draft) return { ok: false, error: "draft not found" };
  draft.scheduleFor = new Date(newWhen).toISOString();
  appendEvent({ eventType: "comm", action: "email_reschedule", result: "ok", meta: { draftId, scheduleFor: draft.scheduleFor } });
  return { ok: true, draft };
}

/* ============================================================
   TEST RESET
   ============================================================ */

export function _testReset(opts = {}) {
  _drafts.length = 0;
  _config = {
    storeDir: path.join(process.cwd(), "data", "email"),
    allowlist: new Set(),
    defaultDryRun: true,
    fromAddress: "jervis@local",
    transport: createDryRunTransport(),
    ...opts
  };
  if (opts.allowlist instanceof Array) {
    _config.allowlist = new Set(opts.allowlist.map((a) => a.toLowerCase()));
  }
}

export default {
  RISK_TOKEN_LIVE_EMAIL,
  configure,
  configSnapshot,
  allowRecipient,
  revokeRecipient,
  isRecipientAllowed,
  draftEmail,
  listDrafts,
  getDraft,
  sendEmail,
  cancelDraft,
  rescheduleDraft,
  _testReset
};
