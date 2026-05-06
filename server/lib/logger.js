/**
 * server/lib/logger.js — JERVIS V3 Phase 4 (extract from jervis-boot.mjs)
 * Author: claude-coder
 * Pure ESM. Zero deps.
 */

import fs from "node:fs/promises";
import path from "node:path";

export const COLORS = Object.freeze({
  reset:  "\x1b[0m",
  orange: "\x1b[38;5;208m",
  cyan:   "\x1b[36m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  dim:    "\x1b[2m"
});

const LEVEL_COLOR = { ok: COLORS.green, info: COLORS.cyan, warn: COLORS.yellow, err: COLORS.red, mod: COLORS.orange };

export function createLogger({ logDir, ringLimit = 50, onRecord } = {}) {
  const ring = [];

  async function appendFile(line) {
    if (!logDir) return;
    try {
      await fs.mkdir(logDir, { recursive: true });
      const file = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`);
      await fs.appendFile(file, line);
    } catch { /* swallow */ }
  }

  function log(level, mod, msg) {
    const ts = new Date().toISOString().slice(11, 19);
    const lvl = String(level).toLowerCase();
    const color = LEVEL_COLOR[lvl] || COLORS.cyan;
    const line = `${COLORS.dim}[${ts}]${COLORS.reset} ${color}${lvl.toUpperCase().padEnd(4)}${COLORS.reset} ${COLORS.orange}${String(mod).padEnd(14)}${COLORS.reset} ${msg}`;
    console.log(line);
    const record = { ts, level: lvl, mod, msg };
    ring.unshift(record);
    if (ring.length > ringLimit) ring.length = ringLimit;
    if (typeof onRecord === "function") {
      try { onRecord(record); } catch { /* swallow */ }
    }
    appendFile(`[${ts}] ${lvl.toUpperCase()} ${mod} ${msg}\n`);
    return record;
  }

  function snapshot() { return ring.map((r) => ({ ...r })); }

  return { log, snapshot, COLORS };
}

export default { createLogger, COLORS };
