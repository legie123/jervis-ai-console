/**
 * JERVIS · BRAIN SYNC (in-process)
 * One-way mirror: canonical /Antigraity/Jarvis AI/BRAIN/ → mirror /Antigraity/TRADE AI/Jarvis AI/BRAIN/
 *
 * Pure Node fs. No shell. No TCC issues (runs as the user who started jervis-boot.mjs).
 * Replaces failing LaunchAgent approach.
 *
 * Behavior:
 *  - mirrors files (recursive) from CANONICAL → MIRROR
 *  - removes files in MIRROR that don't exist in CANONICAL (true mirror)
 *  - skips: .DS_Store, *.swp, _assets/cache/
 *  - skips files that are byte-identical (size + mtime within 1s)
 *  - logs every change to onLog callback
 *
 * Usage in jervis-boot.mjs:
 *   import { startBrainSync } from './jervis-brain-sync.mjs';
 *   startBrainSync({ onLog: (lvl, msg) => log(lvl, 'BrainSync', msg), intervalMs: 15 * 60_000 });
 */

import fs   from 'node:fs/promises';
import fss  from 'node:fs';
import path from 'node:path';

const CANONICAL = process.env.JERVIS_BRAIN_CANONICAL
                || '/Users/user/Desktop/BUSSINES/Antigraity/Jarvis AI/BRAIN';
const MIRROR    = process.env.JERVIS_BRAIN_MIRROR
                || '/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI/Jarvis AI/BRAIN';

const SKIP_NAMES   = new Set(['.DS_Store', 'Thumbs.db']);
const SKIP_PATTERN = /\.(swp|swo)$|^_assets\/cache/i;

async function* walk(dir, base = dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (SKIP_NAMES.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel  = path.relative(base, full);
    if (SKIP_PATTERN.test(rel)) continue;
    if (e.isDirectory()) {
      yield { type: 'dir', rel, full };
      yield* walk(full, base);
    } else if (e.isFile()) {
      yield { type: 'file', rel, full };
    }
  }
}

async function listAll(root) {
  const map = new Map();
  if (!fss.existsSync(root)) return map;
  for await (const item of walk(root, root)) {
    if (item.type === 'file') {
      const stat = await fs.stat(item.full);
      map.set(item.rel, { size: stat.size, mtime: stat.mtimeMs });
    } else {
      map.set(item.rel + '/', { dir: true });
    }
  }
  return map;
}

export async function syncOnce(opts = {}) {
  const { onLog = () => {} } = opts;
  if (!fss.existsSync(CANONICAL)) {
    onLog('err', `canonical missing: ${CANONICAL}`);
    return { ok: false, reason: 'canonical-missing' };
  }
  await fs.mkdir(MIRROR, { recursive: true });

  const t0 = Date.now();
  const [canMap, mirMap] = await Promise.all([listAll(CANONICAL), listAll(MIRROR)]);
  let copied = 0, removed = 0, skipped = 0, errors = 0;

  // Pass 1: copy/update canonical → mirror
  for (const [rel, meta] of canMap) {
    const src = path.join(CANONICAL, rel.replace(/\/$/, ''));
    const dst = path.join(MIRROR,    rel.replace(/\/$/, ''));
    try {
      if (meta.dir) {
        await fs.mkdir(dst, { recursive: true });
        continue;
      }
      const mirrorMeta = mirMap.get(rel);
      if (mirrorMeta && !mirrorMeta.dir
          && mirrorMeta.size === meta.size
          && Math.abs(mirrorMeta.mtime - meta.mtime) < 1000) {
        skipped++;
        continue;
      }
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
      // preserve mtime
      const stat = await fs.stat(src);
      await fs.utimes(dst, stat.atime, stat.mtime);
      copied++;
    } catch (e) {
      errors++;
      onLog('err', `copy ${rel}: ${e.message}`);
    }
  }

  // Pass 2: remove from mirror what's not in canonical
  for (const [rel, meta] of mirMap) {
    if (canMap.has(rel)) continue;
    const dst = path.join(MIRROR, rel.replace(/\/$/, ''));
    try {
      if (meta.dir) {
        await fs.rm(dst, { recursive: true, force: true });
      } else {
        await fs.unlink(dst);
      }
      removed++;
    } catch (e) {
      errors++;
      onLog('err', `remove ${rel}: ${e.message}`);
    }
  }

  const dur = Date.now() - t0;
  const summary = { copied, removed, skipped, errors, durationMs: dur };
  if (copied + removed + errors > 0) {
    onLog(errors ? 'warn' : 'ok',
          `sync ${copied}↑ ${removed}✗ ${skipped}=  in ${dur}ms${errors ? ` (${errors} errors)` : ''}`);
  }
  return { ok: errors === 0, ...summary };
}

export function startBrainSync({ onLog = () => {}, intervalMs = 15 * 60_000 } = {}) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try { await syncOnce({ onLog }); }
    catch (e) { onLog('err', `sync exception: ${e.message}`); }
  };
  const id = setInterval(tick, intervalMs);
  tick(); // first run immediately
  onLog('mod', `brain sync loop started (every ${intervalMs/60_000} min)`);
  return { stop: () => { stopped = true; clearInterval(id); } };
}

// CLI mode for manual run
if (import.meta.url === `file://${process.argv[1]}`) {
  const log = (lvl, msg) => console.log(`[${lvl.toUpperCase()}] ${msg}`);
  log('mod', `canonical: ${CANONICAL}`);
  log('mod', `mirror:    ${MIRROR}`);
  syncOnce({ onLog: log }).then(r => console.log(JSON.stringify(r, null, 2)));
}
