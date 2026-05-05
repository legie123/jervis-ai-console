import { BackupManager } from "../../../packages/memory/src/index.js";

const manager = new BackupManager();
const label = process.argv[2] || "";
const result = await manager.createBackup(label);

console.log(JSON.stringify(result, null, 2));
