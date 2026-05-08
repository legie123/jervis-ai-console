import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpServer } from "../apps/operator/src/http.js";

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

test("ruflo and good_mood feeds return audit rows when adapters are enabled", async () => {
  const prev = {
    JARVIS_AUDIT_LOG: process.env.JARVIS_AUDIT_LOG,
    JARVIS_ADAPTER_RUFLO_ENABLED: process.env.JARVIS_ADAPTER_RUFLO_ENABLED,
    JARVIS_ADAPTER_GOOD_MOOD_ENABLED: process.env.JARVIS_ADAPTER_GOOD_MOOD_ENABLED,
    JARVIS_ADAPTER_OBSIDIAN_ENABLED: process.env.JARVIS_ADAPTER_OBSIDIAN_ENABLED,
    JARVIS_ADAPTERS_ENABLED: process.env.JARVIS_ADAPTERS_ENABLED
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-adapter-feed-"));
  const auditPath = path.join(dir, "audit.jsonl");
  const rows = [
    {
      ts: "2026-05-09T12:00:00.000Z",
      source: "ruflo",
      action: "swarm_spawn",
      status: "ok",
      risk: "REAL",
      details: { agent: "worker-1" }
    },
    {
      ts: "2026-05-09T12:01:00.000Z",
      source: "jarvis",
      action: "good_mood_checkin",
      status: "recorded",
      risk: "LOW",
      details: {}
    }
  ];
  fs.writeFileSync(
    auditPath,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    "utf8"
  );

  process.env.JARVIS_AUDIT_LOG = auditPath;
  process.env.JARVIS_ADAPTER_RUFLO_ENABLED = "true";
  process.env.JARVIS_ADAPTER_GOOD_MOOD_ENABLED = "true";
  process.env.JARVIS_ADAPTER_OBSIDIAN_ENABLED = "false";
  delete process.env.JARVIS_ADAPTERS_ENABLED;

  const server = createHttpServer();
  const port = await listen(server);
  try {
    const ruflo = await fetch(`http://127.0.0.1:${port}/api/ruflo/feed`).then((res) => res.json());
    assert.equal(ruflo.ok, true);
    assert.equal(ruflo.enabled, true);
    assert.equal(ruflo.entries.length, 1);
    assert.equal(ruflo.entries[0].title, "swarm_spawn");

    const mood = await fetch(`http://127.0.0.1:${port}/api/good-mood/feed`).then((res) => res.json());
    assert.equal(mood.ok, true);
    assert.equal(mood.enabled, true);
    assert.equal(mood.entries.length, 1);
    assert.equal(mood.entries[0].title, "good_mood_checkin");
  } finally {
    await close(server);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const key of Object.keys(prev)) {
      const v = prev[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
});
