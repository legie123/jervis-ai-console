import fs from "node:fs/promises";
import path from "node:path";
import { dataRoot, resolveDataProfile } from "../../core/src/data-paths.js";

function uniquePaths(items) {
  return [...new Set(items)];
}

function dataDirectories(profile = resolveDataProfile()) {
  const root = dataRoot(profile);
  return uniquePaths([
    `${root}/memory`,
    `${root}/drafts`,
    `${root}/logs`,
    "data/memory",
    "data/drafts",
    "data/logs",
    "docs",
    "config"
  ]);
}

function stateFileCandidates(profile = resolveDataProfile()) {
  const root = dataRoot(profile);
  return uniquePaths([
    `${root}/memory/whatsapp-inbox.json`,
    `${root}/memory/missions.json`,
    `${root}/drafts/whatsapp-drafts.json`,
    `${root}/drafts/scheduled-jobs.json`,
    `${root}/logs/audit.jsonl`,
    "data/memory/whatsapp-inbox.json",
    "data/memory/missions.json",
    "data/drafts/whatsapp-drafts.json",
    "data/drafts/scheduled-jobs.json",
    "data/logs/audit.jsonl"
  ]);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(source, target) {
  if (!(await exists(source))) return false;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
  return true;
}

function normalizeManifestPath(item) {
  const normalized = path.normalize(String(item || "")).replace(/^[/\\]+/, "");
  if (!normalized || normalized === ".") {
    throw new Error("Invalid backup item path");
  }
  if (normalized.startsWith("..")) {
    throw new Error("Backup item path escape blocked");
  }
  return normalized;
}

export class BackupManager {
  constructor({ root = process.cwd(), exportDir = "data/exports" } = {}) {
    this.root = root;
    this.exportDir = exportDir;
    this.profile = resolveDataProfile();
  }

  async createBackup(label = "") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeLabel = label ? `-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
    const backupName = `backup-${timestamp}${safeLabel}`;
    const backupPath = path.join(this.root, this.exportDir, backupName);

    const copied = [];
    for (const item of dataDirectories(this.profile)) {
      const didCopy = await copyIfExists(path.join(this.root, item), path.join(backupPath, item));
      if (didCopy) copied.push(item);
    }

    const manifest = {
      name: backupName,
      createdAt: new Date().toISOString(),
      root: this.root,
      dataProfile: this.profile,
      copied,
      restoreRequiresToken: "RESTORE_JARVIS"
    };

    await fs.mkdir(backupPath, { recursive: true });
    await fs.writeFile(path.join(backupPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return { backupPath, manifest };
  }

  async exportState() {
    const state = {
      exportedAt: new Date().toISOString(),
      files: {}
    };

    for (const file of stateFileCandidates(this.profile)) {
      const fullPath = path.join(this.root, file);
      if (await exists(fullPath)) {
        state.files[file] = await fs.readFile(fullPath, "utf8");
      }
    }

    return state;
  }

  async restoreBackup(backupPath, confirmToken) {
    if (confirmToken !== "RESTORE_JARVIS") {
      throw new Error("Missing exact RESTORE_JARVIS confirmation token");
    }

    const resolvedBackup = path.resolve(this.root, backupPath);
    const allowedExports = path.resolve(this.root, this.exportDir);
    if (!resolvedBackup.startsWith(allowedExports)) {
      throw new Error("Restore path must be inside data/exports");
    }

    const manifestRaw = await fs.readFile(path.join(resolvedBackup, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);

    const restored = [];
    for (const item of manifest.copied || []) {
      const safeItem = normalizeManifestPath(item);
      const source = path.join(resolvedBackup, safeItem);
      const target = path.join(this.root, safeItem);
      if (!target.startsWith(this.root)) {
        throw new Error(`Restore target escaped root (${safeItem})`);
      }
      await fs.rm(target, { recursive: true, force: true });
      await fs.cp(source, target, { recursive: true });
      restored.push(safeItem);
    }

    return { restored, manifest };
  }
}
