import { BackupManager } from "../../../packages/memory/src/index.js";

const manager = new BackupManager();
const state = await manager.exportState();

console.log(JSON.stringify(state, null, 2));
