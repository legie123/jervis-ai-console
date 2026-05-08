#!/usr/bin/env node
/**
 * JERVIS v2 — BOOT SCRIPT
 * Pornește swarm config + sensors + shields + scrie session în Obsidian vault.
 *
 * Run:  node jervis-boot.mjs
 * Stop: Ctrl+C
 *
 * Arhitectură (vezi jervis-architecture.html):
 *   MOD-01 Bridge        — UI separat (Vite/React, port 5173)
 *   MOD-02 Warp Core     — acest proces (router + supervisor)
 *   MOD-03 Sensors       — pollers WhatsApp/Obsidian/GitHub/Calendar
 *   MOD-04 Holodeck      — sandbox (lansat on-demand)
 *   MOD-05 Shields       — middleware (aidefence + injection guard)
 *   MOD-06 Transporter   — handoff Claude↔Codex (state file shared)
 *   MOD-07 Database      — Obsidian vault + state/*.json
 *
 * Tool calls reale (orchestrate de agentul care execută acest script):
 *   ruflo.swarm_init({ topology: "mesh", max_agents: 5 })
 *   ruflo.agent_spawn × 5
 *   ruflo.agentdb_session-start
 *   ruflo.hooks_session-start
 *   ruflo.aidefence_scan pe orice input
 *   obsidian.obsidian_write_note pe Captain's Log
 */

import http   from 'node:http';
import fs     from 'node:fs/promises';
import fss    from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';
import { spawn } from 'node:child_process';
import { scan as aidefenceScan, hasPii } from './jervis-aidefence.mjs';
import { dockerAvailable, runInDocker }  from './jervis-holodeck-docker.mjs';
import { startIntentLoop }                from './jervis-whatsapp-intent.mjs';

// ============= CONFIG =============
const VAULT_ROOT  = process.env.JERVIS_VAULT || '/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI';
const STATE_DIR   = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), 'state');
const LOG_DIR     = path.join(STATE_DIR, 'logs');
const PORT        = process.env.JERVIS_PORT ? Number(process.env.JERVIS_PORT) : 7777;
const WA_BRIDGE   = process.env.JERVIS_WA_BRIDGE || 'http://localhost:8787';
const SESSION_ID  = `jervis_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const SANDBOX_TIMEOUT_MS = 8000;
const SANDBOX_ALLOWED_LANGS = new Set(['node', 'bash']);

const STARDATE = () => {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  return `${(now.getFullYear()-1947).toString()}${dayOfYear.toString().padStart(3,'0')}.${now.getHours()}`;
};

// ============= AGENTS BLUEPRINT =============
const AGENTS = [
  { id: 'claude-coder',     role: 'implementation', model: 'claude-opus-4-7', mod: 'WarpCore'  },
  { id: 'codex-reviewer',   role: 'code-review',    model: 'gpt-5-codex',     mod: 'Holodeck'  },
  { id: 'gemini-researcher',role: 'web-research',   model: 'gemini-3-pro',    mod: 'Sensors'   },
  { id: 'sensor-poll',      role: 'event-watcher',  model: 'haiku-4-5',       mod: 'Sensors'   },
  { id: 'memory-keeper',    role: 'persistence',    model: 'haiku-4-5',       mod: 'Database'  },
];

// ============= STATE =============
const state = {
  sessionId: SESSION_ID,
  startedAt: new Date().toISOString(),
  stardate:  STARDATE(),
  alert:     'GREEN',
  swarm: { topology: 'mesh', maxAgents: 5, agents: AGENTS },
  modules: {
    'MOD-01.Bridge':      { status: 'OFFLINE', note: 'launch separately: cd src && pnpm dev' },
    'MOD-02.WarpCore':    { status: 'ONLINE',  note: 'this process' },
    'MOD-03.Sensors':     { status: 'INIT',    note: 'pollers starting' },
    'MOD-04.Holodeck':    { status: 'STANDBY', note: 'on-demand sandbox' },
    'MOD-05.Shields':     { status: 'ONLINE',  note: 'aidefence + guard active' },
    'MOD-06.Transporter': { status: 'ONLINE',  note: 'handoff file ready' },
    'MOD-07.Database':    { status: 'ONLINE',  note: `vault: ${VAULT_ROOT}` },
  },
  metrics: { tokens: 0, cost: 0, tasks: 0, alerts: 0 },
  recentEvents: [],
};

// ============= LOGGING =============
const COLORS = { reset:'\x1b[0m', orange:'\x1b[38;5;208m', cyan:'\x1b[36m', red:'\x1b[31m', yellow:'\x1b[33m', green:'\x1b[32m', dim:'\x1b[2m' };

function log(level, mod, msg) {
  const ts = new Date().toISOString().slice(11,19);
  const lvlColor = { ok: COLORS.green, info: COLORS.cyan, warn: COLORS.yellow, err: COLORS.red, mod: COLORS.orange }[level] || COLORS.cyan;
  const line = `${COLORS.dim}[${ts}]${COLORS.reset} ${lvlColor}${level.toUpperCase().padEnd(4)}${COLORS.reset} ${COLORS.orange}${mod.padEnd(14)}${COLORS.reset} ${msg}`;
  console.log(line);
  state.recentEvents.unshift({ ts, level, mod, msg });
  state.recentEvents = state.recentEvents.slice(0, 50);
  appendLogFile(`[${ts}] ${level.toUpperCase()} ${mod} ${msg}\n`).catch(()=>{});
}

async function appendLogFile(line) {
  const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0,10)}.log`);
  await fs.appendFile(file, line);
}

