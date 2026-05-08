/**
 * tests/integration.test.js — Phase 11 V3 wire-up smoke
 * Exercises: logger -> audit -> ide registry -> transporter -> sensors lifecycle
 * Run: node --test tests/integration.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createLogger } from "../server/lib/logger.js";
import { createTransporter } from "../server/lib/transporter.js";
import { createCaptainsLog } from "../server/lib/database.js";
import { startPoller, stopAllPollers } from "../server/lib/sensors.js";
import { appendEvent, query, summary, _testReset as auditReset } from "../server/audit/log.js";
import { IDE_REGISTRY, resolveProjectPath } from "../server/ide/index.js";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "jervis-int-")); }

test("end-to-end: tool call audited + logged", () => {
  auditReset({ enabled: false });
  const records = [];
  const { log } = createLogger({ onRecord: (r) => records.push(r) });

  log("mod", "WarpCore", "boot");
  appendEvent({ eventType: "boot", action: "init", agentId: "claude-coder" });

  log("ok", "Tool", "list_local_apps");
  appendEvent({ eventType: "tool", action: "list_local_apps", riskLevel: "LOW" });

  assert.equal(records.length, 2);
  const auditEvents = query({});
  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0].action, "list_local_apps");
});

test("transporter handoff between agents", async () => {
  const dir = tmp();
  const claudeT = createTransporter(dir);
  const codexT  = createTransporter(dir);

  await claudeT.write({
    from: "claude-coder",
    to: "codex-reviewer",
    task: "review server/ide/index.js",
    files: ["server/ide/index.js"]
  });

  const got = await codexT.read();
  assert.equal(got.payload.from, "claude-coder");
  assert.equal(got.payload.task, "review server/ide/index.js");
});

test("captain's log + audit log can co-exist on tool action", async () => {
  auditReset({ enabled: false });
  const vault = tmp();
  const cl = createCaptainsLog({ vaultRoot: vault, stardateFn: () => "79127.0" });
  const file = await cl.write({ title: "Tool exec", body: "Ran open_in_cursor" });
  appendEvent({
    eventType: "ide",
    action: "open_in_cursor",
    riskLevel: "MEDIUM",
    project: "trade ai"
  });

  const content = fs.readFileSync(file, "utf8");
  assert.match(content, /Tool exec/);

  const audit = query({ eventType: "ide" });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "open_in_cursor");
  assert.equal(audit[0].project, "trade ai");
});

test("IDE registry has all 6 actions wired", () => {
  const expected = [
    "open_in_claude_code", "open_in_cursor", "open_in_antigravity",
    "open_in_vscode", "open_codex_task", "project_status"
  ];
  for (const k of expected) {
    assert.equal(typeof IDE_REGISTRY[k], "function", `missing ${k}`);
  }
});

test("path resolution catches traversal", () => {
  assert.throws(() => resolveProjectPath("../../../etc/passwd"));
});

test("sensor poller + audit feedback loop", async () => {
  auditReset({ enabled: false });
  startPoller({
    name: "vault-watch",
    intervalMs: 25,
    fn: () => {
      appendEvent({ eventType: "memory", action: "vault_scan", result: "ok" });
      return "scanned";
    }
  });
  await new Promise((r) => setTimeout(r, 100));
  stopAllPollers();
  const events = query({ eventType: "memory" });
  assert.ok(events.length >= 2, `expected >=2, got ${events.length}`);
});

test("audit summary aggregates across module types", () => {
  auditReset({ enabled: false });
  appendEvent({ eventType: "boot", action: "init" });
  appendEvent({ eventType: "ide", action: "open_in_cursor", riskLevel: "MEDIUM" });
  appendEvent({ eventType: "comm", action: "whatsapp_send", riskLevel: "CRITICAL", result: "blocked" });
  appendEvent({ eventType: "shield", action: "injection_blocked", riskLevel: "HIGH" });

  const s = summary();
  assert.equal(s.total, 4);
  assert.ok(s.byType.shield === 1);
  assert.ok(s.byType.ide === 1);
  assert.equal(s.criticalActions, 1);
});

test("FSM-style event chain via audit", () => {
  auditReset({ enabled: false });
  appendEvent({ eventType: "fsm_transition", action: "STANDBY->LISTENING" });
  appendEvent({ eventType: "fsm_transition", action: "LISTENING->THINKING" });
  appendEvent({ eventType: "fsm_transition", action: "THINKING->WAITING_CONFIRMATION", riskLevel: "HIGH" });
  appendEvent({ eventType: "permission", action: "user_confirmed" });
  appendEvent({ eventType: "fsm_transition", action: "WAITING_CONFIRMATION->ACTING" });

  const fsmEvents = query({ eventType: "fsm_transition" });
  assert.equal(fsmEvents.length, 4);
  assert.equal(fsmEvents[0].action, "WAITING_CONFIRMATION->ACTING");
});
