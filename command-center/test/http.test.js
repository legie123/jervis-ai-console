import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpServer } from "../apps/operator/src/http.js";

const httpTestDraftDir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-http-test-"));
process.env.JARVIS_DRAFT_STORE = path.join(httpTestDraftDir, "whatsapp-drafts.json");

process.env.WHATSAPP_REAL_SEND_ENABLED = "false";
process.env.WHATSAPP_ACCESS_TOKEN = "";
process.env.WHATSAPP_PHONE_NUMBER_ID = "";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function issueScopedToken(port, scope, targetId = "") {
  const payload = await fetch(`http://127.0.0.1:${port}/api/security/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope, targetId })
  }).then((res) => res.json());
  assert.equal(payload.ok, true);
  assert.ok(payload.token?.token);
  return payload.token.token;
}

test("missions state endpoint reflects latest mission fsm", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const marker = `draft whatsapp mission-state-${Date.now()}`;
    await fetch(`http://127.0.0.1:${port}/api/mission`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: marker })
    }).then((res) => res.json());

    const state = await fetch(`http://127.0.0.1:${port}/api/missions/state`).then((res) => res.json());
    assert.equal(state.ok, true);
    assert.equal(state.derivedFsm, "WAITING_CONFIRMATION");
    assert.ok(state.mission?.id);
    assert.ok(state.mission.inputPreview.includes(marker));
  } finally {
    await close(server);
  }
});

test("serves health and static UI", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((res) => res.json());
    assert.equal(health.ok, true);
    assert.equal(health.status, "REAL");
    assert.equal(health.scheduler.autoSend, false);

    const html = await fetch(`http://127.0.0.1:${port}/`).then((res) => res.text());
    assert.match(html, /JARVIS Command Center/);
    assert.match(html, /ux-premium-rail/);
    assert.match(html, /mountContextCopilot/);
    assert.match(html, /graphSvg/);
    assert.match(html, /graphSearch/);
    assert.match(html, /graphZoomInBtn/);
    assert.match(html, /graphResetBtn/);
    assert.match(html, /bridgeCreateDraftBtn/);
    assert.match(html, /bridgeSendBtn/);
    assert.match(html, /bridgeInboxBtn/);
    assert.match(html, /bridgePreflightBtn/);
    assert.match(html, /auto-issued scoped token/);

    const graphViewer = await fetch(`http://127.0.0.1:${port}/graph-viewer.js`).then((res) => res.text());
    assert.match(graphViewer, /layoutGraph/);
    assert.match(graphViewer, /filterGraphBySearch/);
    assert.match(graphViewer, /clampZoom/);
  } finally {
    await close(server);
  }
});

test("tools endpoint returns reconciled catalog with schema", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const payload = await fetch(`http://127.0.0.1:${port}/api/tools`).then((res) => res.json());
    assert.equal(payload.ok, true);
    assert.ok(payload.count >= 3);

    const graphifyTool = payload.tools.find((tool) => tool.id === "graphify.export");
    assert.ok(graphifyTool);
    assert.equal(graphifyTool.status, "REAL");
    assert.ok(graphifyTool.schema);
  } finally {
    await close(server);
  }
});

test("adapters endpoint exposes opt-in registry and feed contract", async () => {
  const previous = process.env.JARVIS_ADAPTER_OBSIDIAN_ENABLED;
  process.env.JARVIS_ADAPTER_OBSIDIAN_ENABLED = "false";

  const server = createHttpServer();
  const port = await listen(server);
  try {
    const adapters = await fetch(`http://127.0.0.1:${port}/api/adapters`).then((res) => res.json());
    assert.equal(adapters.ok, true);
    assert.ok(adapters.count >= 4);
    assert.equal(adapters.enabledCount, 0);

    const feed = await fetch(`http://127.0.0.1:${port}/api/obsidian/feed`).then((res) => res.json());
    assert.equal(feed.ok, true);
    assert.equal(feed.enabled, false);
    assert.deepEqual(feed.entries, []);
  } finally {
    if (previous === undefined) {
      delete process.env.JARVIS_ADAPTER_OBSIDIAN_ENABLED;
    } else {
      process.env.JARVIS_ADAPTER_OBSIDIAN_ENABLED = previous;
    }
    await close(server);
  }
});

