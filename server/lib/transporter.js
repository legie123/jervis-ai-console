/**
 * server/lib/transporter.js — Phase 4 handoff Claude<->Codex
 * Author: claude-coder
 */

import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";

export function createTransporter(stateDir) {
  const file = path.join(stateDir, "transporter.json");

  async function read() {
    if (!fss.existsSync(file)) return null;
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch { return null; }
  }

  async function write(payload) {
    await fs.mkdir(stateDir, { recursive: true });
    const record = { ts: Date.now(), payload };
    await fs.writeFile(file, JSON.stringify(record, null, 2));
    return record;
  }

  async function clear() {
    if (fss.existsSync(file)) await fs.unlink(file);
  }

  return { read, write, clear, file };
}

export default { createTransporter };
