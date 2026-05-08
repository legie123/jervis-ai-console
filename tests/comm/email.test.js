/**
 * tests/comm/email.test.js — Phase 9 Email pipeline tests
 * Run: node --test tests/comm/email.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  draftEmail,
  listDrafts,
  getDraft,
  sendEmail,
  cancelDraft,
  rescheduleDraft,
  configure,
  configSnapshot,
  allowRecipient,
  revokeRecipient,
  isRecipientAllowed,
  RISK_TOKEN_LIVE_EMAIL,
  _testReset
} from "../../server/comm/email/index.js";
import { renderTemplate, renderBuiltin, TEMPLATES } from "../../server/comm/email/templates.js";
import { createDryRunTransport, createHttpTransport } from "../../server/comm/email/transport.js";
import { _testReset as auditReset, query as auditQuery } from "../../server/audit/log.js";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "jervis-email-")); }

test("RISK_TOKEN_LIVE_EMAIL constant", () => {
  assert.equal(RISK_TOKEN_LIVE_EMAIL, "CONFIRM_EMAIL_SEND");
});

test("draftEmail validates inputs", () => {
  _testReset();
  assert.throws(() => draftEmail({ subject: "x", body: "y" }), /invalid 'to'/);
  assert.throws(() => draftEmail({ to: "a@b.com", body: "y" }), /subject required/);
  assert.throws(() => draftEmail({ to: "a@b.com", subject: "x" }), /body required/);
});

test("draftEmail creates a draft with metadata", () => {
  _testReset();
  const r = draftEmail({ to: "andrei@example.com", subject: "Hi", body: "Reminder body", project: "trade ai" });
  assert.equal(r.ok, true);
  assert.match(r.draft.id, /^email_/);
  assert.equal(r.draft.status, "drafted");
  assert.equal(r.draft.to, "andrei@example.com");
  assert.equal(r.draft.project, "trade ai");
  assert.equal(typeof r.draft.bodyHash, "string");
  assert.equal(r.draft.bodyHash.length, 16);
});

test("listDrafts + getDraft", () => {
  _testReset();
  const r1 = draftEmail({ to: "a@x.com", subject: "1", body: "b1" });
  const r2 = draftEmail({ to: "b@x.com", subject: "2", body: "b2" });
  const list = listDrafts();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, r2.draft.id); // newest first
  assert.equal(getDraft(r1.draft.id).subject, "1");
  assert.equal(getDraft("nonexistent"), null);
});

test("listDrafts filters by status", () => {
  _testReset();
  draftEmail({ to: "a@x.com", subject: "s1", body: "b1" });
  const r = draftEmail({ to: "b@x.com", subject: "s2", body: "b2" });
  cancelDraft(r.draft.id);
  assert.equal(listDrafts({ status: "drafted" }).length, 1);
  assert.equal(listDrafts({ status: "cancelled" }).length, 1);
});

test("sendEmail in dry-run by default", async () => {
  _testReset();
  auditReset({ enabled: false });
  const r = draftEmail({ to: "a@x.com", subject: "s", body: "b" });
  const send = await sendEmail(r.draft.id);
  assert.equal(send.ok, true);
  assert.equal(send.dryRun, true);
  assert.equal(send.status, "dry_run_sent");
  assert.equal(send.draft.sendAttempts, 1);
});

test("sendEmail LIVE blocked without allowlist", async () => {
  _testReset();
  auditReset({ enabled: false });
  const r = draftEmail({ to: "stranger@x.com", subject: "s", body: "b" });
  const send = await sendEmail(r.draft.id, { dry_run: false, confirmation_token: RISK_TOKEN_LIVE_EMAIL });
  assert.equal(send.ok, false);
  assert.match(send.error, /allowlist/);
  assert.equal(send.riskLevel, "CRITICAL");
});

test("sendEmail LIVE blocked without confirmation token", async () => {
  _testReset();
  auditReset({ enabled: false });
  allowRecipient("vip@x.com");
  const r = draftEmail({ to: "vip@x.com", subject: "s", body: "b" });
  const send = await sendEmail(r.draft.id, { dry_run: false });
  assert.equal(send.ok, false);
  assert.match(send.error, /confirmation_token/);
});

test("sendEmail LIVE succeeds with allowlist + token", async () => {
  _testReset();
  auditReset({ enabled: false });
  allowRecipient("vip@x.com");
  const r = draftEmail({ to: "vip@x.com", subject: "s", body: "b" });
  const send = await sendEmail(r.draft.id, { dry_run: false, confirmation_token: RISK_TOKEN_LIVE_EMAIL });
  assert.equal(send.ok, true);
  assert.equal(send.dryRun, false);
  assert.equal(send.status, "sent");
});

test("allowlist add + revoke + check", () => {
  _testReset();
  allowRecipient("a@x.com");
  allowRecipient("B@X.com");  // case-insensitive
  assert.equal(isRecipientAllowed("a@x.com"), true);
  assert.equal(isRecipientAllowed("b@x.com"), true);
  assert.equal(isRecipientAllowed("c@x.com"), false);
  revokeRecipient("a@x.com");
  assert.equal(isRecipientAllowed("a@x.com"), false);
});

test("allowRecipient rejects invalid email", () => {
  _testReset();
  assert.throws(() => allowRecipient("not-an-email"), /invalid email/);
  assert.throws(() => allowRecipient(""), /invalid email/);
});

test("cancelDraft + rescheduleDraft", () => {
  _testReset();
  const r = draftEmail({ to: "a@x.com", subject: "s", body: "b" });
  const c = cancelDraft(r.draft.id);
  assert.equal(c.ok, true);
  assert.equal(c.draft.status, "cancelled");
  // cannot cancel after sent — set status manually
  const r2 = draftEmail({ to: "a@x.com", subject: "s2", body: "b2" });
  r2.draft.status = "sent";
  const c2 = cancelDraft(r2.draft.id);
  assert.equal(c2.ok, false);

  const r3 = draftEmail({ to: "a@x.com", subject: "s3", body: "b3" });
  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const rs = rescheduleDraft(r3.draft.id, tomorrow);
  assert.equal(rs.ok, true);
  assert.equal(rs.draft.scheduleFor, tomorrow);
});

test("audit log captures email events", () => {
  _testReset();
  auditReset({ enabled: false });
  draftEmail({ to: "a@x.com", subject: "s", body: "b" });
  const events = auditQuery({ eventType: "comm" });
  assert.ok(events.length >= 1);
  assert.equal(events[0].action, "email_draft");
});

test("renderTemplate substitutes vars", () => {
  const out = renderTemplate("Hello {{name}}", { name: "Andrei" });
  assert.equal(out, "Hello Andrei");
});

test("renderTemplate handles missing vars", () => {
  const out = renderTemplate("Hello {{name}}, age {{age}}", { name: "A" });
  assert.equal(out, "Hello A, age ");
});

test("renderTemplate handles {{#if}} blocks", () => {
  const tpl = "{{#if subject}}Re: {{subject}}\n{{/if}}Body";
  const withSubj = renderTemplate(tpl, { subject: "X" });
  assert.equal(withSubj, "Re: X\nBody");
  const noSubj = renderTemplate(tpl, {});
  assert.equal(noSubj, "Body");
});

test("renderBuiltin task_reminder", () => {
  const out = renderBuiltin("task_reminder", { name: "A", subject: "X", body: "do it" });
  assert.match(out, /Salut A/);
  assert.match(out, /Reminder: X/);
  assert.match(out, /do it/);
});

test("renderBuiltin throws for unknown template", () => {
  assert.throws(() => renderBuiltin("nope"), /unknown template/);
});

test("TEMPLATES exposed", () => {
  assert.ok(TEMPLATES.task_reminder);
  assert.ok(TEMPLATES.daily_brief);
  assert.ok(TEMPLATES.weekly_recap);
});

test("createDryRunTransport returns mock id", async () => {
  const t = createDryRunTransport();
  const r = await t.send({ from: "a", to: "b", subject: "s", body: "b" });
  assert.equal(t.name, "dry-run");
  assert.match(r.id, /^drymsg_/);
  assert.equal(r.dryRun, true);
});

test("createHttpTransport throws without url", () => {
  assert.throws(() => createHttpTransport({}), /url required/);
});

test("createHttpTransport name + url stored", () => {
  const t = createHttpTransport({ url: "https://api.example.com/send" });
  assert.equal(t.name, "http");
  assert.equal(t.url, "https://api.example.com/send");
});

test("configure + configSnapshot", () => {
  _testReset();
  configure({ defaultDryRun: false, fromAddress: "claude@jervis.local" });
  const snap = configSnapshot();
  assert.equal(snap.defaultDryRun, false);
  assert.equal(snap.fromAddress, "claude@jervis.local");
});

test("persistence: drafts.jsonl created", async () => {
  const dir = tmp();
  // settle any prior persist
  await new Promise((r) => setTimeout(r, 250));
  _testReset({ storeDir: dir, defaultDryRun: true, allowlist: [] });
  draftEmail({ to: "a@x.com", subject: "persistent-uniq-marker", body: "b" });
  await new Promise((r) => setTimeout(r, 250));
  const file = path.join(dir, "drafts.jsonl");
  assert.equal(fs.existsSync(file), true);
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);
  // robust: filter for our marker
  const ours = lines.map((l) => JSON.parse(l)).filter((d) => d.subject === "persistent-uniq-marker");
  assert.ok(ours.length >= 1, `expected our marker, got ${lines.length} lines`);
  assert.equal(ours[0].subject, "persistent-uniq-marker");
});
