#!/usr/bin/env node
/**
 * JERVIS · CAPTAIN'S LOG AUTO-PIPELINE
 * Aggregates: state.json + today's logs + recent git commits → writes daily summary into Obsidian vault.
 *
 * Run manually:  node jervis-captains-log.mjs
 * Run via cron:  0 22 * * *  (10pm local)
 * Run via scheduled-tasks MCP: see jervis-boot.mjs companion
 *
 * Output: <vault>/Captain's Log/<YYYY-MM-DD>.md  (appends, frontmatter once)
 */

import fs   from 'node:fs/promises';
import fss  from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const VAULT_ROOT  = process.env.JERVIS_VAULT  || '/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI';
const STATE_DIR   = process.env.JERVIS_STATE  || path.join(path.dirname(new URL(import.meta.url).pathname), 'state');
const REPO_ROOT   = process.env.JERVIS_REPO   || VAULT_ROOT;
const STATUS_URL  = process.env.JERVIS_STATUS || 'http://localhost:7777/status';

const today  = new Date().toISOString().slice(0,10);
const stamp  = new Date().toISOString();

// ============= COLLECTORS =============

async function readState() {
  const file = path.join(STATE_DIR, 'state.json');
  if (!fss.existsSync(file)) return null;
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function readLiveStatus() {
  try {
    const r = await fetch(STATUS_URL, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function readTodayLogs() {
  const file = path.join(STATE_DIR, 'logs', `${today}.log`);
  if (!fss.existsSync(file)) return [];
  const raw = await fs.readFile(file, 'utf8');
  return raw.trim().split('\n').filter(Boolean);
}

function readGitActivity() {
  try {
    const since = '24 hours ago';
    const out = execSync(
      `git -C "${REPO_ROOT}" log --since="${since}" --pretty=format:"%h|%an|%s" --no-merges`,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    if (!out) return [];
    return out.split('\n').map(l => {
      const [hash, author, ...msg] = l.split('|');
      return { hash, author, msg: msg.join('|') };
    });
  } catch { return []; }
}

function readGitDiffStat() {
  try {
    const out = execSync(
      `git -C "${REPO_ROOT}" diff --shortstat HEAD@{24.hours.ago} HEAD 2>/dev/null`,
      { stdio: ['ignore', 'pipe', 'ignore'] }
    ).toString().trim();
    return out || null;
  } catch { return null; }
}

// ============= ANALYSIS =============

function summarizeLogs(lines) {
  const counts = { OK: 0, INFO: 0, WARN: 0, ERR: 0, MOD: 0 };
  const errors = [];
  const warns  = [];
  for (const l of lines) {
    const m = l.match(/\[\d{2}:\d{2}:\d{2}\]\s+(\w+)\s+(\w+)\s+(.*)/);
    if (!m) continue;
    const [, level, mod, msg] = m;
    counts[level] = (counts[level] || 0) + 1;
    if (level === 'ERR')  errors.push({ mod, msg });
    if (level === 'WARN') warns.push({ mod, msg });
  }
  return { counts, errors, warns, total: lines.length };
}

function modulesTable(state) {
  if (!state?.modules) return '_No state available._';
  const rows = Object.entries(state.modules)
    .map(([k, v]) => `| ${k} | ${v.status} | ${v.note || ''} |`).join('\n');
  return `| Module | Status | Note |\n|---|---|---|\n${rows}`;
}

// ============= COMPOSER =============

function compose({ state, status, logs, git, diffStat }) {
  const summary = summarizeLogs(logs);
  const modTable = modulesTable(status || state);

  const gitSection = git.length
    ? git.map(c => `- \`${c.hash}\` **${c.author}** — ${c.msg}`).join('\n')
    : '_No commits in last 24h._';

  const errSection = summary.errors.length
    ? summary.errors.slice(0,10).map(e => `- **${e.mod}** — ${e.msg}`).join('\n')
    : '_None._';

  const warnSection = summary.warns.length
    ? summary.warns.slice(0,10).map(w => `- **${w.mod}** — ${w.msg}`).join('\n')
    : '_None._';

  const metrics = (status || state)?.metrics || {};
  const sessionId = (status || state)?.sessionId || 'unknown';
  const stardate  = (status || state)?.stardate  || 'n/a';

  return `
## ${new Date().toISOString().slice(11,19)} · Daily Summary

**Session:** \`${sessionId}\`
**Stardate:** ${stardate}
**Tasks executed:** ${metrics.tasks ?? 0}   |   **Alerts:** ${metrics.alerts ?? 0}   |   **Tokens:** ${metrics.tokens ?? 0}

### Modules
${modTable}

### Activity (last 24h)
- Log lines: **${summary.total}**  · OK ${summary.counts.OK || 0} · INFO ${summary.counts.INFO || 0} · WARN ${summary.counts.WARN || 0} · ERR ${summary.counts.ERR || 0}
- Git commits: **${git.length}**${diffStat ? `\n- Diff: ${diffStat}` : ''}

### Errors
${errSection}

### Warnings
${warnSection}

### Git
${gitSection}

---
`;
}

// ============= WRITER =============

async function writeToVault(body) {
  if (!fss.existsSync(VAULT_ROOT)) {
    console.error(`[ERR] vault NOT FOUND: ${VAULT_ROOT}`);
    process.exit(2);
  }
  const dir = path.join(VAULT_ROOT, "Captain's Log");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${today}.md`);

  let content = '';
  if (!fss.existsSync(file)) {
    content = `---\ndate: ${today}\ntags: [jervis, captains-log, auto, daily-summary]\nsource: jervis-captains-log.mjs\n---\n\n# Captain's Log — ${today}\n`;
  }
  content += body;
  await fs.appendFile(file, content);
  return file;
}

// ============= MAIN =============

(async () => {
  const [state, status, logs] = await Promise.all([
    readState(),
    readLiveStatus(),
    readTodayLogs(),
  ]);
  const git      = readGitActivity();
  const diffStat = readGitDiffStat();

  const body = compose({ state, status, logs, git, diffStat });
  const file = await writeToVault(body);

  console.log(`[OK]  ${stamp}`);
  console.log(`[OK]  Captain's Log written → ${file}`);
  console.log(`[OK]  Sources: state=${!!state} live=${!!status} logs=${logs.length} commits=${git.length}`);
})().catch(err => {
  console.error('[ERR] pipeline failed:', err.message);
  process.exit(1);
});
