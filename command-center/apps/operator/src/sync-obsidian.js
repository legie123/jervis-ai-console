import { BackupManager } from "../../../packages/memory/src/index.js";
import { createOperator } from "./index.js";

const confirmToken = process.argv[2];
const operator = createOperator();
const state = await new BackupManager().exportState();
const result = await operator.obsidian.syncJarvisSummary({ state, confirmToken });

console.log(JSON.stringify(result, null, 2));