test("whatsapp bridge API proxies status, drafts, inbox and gates confirm", async () => {
  const calls = [];
  const whatsappBridge = {
    async status() {
      return { ok: true, status: "REAL", url: "http://bridge.test", health: { ok: true } };
    },
    async listMessages() {
      return { ok: true, source: "whatsapp_bridge", messages: [{ id: "m1", from: "4071", body: "Salut" }] };
    },
    async preflight() {
      return {
        ok: true,
        source: "whatsapp_bridge",
        preflight: {
          ok: false,
          sendConfigured: false,
          missing: ["WHATSAPP_ACCESS_TOKEN"],
          checks: { accessToken: { present: false, length: 0, shape: "missing" } }
        }
      };
    },
    async listDrafts() {
      return { ok: true, source: "whatsapp_bridge", drafts: [{ id: "d1", to: "4071", text: "Reply" }] };
    },
    async createDraft(input) {
      calls.push(["createDraft", input]);
      return { ok: true, draft: { id: "d2", to: input.to, text: input.body, status: "pending_confirmation" } };
    },
    async confirmDraft(input) {
      calls.push(["confirmDraft", input]);
      if (input.confirmToken !== "CONFIRM_BRIDGE_SEND") throw new Error("Bridge send blocked");
      return { ok: true, draft: { id: input.id, status: "sent" } };
    }
  };
  const server = createHttpServer({ whatsappBridge });
  const port = await listen(server);
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((res) => res.json());
    assert.equal(health.whatsappBridge.status, "REAL");

    const inbox = await fetch(`http://127.0.0.1:${port}/api/bridge/whatsapp/messages`).then((res) => res.json());
    assert.equal(inbox.messages[0].from, "4071");

    const preflight = await fetch(`http://127.0.0.1:${port}/api/bridge/whatsapp/preflight`).then((res) =>
      res.json()
    );
    assert.equal(preflight.preflight.sendConfigured, false);
    assert.deepEqual(preflight.preflight.missing, ["WHATSAPP_ACCESS_TOKEN"]);

    const drafts = await fetch(`http://127.0.0.1:${port}/api/bridge/whatsapp/drafts`).then((res) => res.json());
    assert.equal(drafts.drafts[0].id, "d1");

    const created = await fetch(`http://127.0.0.1:${port}/api/bridge/whatsapp/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "4071", body: "Reply" })
    }).then((res) => res.json());
    assert.equal(created.draft.id, "d2");

    const blocked = await fetch(`http://127.0.0.1:${port}/api/bridge/whatsapp/drafts/d2/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmToken: "BAD" })
    }).then((res) => res.json());
    assert.equal(blocked.ok, false);

    const scopedToken = await issueScopedToken(port, "whatsapp.bridge.send", "d2");
    const confirmed = await fetch(`http://127.0.0.1:${port}/api/bridge/whatsapp/drafts/d2/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmToken: scopedToken })
    }).then((res) => res.json());
    assert.equal(confirmed.ok, true);
    assert.equal(calls.at(-1)[0], "confirmDraft");
  } finally {
    await close(server);
  }
});

test("creates whatsapp draft through API without real send", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const created = await fetch(`http://127.0.0.1:${port}/api/whatsapp/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "40700000000", body: "Salut" })
    }).then((res) => res.json());

    assert.equal(created.ok, true);
    assert.equal(created.draft.realSendEnabled, "env_gated");
    assert.equal(created.draft.status, "pending_confirmation");

    const confirmed = await fetch(
      `http://127.0.0.1:${port}/api/whatsapp/drafts/${created.draft.id}/confirm`,
      { method: "POST" }
    ).then((res) => res.json());

    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.realSend, false);
    assert.equal(confirmed.draft.status, "confirmed_no_send_adapter");
  } finally {
    await close(server);
  }
});

test("send endpoint stays blocked without env access", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const created = await fetch(`http://127.0.0.1:${port}/api/whatsapp/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "40700000000", body: "Salut" })
    }).then((res) => res.json());

    const scopedToken = await issueScopedToken(port, "whatsapp.send", created.draft.id);
    const send = await fetch(`http://127.0.0.1:${port}/api/whatsapp/drafts/${created.draft.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmToken: scopedToken })
    }).then((res) => res.json());

    assert.equal(send.ok, false);
    assert.match(send.error, /disabled|Missing/);
  } finally {
    await close(server);
  }
});

test("receives whatsapp webhook messages", async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";
  process.env.WHATSAPP_APP_SECRET = "secret";
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const challenge = await fetch(
      `http://127.0.0.1:${port}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=abc`
    ).then((res) => res.text());
    assert.equal(challenge, "abc");

    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "40700000001", profile: { name: "Client" } }],
                messages: [
                  {
                    id: `wamid.${Date.now()}`,
                    from: "40700000001",
                    timestamp: "1777777777",
                    type: "text",
                    text: { body: "Salut" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const digest = crypto.createHmac("sha256", "secret").update(Buffer.from(body)).digest("hex");

    const received = await fetch(`http://127.0.0.1:${port}/webhooks/whatsapp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${digest}`
      },
      body
    }).then((res) => res.json());

    assert.equal(received.ok, true);
    assert.equal(received.messages, 1);

    const inbox = await fetch(`http://127.0.0.1:${port}/api/whatsapp/messages`).then((res) => res.json());
    assert.equal(inbox.ok, true);
    assert.ok(inbox.messages.some((message) => message.from === "40700000001"));
  } finally {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    await close(server);
  }
});