// ============= SHIELDS — uses jervis-aidefence module (17+ injection patterns + PII + entropy) =============
function shieldsScan(input) {
  const r = aidefenceScan(input || '', { quick: false });
  return {
    safe: r.safe,
    severity: r.severity,
    score: r.score,
    pii: r.pii,
    threats: r.threats.map(t => `${t.type}:${t.match}`),
  };
}

// ============= OBSIDIAN VAULT WRITER =============
async function writeCaptainsLog(entry) {
  try {
    const date = new Date().toISOString().slice(0,10);
    const captainsLogDir = path.join(VAULT_ROOT, "Captain's Log");
    await fs.mkdir(captainsLogDir, { recursive: true });
    const file = path.join(captainsLogDir, `${date}.md`);

    let header = '';
    if (!fss.existsSync(file)) {
      header = `---\ndate: ${date}\nstardate: ${state.stardate}\ntags: [jervis, captains-log, auto]\n---\n\n# Captain's Log — ${date}\n\n`;
    }
    const block = `\n## ${new Date().toISOString().slice(11,19)} · ${entry.title}\n\n${entry.body}\n`;
    await fs.appendFile(file, header + block);
    return file;
  } catch (err) {
    log('err', 'Database', `Captain's Log write failed: ${err.message}`);
    return null;
  }
}

// ============= STATE PERSISTENCE =============
async function persistState() {
  const file = path.join(STATE_DIR, 'state.json');
  await fs.writeFile(file, JSON.stringify(state, null, 2));
}

