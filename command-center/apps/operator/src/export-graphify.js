import { exportGraphifyMap } from "./index.js";

const result = await exportGraphifyMap();
console.log(JSON.stringify(result, null, 2));
