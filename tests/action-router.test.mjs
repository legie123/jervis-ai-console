import assert from "node:assert/strict";
import test from "node:test";

process.env.JERVIS_ACTION_SENDERS = "allowed-sender";
const { routeAction, VERBS } = await import("../jervis-action-router.mjs");

function createState(alert = "GREEN") {
  return {
    alert,
    metrics: { alerts: 0, tasks: 0 },
    modules: { WarpCore: {}, Sensors: {} },
    swarm: { agents: [{ id: "codex" }] }
  };
}

function createCtx(overrides = {}) {
  const calls = { logs: [], notes: [] };
  const state = overrides.state || createState();
  return {
    calls,
    ctx: {
      state,
      shieldsScan: overrides.shieldsScan || (() => ({ safe: true, severity: "low" })),
      writeCaptainsLog: async (entry) => calls.notes.push(entry),
      log: (...args) => calls.logs.push(args)
    }
  };
}

function verdict(action, extra = {}) {
  return {
    intent: "command",
    urgency: "high",
    action,
    summary: action,
    raw: action,
    sender: `sender-${crypto.randomUUID()}`,
    ...extra
  };
}

test("VERBS exposes the allowed command set", () => {
  for (const verb of ["status", "log", "alert", "scan", "compute", "remind"]) {
    assert.equal(VERBS.has(verb), true);
  }
});

test("status verb executes and returns public state", async () => {
  const { ctx } = createCtx();
  const result = await routeAction(verdict("status"), ctx);
  assert.equal(result.executed, true);
  assert.equal(result.verb, "status");
  assert.deepEqual(result.result, { alert: "GREEN", modules: 2, agents: 1 });
});

test("log verb writes Captain's Log entry", async () => {
  const { ctx, calls } = createCtx();
  const result = await routeAction(verdict("log this event"), ctx);
  assert.equal(result.executed, true);
  assert.equal(result.verb, "log");
  assert.equal(calls.notes.length, 1);
  assert.match(calls.notes[0].title, /WA Command/);
});

test("allowlisted alert verb changes alert level", async () => {
  const state = createState();
  const { ctx } = createCtx({ state });
  const result = await routeAction(verdict("alert red", { sender: "allowed-sender" }), ctx);
  assert.equal(result.executed, true);
  assert.equal(result.verb, "alert");
  assert.deepEqual(result.result, { from: "GREEN", to: "RED" });
  assert.equal(state.alert, "RED");
});

test("scan verb routes to shields scanner", async () => {
  const { ctx } = createCtx({
    shieldsScan: (input) => ({ safe: true, severity: "low", input })
  });
  const result = await routeAction(verdict("scan payload"), ctx);
  assert.equal(result.executed, true);
  assert.equal(result.verb, "scan");
  assert.equal(result.result.input, "scan payload");
});

test("compute verb evaluates simple math only", async () => {
  const { ctx } = createCtx();
  const result = await routeAction(verdict("compute", { raw: "2 + 3 * 4" }), ctx);
  assert.equal(result.executed, true);
  assert.equal(result.verb, "compute");
  assert.equal(result.result, 14);
});

test("remind verb queues reminder payload", async () => {
  const { ctx } = createCtx();
  const result = await routeAction(verdict("remind me to review CI"), ctx);
  assert.equal(result.executed, true);
  assert.equal(result.verb, "remind");
  assert.match(result.result.queued, /remind/);
});

test("unknown verb returns dry-run plan", async () => {
  const { ctx } = createCtx();
  const result = await routeAction(verdict("deploy moon base"), ctx);
  assert.equal(result.executed, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.reason, "no-verb-matched");
});

test("RED alert state forces dry-run", async () => {
  const { ctx } = createCtx({ state: createState("RED") });
  const result = await routeAction(verdict("status"), ctx);
  assert.equal(result.executed, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.verb, "status");
});

test("rate limit blocks more than six actions per minute per sender", async () => {
  const { ctx } = createCtx();
  const sender = `rate-${crypto.randomUUID()}`;
  let result;
  for (let i = 0; i < 7; i += 1) {
    result = await routeAction(verdict("status", { sender }), ctx);
  }
  assert.equal(result.executed, false);
  assert.equal(result.reason, "rate-limit");
});

test("sensitive alert verb blocks sender outside allowlist", async () => {
  const { ctx } = createCtx();
  const result = await routeAction(verdict("alert yellow", { sender: "unknown-sender" }), ctx);
  assert.equal(result.executed, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.reason, "sender-not-allowlisted");
  assert.equal(result.verb, "alert");
});

test("shields gate blocks dangerous payload before dispatch", async () => {
  const state = createState();
  const { ctx } = createCtx({
    state,
    shieldsScan: () => ({ safe: false, severity: "critical" })
  });
  const result = await routeAction(verdict("status"), ctx);
  assert.equal(result.executed, false);
  assert.equal(result.reason, "shields");
  assert.equal(result.severity, "critical");
  assert.equal(state.metrics.alerts, 1);
});
