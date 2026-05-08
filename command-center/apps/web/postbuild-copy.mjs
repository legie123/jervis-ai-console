import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, "src/graph-viewer.js");
const dest = path.join(root, "dist/graph-viewer.js");

fs.copyFileSync(src, dest);
