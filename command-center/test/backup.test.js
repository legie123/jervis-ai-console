import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BackupManager } from "../packages/memory/src/index.js";

async function writeFixture(root) {
  await fs.mkdir(path.join(root, "data/memory"), { recursive: true });
  await fs.mkdir(path.join(root, "data/drafts"), { recursive: true });
  await fs.mkdir(path.join(root, "data/logs"), { recursive: true });
  await fs.mkdir(path.join(root, "docs"), { recursive: true });
  await fs.mkdir(path.join(root, "config"), { recursive: true });
  await fs.writeFile(path.join(root, "data/memory/whatsapp-inbox.json"), "[]\n");
  await fs.writeFile(path.join(root, "data/drafts/whatsapp-drafts.json"), "[]\n");
  await fs.writeFile(path.join(root, "data/drafts/scheduled-jobs.json"), "[]\n");
  await fs.writeFile(path.join(root, "data/logs/audit.jsonl"), "{\"ok\":true}\n");
  await fs.writeFile(path.join(root, "docs/LOCAL_SETUP.md"), "setup\n");
  await fs.writeFile(path.join(root, "config/permissions.json"), "{}\n");
}

test("backup manager creates manifest and exports state", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-backup-"));
  await writeFixture(root);

  const manager = new BackupManager({ root });
  const backup = await manager.createBackup("test");
  const manifest = JSON.parse(await fs.readFile(path.join(backup.backupPath, "manifest.json"), "utf8"));
  const state = await manager.exportState();

  assert.equal(manifest.restoreRequiresToken, "RESTORE_JARVIS");
  assert.ok(manifest.copied.includes("data/memory"));
  assert.ok(state.files["data/logs/audit.jsonl"].includes("\"ok\":true"));
});

test("restore requires token and stays inside exports", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-restore-"));
  await writeFixture(root);

  const manager = new BackupManager({ root });
  const backup = await manager.createBackup("restore");

  await assert.rejects(
    () => manager.restoreBackup(path.relative(root, backup.backupPath), "NO"),
    /RESTORE_JARVIS/
  );

  await fs.writeFile(path.join(root, "docs/LOCAL_SETUP.md"), "changed\n");
  const restored = await manager.restoreBackup(path.relative(root, backup.backupPath), "RESTORE_JARVIS");
  const restoredDoc = await fs.readFile(path.join(root, "docs/LOCAL_SETUP.md"), "utf8");

  assert.ok(restored.restored.includes("docs"));
  assert.equal(restoredDoc, "setup\n");
});
