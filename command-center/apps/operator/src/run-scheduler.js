import { runDueScheduler } from "./index.js";

const result = await runDueScheduler();
console.log(JSON.stringify(result, null, 2));
