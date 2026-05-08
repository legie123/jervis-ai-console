import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GraphifyBridge } from "../packages/graphify/src/index.js";

test("graphify builds operational map from project state", () => {
  const bridge = new GraphifyBridge();
  const map = bridge.buildOperationalMap({
    missions: [
      {
        id: "mission_1",
        input: "draft whatsapp",
        status: "waiting_confirmation",
        steps: [{ toolId: "whatsapp.draft" }]
      }
    ],
    tools: [{ id: "whatsapp.draft", label: "WhatsApp Draft", status: "PARTIAL", risk: "DANGEROUS" }],
    drafts: [{ id: "draft_1", to: "407", status: "pending_confirmation", risk: "DANGEROUS" }],
    inbox: [{ id: "msg_1", from: "407", body: "Salut", receivedAt: "2026-05-03T00:00:00.000Z" }],
    jobs: [{ id: "job_1", targetId: "draft_1", action: "whatsapp.ready_for_confirmation", status: "scheduled" }],
    audit: [{ action: "draft_created", details: { draftId: "draft_1" } }]
  });

  assert.equal(map.schema, "jarvis.graphify.operational_map.v1");
  assert.equal(map.counts.missions, 1);
  assert.ok(map.nodes.some((node) => node.id === "draft:draft_1"));
  assert.ok(map.edges.some((edge) => edge.from === "job:job_1" && edge.to === "draft:draft_1"));
});

test("graphify exports operational map json", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-graphify-"));
  const exportPath = path.join(dir, "map.json");
  const bridge = new GraphifyBridge({ exportPath });

  const result = await bridge.exportOperationalMap({
    missions: [],
    tools: [],
    drafts: [],
    inbox: [],
    jobs: [],
    audit: []
  });

  const saved = JSON.parse(await fs.readFile(exportPath, "utf8"));

  assert.equal(result.exportPath, exportPath);
  assert.equal(saved.status, "REAL");
  assert.equal(saved.counts.nodes, 2);
});
