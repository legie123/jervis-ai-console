import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ObsidianBridge } from "../packages/obsidian/src/index.js";

test("obsidian sync requires exact token and write flag", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-vault-"));
  const bridge = new ObsidianBridge({ vaultPath, writeEnabled: false });

  await assert.rejects(
    () => bridge.syncNote({ title: "Test", body: "Body", confirmToken: "NO" }),
    /SYNC_OBSIDIAN/
  );

  await assert.rejects(
    () => bridge.syncNote({ title: "Test", body: "Body", confirmToken: "SYNC_OBSIDIAN" }),
    /disabled/
  );
});

test("obsidian sync writes markdown inside vault", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-vault-"));
  const bridge = new ObsidianBridge({ vaultPath, writeEnabled: true });

  const result = await bridge.syncNote({
    title: "JARVIS Test",
    body: "# Hello",
    confirmToken: "SYNC_OBSIDIAN"
  });

  assert.equal(result.status, "written");
  assert.ok(result.targetPath.startsWith(vaultPath));

  const content = await fs.readFile(result.targetPath, "utf8");
  assert.match(content, /source: JARVIS_COMMAND_CENTER/);
  assert.match(content, /# Hello/);
});

test("obsidian summary writes state file counts", async () => {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-vault-"));
  const bridge = new ObsidianBridge({ vaultPath, writeEnabled: true });

  const result = await bridge.syncJarvisSummary({
    confirmToken: "SYNC_OBSIDIAN",
    state: {
      exportedAt: "2026-05-03T00:00:00.000Z",
      files: {
        "data/logs/audit.jsonl": "abc"
      }
    }
  });

  const content = await fs.readFile(result.targetPath, "utf8");
  assert.match(content, /JARVIS State Summary/);
  assert.match(content, /data\/logs\/audit\.jsonl: 3 chars/);
});
