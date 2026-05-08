import fs from "node:fs/promises";
import path from "node:path";

const DATA_PATHS = [
  "data/memory",
  "data/drafts",
  "data/logs",
  "docs",
  "config"
];

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

export class BackupManager {
  constructor({ root = process.cwd(), exportDir = "data/exports" } = {}) {
    this.root = root;
    this.exportDir = exportDir;
  }

  async createBackup(label = "") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeLabel = label ? `-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
    const backupName = `backup-${timestamp}${safeLabel}`;
    const backupPath = path.join(this.root, this.exportDir, backupName);

    const copied = [];
    for (const item of DATA_PATHS) {
      const didCopy = await copyIfExists(path.join(this.root, item), path.join(backupPath, item));
      if (didCopy) copied.push(item);
    }

    const manifest = {
      name: backupName,
      createdAt: new Date().toISOString(),
      root: this.root,
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

    const files = [
      "data/memory/whatsapp-inbox.json",
      "data/memory/missions.json",
      "data/drafts/whatsapp-drafts.json",
      "data/drafts/scheduled-jobs.json",
      "data/logs/audit.jsonl"
    ];

    for (const file of files) {
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
      const source = path.join(resolvedBackup, item);
      const target = path.join(this.root, item);
      await fs.rm(target, { recursive: true, force: true });
      await fs.cp(source, target, { recursive: true });
      restored.push(item);
    }

    return { restored, manifest };
  }
}