async function readHandoff() {
  const file = path.join(STATE_DIR, 'transporter.json');
  if (!fss.existsSync(file)) return null;
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeHandoff(payload) {
  const file = path.join(STATE_DIR, 'transporter.json');
  await fs.writeFile(file, JSON.stringify({ ts: Date.now(), payload }, null, 2));
}

// ============= SENSORS — REAL pollers =============
async function pollWhatsAppBridge() {
  try {
    const r = await fetch(`${WA_BRIDGE}/health`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error(`http ${r.status}`);
    const j = await r.json().catch(() => ({}));
    const queued = j.pendingMessages ?? j.queued ?? 0;
    state.modules['MOD-03.Sensors'].note = `WA bridge UP @ ${WA_BRIDGE} · queued=${queued}`;
    log('ok', 'Sensors', `WA bridge healthy · queued=${queued}`);
    return { up: true, queued };
  } catch (e) {
    state.modules['MOD-03.Sensors'].note = `WA bridge DOWN @ ${WA_BRIDGE}`;
    log('warn', 'Sensors', `WA bridge unreachable: ${e.message}`);
    return { up: false, error: e.message };
  }
}

async function pollVault() {
  try {
    if (!fss.existsSync(VAULT_ROOT)) throw new Error('vault missing');
    const items = await fs.readdir(VAULT_ROOT);
    log('ok', 'Sensors', `vault scan — ${items.length} root entries`);
    return { up: true, count: items.length };
  } catch (e) {
    log('warn', 'Sensors', `vault scan failed: ${e.message}`);
    return { up: false };
  }
}

function startSensors() {
  pollWhatsAppBridge();
  pollVault();
  setInterval(pollWhatsAppBridge, 60_000);
  setInterval(pollVault,          90_000);
  state.modules['MOD-03.Sensors'].status = 'ONLINE';
  log('mod', 'Sensors', `pollers started (WA ${WA_BRIDGE} 60s, Vault 90s)`);
}

// ============= HTTP STATUS SERVER =============
function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/' || url.pathname === '/status') {
      res.end(JSON.stringify(state, null, 2));
      return;
    }

    if (url.pathname === '/scan' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const result = shieldsScan(body);
        if (!result.safe) {
          state.metrics.alerts++;
          log('warn', 'Shields', `injection blocked (regex): ${result.threats.join(', ')}`);
        }
        res.end(JSON.stringify(result));
      });
      return;
    }

    // Shields v2 — deep verdict from external aidefence (ruflo MCP)
    // POST body: { input, verdict: { safe, threats, severity, pii } }
    // Used when an agent (Claude/Codex) calls ruflo:aidefence_scan and forwards result.
    if (url.pathname === '/scan-deep' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { input, verdict } = JSON.parse(body);
          const regexResult = shieldsScan(input || '');
          const merged = {
            safe: (verdict?.safe ?? true) && regexResult.safe,
            severity: verdict?.severity || (regexResult.safe ? 'low' : 'high'),
            threats: [...(verdict?.threats || []), ...regexResult.threats],
            pii: verdict?.pii || false,
            source: 'shields-v2 (regex + aidefence)',
          };
          if (!merged.safe) {
            state.metrics.alerts++;
            log('err', 'Shields', `DEEP SCAN BLOCKED — severity=${merged.severity} threats=${merged.threats.length} pii=${merged.pii}`);
            // Auto-log to Captain's Log on high severity
            if (merged.severity === 'high' || merged.severity === 'critical') {
              await writeCaptainsLog({
                title: `Shields Alert · ${merged.severity.toUpperCase()}`,
                body: `**Source:** ${merged.source}\n**Threats:** ${merged.threats.join(', ')}\n**PII:** ${merged.pii}\n**Input (truncated):** \`${(input||'').slice(0,200)}\``,
              });
            }
          } else {
            log('ok', 'Shields', 'deep scan passed');
          }
          res.end(JSON.stringify(merged));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/log' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { title, content } = JSON.parse(body);
          const file = await writeCaptainsLog({ title, body: content });
          res.end(JSON.stringify({ ok: !!file, file }));
        } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    if (url.pathname === '/handoff' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        await writeHandoff(JSON.parse(body));
        log('mod', 'Transporter', 'handoff written');
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (url.pathname === '/handoff' && req.method === 'GET') {
      const h = await readHandoff();
      res.end(JSON.stringify(h || { empty: true }));
      return;
    }

    // Alert level change
    if (url.pathname === '/alert' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { level } = JSON.parse(body);
          const lvl = String(level || '').toUpperCase();
          if (!['GREEN','YELLOW','RED'].includes(lvl)) {
            res.statusCode = 400; res.end(JSON.stringify({ error: 'level must be GREEN/YELLOW/RED' })); return;
          }
          const prev = state.alert; state.alert = lvl;
          const kind = lvl === 'RED' ? 'err' : lvl === 'YELLOW' ? 'warn' : 'ok';
          log(kind, 'WarpCore', `alert ${prev} → ${lvl}`);
          if (lvl === 'RED') await writeCaptainsLog({ title: 'RED ALERT', body: `Triggered at ${new Date().toISOString()}.` });
          res.end(JSON.stringify({ ok: true, alert: lvl }));
        } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    // ============= HOLODECK · /sandbox =============
    // POST { lang: "node"|"bash", code: "...", timeoutMs?: number }
    // Runs in detached subprocess with HARD timeout, no stdin, captured stdout/stderr.
    // SECURITY: scans code via shields first; rejects on threat; blocks dangerous shell ops.
    if (url.pathname === '/sandbox' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { lang, code, timeoutMs } = JSON.parse(body);
          if (!SANDBOX_ALLOWED_LANGS.has(lang)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: `lang must be one of: ${[...SANDBOX_ALLOWED_LANGS].join(', ')}` })); return;
          }
          if (!code || typeof code !== 'string' || code.length > 50_000) {
            res.statusCode = 400; res.end(JSON.stringify({ error: 'code missing or too large (>50KB)' })); return;
          }
          // Shields gate
          const sec = shieldsScan(code);
          if (!sec.safe && (sec.severity === 'high' || sec.severity === 'critical')) {
            state.metrics.alerts++;
            log('err', 'Holodeck', `sandbox REJECTED (shields ${sec.severity}): ${sec.threats.slice(0,2).join('; ')}`);
            res.statusCode = 403;
            res.end(JSON.stringify({ rejected: true, reason: 'shields', severity: sec.severity, threats: sec.threats }));
            return;
          }
          // Block dangerous bash
          if (lang === 'bash' && /\b(rm\s+-rf|mkfs|dd\s+if=|>\s*\/dev\/|curl[^|]*\|\s*sh|wget[^|]*\|\s*sh)/i.test(code)) {
            log('err', 'Holodeck', 'sandbox REJECTED (dangerous shell op)');
            res.statusCode = 403; res.end(JSON.stringify({ rejected: true, reason: 'dangerous-shell' })); return;
          }

          state.modules['MOD-04.Holodeck'].status = 'ONLINE';
          state.metrics.tasks++;
          const t0 = Date.now();

          // ENGINE SELECTION: docker if available (or forced), else subprocess
          const engineParam = url.searchParams.get('engine');
          const wantDocker = engineParam === 'docker' || (engineParam !== 'subprocess' && state.dockerEngine);

          if (wantDocker) {
            try {
              const result = await runInDocker({ lang, code, timeoutMs: timeoutMs ?? SANDBOX_TIMEOUT_MS });
              state.modules['MOD-04.Holodeck'].status = 'STANDBY';
              log(result.verdict === 'PASS' ? 'ok' : 'warn', 'Holodeck',
                  `docker ${lang} ${result.verdict} in ${result.durationMs}ms (exit=${result.exitCode})`);
              res.end(JSON.stringify({ ...result, shields: { severity: sec.severity, score: sec.score } }));
              return;
            } catch (e) {
              if (engineParam === 'docker') {
                res.statusCode = 503;
                res.end(JSON.stringify({ error: `docker unavailable: ${e.message}` })); return;
              }
              log('warn', 'Holodeck', `docker failed (${e.message}) — falling back to subprocess`);
            }
          }

          // SUBPROCESS FALLBACK
          const proc = lang === 'node'
            ? spawn(process.execPath, ['-e', code], { timeout: timeoutMs ?? SANDBOX_TIMEOUT_MS, stdio: ['ignore','pipe','pipe'] })
            : spawn('bash', ['-c', code],            { timeout: timeoutMs ?? SANDBOX_TIMEOUT_MS, stdio: ['ignore','pipe','pipe'] });

          let out = '', err = '';
          proc.stdout.on('data', d => { out += d; if (out.length > 100_000) proc.kill(); });
          proc.stderr.on('data', d => { err += d; if (err.length > 100_000) proc.kill(); });

          proc.on('close', (exitCode, signal) => {
            const dur = Date.now() - t0;
            state.modules['MOD-04.Holodeck'].status = 'STANDBY';
            const verdict = exitCode === 0 ? 'PASS' : 'FAIL';
            log(exitCode === 0 ? 'ok' : 'warn', 'Holodeck', `subprocess ${lang} ${verdict} in ${dur}ms (exit=${exitCode}, sig=${signal||'-'})`);
            res.end(JSON.stringify({
              engine: 'subprocess',
              verdict, lang, exitCode, signal, durationMs: dur,
              stdout: out.slice(0, 20_000),
              stderr: err.slice(0, 20_000),
              shields: { severity: sec.severity, score: sec.score },
            }));
          });
        } catch (e) {
          res.statusCode = 400; res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // ============= MEMORY EXPORT — backup la ruflo agentdb =============
    // GET → returnează state în format compatibil cu Anthropic memory MCP
    // (entities + relations + observations gata de import via mcp__memory__*)
    if (url.pathname === '/memory/export' && req.method === 'GET') {
      const sessionEntity = {
        name: state.sessionId,
        entityType: 'jervis-session',
        observations: [
          `started ${state.startedAt}`,
          `stardate ${state.stardate}`,
          `alert ${state.alert}`,
          `tasks=${state.metrics.tasks} alerts=${state.metrics.alerts} tokens=${state.metrics.tokens}`,
        ],
      };
      const moduleEntities = Object.entries(state.modules).map(([name, m]) => ({
        name, entityType: 'jervis-module',
        observations: [`status=${m.status}`, m.note || ''].filter(Boolean),
      }));
      const agentEntities = state.swarm.agents.map(a => ({
        name: a.id, entityType: 'jervis-agent',
        observations: [`role=${a.role}`, `model=${a.model}`, `assignedTo=${a.mod}`],
      }));
      const recentEvents = state.recentEvents.slice(0, 20).map(e => ({
        name: `event_${e.ts}_${e.mod}`,
        entityType: 'jervis-event',
        observations: [`level=${e.level}`, `mod=${e.mod}`, `msg=${e.msg}`],
      }));
      const relations = [
        ...moduleEntities.map(m => ({ from: state.sessionId, to: m.name, relationType: 'has-module' })),
        ...agentEntities .map(a => ({ from: state.sessionId, to: a.name, relationType: 'has-agent'  })),
        ...recentEvents  .map(e => ({ from: state.sessionId, to: e.name, relationType: 'observed'   })),
      ];
      res.end(JSON.stringify({
        format: 'anthropic-memory-mcp-v1',
        entities: [sessionEntity, ...moduleEntities, ...agentEntities, ...recentEvents],
        relations,
        hint: 'feed to mcp__memory__create_entities + mcp__memory__create_relations',
      }, null, 2));
      return;
    }

    // ============= WHATSAPP INTENT — last verdicts =============
    if (url.pathname === '/wa/intents' && req.method === 'GET') {
      res.end(JSON.stringify({ intents: state.waIntents || [], count: (state.waIntents || []).length }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({
      error: 'not found',
      endpoints: [
        '/status', '/memory/export', '/wa/intents',
        'POST /scan', 'POST /scan-deep', 'POST /log', 'POST /alert',
        'GET|POST /handoff', 'POST /sandbox?engine=docker|subprocess',
      ],
    }));
  });

  server.listen(PORT, () => {
    log('mod', 'WarpCore', `HTTP status server :${PORT}`);
  });
}

