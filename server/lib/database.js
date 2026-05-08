/**
 * server/lib/database.js — Phase 4 Captain's Log writer
 * Author: claude-coder
 */

import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";

export function createCaptainsLog({ vaultRoot, dirName = "Captain's Log", stardateFn }) {
  const dir = path.join(vaultRoot, dirName);

  async function write({ title, body, frontmatter = {} }) {
    if (!fss.existsSync(vaultRoot)) {
      throw new Error(`vault not found: ${vaultRoot}`);
    }
    await fs.mkdir(dir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `${date}.md`);
    let header = "";
    if (!fss.existsSync(file)) {
      const fm = {
        date,
        stardate: stardateFn ? stardateFn() : "",
        tags: ["jervis", "captains-log", "auto"],
        ...frontmatter
      };
      const fmLines = Object.entries(fm).map(([k, v]) =>
        Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${v}`
      ).join("\n");
      header = `---\n${fmLines}\n---\n\n# Captain's Log — ${date}\n\n`;
    }
    const ts = new Date().toISOString().slice(11, 19);
    const block = `\n## ${ts} · ${title}\n\n${body}\n`;
    await fs.appendFile(file, header + block);
    return file;
  }

  function exists() { return fss.existsSync(vaultRoot); }
  return { write, exists, dir };
}

export default { createCaptainsLog };