test("scheduler API activates due draft without sending", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const created = await fetch(`http://127.0.0.1:${port}/api/whatsapp/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: "40700000003",
        body: "Scheduled",
        scheduledFor: "2026-01-01T00:00:00.000Z"
      })
    }).then((res) => res.json());

    assert.equal(created.draft.status, "scheduled_draft");
    assert.equal(created.job.status, "scheduled");

    const run = await fetch(`http://127.0.0.1:${port}/api/scheduler/run-due`, {
      method: "POST"
    }).then((res) => res.json());

    assert.equal(run.ok, true);
    assert.ok(run.processed >= 1);

    const drafts = await fetch(`http://127.0.0.1:${port}/api/whatsapp/drafts`).then((res) => res.json());
    const updated = drafts.drafts.find((draft) => draft.id === created.draft.id);
    assert.equal(updated.status, "pending_confirmation");
  } finally {
    await close(server);
  }
});

test("emergency stop blocks mutating routes until cleared", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const stopped = await fetch(`http://127.0.0.1:${port}/api/emergency/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "test_stop", source: "test" })
    }).then((res) => res.json());
    assert.equal(stopped.ok, true);
    assert.equal(stopped.emergency.active, true);

    const blockedRes = await fetch(`http://127.0.0.1:${port}/api/whatsapp/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "40700000000", body: "Salut" })
    });
    const blocked = await blockedRes.json();
    assert.equal(blockedRes.status, 423);
    assert.equal(blocked.ok, false);

    const clearToken = await issueScopedToken(port, "emergency.clear");
    const cleared = await fetch(`http://127.0.0.1:${port}/api/emergency/clear`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmToken: clearToken, source: "test" })
    }).then((res) => res.json());
    assert.equal(cleared.ok, true);
    assert.equal(cleared.emergency.active, false);

    const created = await fetch(`http://127.0.0.1:${port}/api/whatsapp/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "40700000000", body: "Salut" })
    }).then((res) => res.json());
    assert.equal(created.ok, true);
  } finally {
    await close(server);
  }
});

test("backup and state export endpoints work", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const backup = await fetch(`http://127.0.0.1:${port}/api/backup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "test" })
    }).then((res) => res.json());

    assert.equal(backup.ok, true);
    assert.ok(backup.manifest.copied.includes("data/drafts"));

    const state = await fetch(`http://127.0.0.1:${port}/api/state/export`).then((res) => res.json());
    assert.equal(state.ok, true);
    assert.ok(state.state.files);
  } finally {
    await close(server);
  }
});

test("restore endpoint denies path escape attempts", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const scopedToken = await issueScopedToken(port, "backup.restore", "../escape");
    const result = await fetch(`http://127.0.0.1:${port}/api/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backupPath: "../escape", confirmToken: scopedToken })
    }).then((res) => res.json());

    assert.equal(result.ok, false);
    assert.match(result.error, /outside allowed read roots|escape/);
  } finally {
    await close(server);
  }
});

test("obsidian sync endpoint stays blocked without env gate", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    const scopedToken = await issueScopedToken(port, "obsidian.sync");
    const result = await fetch(`http://127.0.0.1:${port}/api/obsidian/sync-summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmToken: scopedToken })
    }).then((res) => res.json());

    assert.equal(result.ok, false);
    assert.match(result.error, /disabled|Missing/);
  } finally {
    await close(server);
  }
});

test("graphify export endpoint writes operational map", async () => {
  const server = createHttpServer();
  const port = await listen(server);
  try {
    await fetch(`http://127.0.0.1:${port}/api/mission`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "draft whatsapp map test" })
    }).then((res) => res.json());

    const result = await fetch(`http://127.0.0.1:${port}/api/graphify/export`, {
      method: "POST"
    }).then((res) => res.json());

    assert.equal(result.ok, true);
    assert.equal(result.map.schema, "jarvis.graphify.operational_map.v1");
    assert.ok(result.map.counts.tools >= 1);
    assert.ok(result.map.counts.nodes >= result.map.counts.tools);
  } finally {
    await close(server);
  }
});
