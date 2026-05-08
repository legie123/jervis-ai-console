import { BackupManager } from "../../../packages/memory/src/index.js";

const backupPath = process.argv[2];
const confirmToken = process.argv[3];

if (!backupPath) {
  console.error("Usage: node apps/operator/src/restore.js data/exports/backup-name RESTORE_JARVIS");
  process.exit(2);
}

const manager = new BackupManager();
const result = await manager.restoreBackup(backupPath, confirmToken);

console.log(JSON.stringify(result, null, 2));