// ============= BOOT SEQUENCE =============
async function boot() {
  console.log(`\n${COLORS.orange}╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║          JERVIS v2 · BRIDGE COMMAND DECK ONLINE           ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  log('mod', 'WarpCore', `session ${SESSION_ID}`);
  log('mod', 'WarpCore', `stardate ${state.stardate}`);
  log('mod', 'WarpCore', `node ${process.version} on ${os.platform()} ${os.arch()}`);

  // 1. State dirs
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR,   { recursive: true });
  log('ok', 'WarpCore', `state dir ready: ${STATE_DIR}`);

  // 2. Vault check
  if (!fss.existsSync(VAULT_ROOT)) {
    log('err', 'Database', `vault NOT FOUND: ${VAULT_ROOT}`);
    log('err', 'Database', 'Captain\'s Log writes will be skipped');
    state.modules['MOD-07.Database'].status = 'DEGRADED';
  } else {
    log('ok', 'Database', `vault accessible: ${VAULT_ROOT}`);
  }

  // 3. Swarm config (real call would be: ruflo.swarm_init)
  log('mod', 'WarpCore', `swarm config: topology=mesh max=${state.swarm.maxAgents}`);
  AGENTS.forEach(a => log('ok', 'WarpCore', `agent registered: ${a.id} (${a.model}) → ${a.mod}`));

  // 4. Shields online — backed by jervis-aidefence (17 injection + 11 PII patterns + entropy)
  log('mod', 'Shields', 'aidefence module loaded (17 injection + 11 PII + entropy detection)');

  // 5. Docker engine probe (Holodeck)
  state.dockerEngine = await dockerAvailable();
  if (state.dockerEngine) {
    state.modules['MOD-04.Holodeck'].note = 'Docker available — VM-grade isolation';
    log('mod', 'Holodeck', 'docker engine detected — sandbox will use containers');
  } else {
    state.modules['MOD-04.Holodeck'].note = 'subprocess only (start Docker for VM isolation)';
    log('warn', 'Holodeck', 'docker NOT available — subprocess fallback only');
  }

  // 6. Sensors
  startSensors();

  // 7. WhatsApp intent loop (opt-in via ANTHROPIC_API_KEY)
  state.waIntents = [];
  startIntentLoop({
    onLog:    (lvl, mod, msg) => log(lvl, mod, msg),
    onAlert:  async (entry) => { state.metrics.alerts++; await writeCaptainsLog(entry); },
    onHandoff: async (payload) => {
      state.waIntents.unshift(payload);
      state.waIntents = state.waIntents.slice(0, 50);
      await writeHandoff(payload);
    },
  });

  // 8. HTTP server
  startHttpServer();

  // 9. Persist state
  await persistState();
  setInterval(persistState, 30_000);

  // 10. Captain's Log — session start
  const file = await writeCaptainsLog({
    title: `Session Start · ${SESSION_ID}`,
    body: `**Stardate:** ${state.stardate}\n**Alert:** ${state.alert}\n**Agents:** ${AGENTS.map(a => `\`${a.id}\``).join(', ')}\n**Status endpoint:** http://localhost:${PORT}/status\n\nAll systems nominal. Awaiting orders.`,
  });
  if (file) log('ok', 'Database', `captain's log written → ${path.basename(file)}`);

  console.log(`\n${COLORS.cyan}► Status:    ${COLORS.reset}http://localhost:${PORT}/status`);
  console.log(`${COLORS.cyan}► Scan:      ${COLORS.reset}POST http://localhost:${PORT}/scan       (body = text)`);
  console.log(`${COLORS.cyan}► Scan-deep: ${COLORS.reset}POST http://localhost:${PORT}/scan-deep  (body = {input, verdict})`);
  console.log(`${COLORS.cyan}► Log:       ${COLORS.reset}POST http://localhost:${PORT}/log        (body = {title, content})`);
  console.log(`${COLORS.cyan}► Handoff:   ${COLORS.reset}GET|POST http://localhost:${PORT}/handoff`);
  console.log(`${COLORS.cyan}► Alert:     ${COLORS.reset}POST http://localhost:${PORT}/alert      (body = {level: GREEN|YELLOW|RED})`);
  console.log(`${COLORS.cyan}► Sandbox:   ${COLORS.reset}POST http://localhost:${PORT}/sandbox    (?engine=docker|subprocess, lang: node|bash|py for docker)`);
  console.log(`${COLORS.cyan}► Memory:    ${COLORS.reset}GET  http://localhost:${PORT}/memory/export  (entities + relations for memory MCP)`);
  console.log(`${COLORS.cyan}► WA Intent: ${COLORS.reset}GET  http://localhost:${PORT}/wa/intents     (last 50 verdicts)`);
  console.log(`${COLORS.dim}\n  (Ctrl+C to shut down)${COLORS.reset}\n`);
}

// ============= GRACEFUL SHUTDOWN =============
async function shutdown(sig) {
  console.log(`\n${COLORS.yellow}── ${sig} received — saving state & writing log...${COLORS.reset}`);
  state.alert = 'OFFLINE';
  await persistState();
  await writeCaptainsLog({
    title: `Session End · ${SESSION_ID}`,
    body: `**Stopped at:** ${new Date().toISOString()}\n**Alerts triggered:** ${state.metrics.alerts}\n**Tasks executed:** ${state.metrics.tasks}\n\nBridge offline.`,
  });
  log('mod', 'WarpCore', 'shutdown complete');
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

boot().catch(err => {
  console.error(`${COLORS.red}BOOT FAILED:${COLORS.reset}`, err);
  process.exit(1);
});
