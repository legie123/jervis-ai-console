/**
 * JERVIS · WHATSAPP INTENT EXTRACTOR
 * Polls bridge :8787/messages?since=<ts> for new messages,
 * sends each through Claude Haiku for intent extraction,
 * routes verdict to handoff + Captain's Log.
 *
 * Requires:  ANTHROPIC_API_KEY env var
 * Optional:  JERVIS_WA_BRIDGE (default http://localhost:8787)
 *            JERVIS_INTENT_MODEL (default claude-haiku-4-5-20251001)
 *
 * Output per message → { intent, urgency, action, summary, sender, raw }
 *   intent  : "query" | "command" | "social" | "alert" | "noise"
 *   urgency : "low" | "medium" | "high"
 *   action  : suggested next step ("none" if noise)
 */

import { scan as aidefenceScan } from './jervis-aidefence.mjs';
import { routeAction }            from './jervis-action-router.mjs';

const API_KEY    = process.env.ANTHROPIC_API_KEY;
const MODEL      = process.env.JERVIS_INTENT_MODEL || 'claude-haiku-4-5-20251001';
const WA_BRIDGE  = process.env.JERVIS_WA_BRIDGE    || 'http://localhost:8787';
const POLL_MS    = Number(process.env.JERVIS_INTENT_POLL_MS || 30_000);

const SYSTEM_PROMPT = `Ești un router de intenție pentru asistentul JERVIS.
Pentru fiecare mesaj WhatsApp primit, returnează STRICT un JSON valid cu:
{"intent": "query|command|social|alert|noise",
 "urgency": "low|medium|high",
 "action": "1 propoziție concretă de next step sau 'none'",
 "summary": "1 propoziție în română"}
Fără text înainte sau după JSON. Fără markdown.`;

let lastSinceTs = Date.now() - 5 * 60_000; // start: 5 min ago

async function fetchNewMessages() {
  try {
    const r = await fetch(`${WA_BRIDGE}/messages?since=${lastSinceTs}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return [];
    const j = await r.json();
    const list = Array.isArray(j) ? j : (j.messages || []);
    if (list.length) lastSinceTs = Date.now();
    return list;
  } catch { return []; }
}

async function callHaiku(text) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':       'application/json',
      'x-api-key':           API_KEY,
      'anthropic-version':  '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text().then(t => t.slice(0,200))}`);
  const j = await r.json();
  const content = j.content?.[0]?.text || '';
  try { return JSON.parse(content.trim()); }
  catch { return { intent: 'noise', urgency: 'low', action: 'none', summary: content.slice(0,120), parseError: true }; }
}

export async function processOne(msg, { onLog, onAlert }) {
  const text   = msg.text   || msg.body || msg.message || '';
  const sender = msg.from   || msg.sender || 'unknown';
  if (!text.trim()) return null;

  // shields gate first
  const sec = aidefenceScan(text);
  if (!sec.safe && sec.severity === 'critical') {
    onLog?.('err', 'WAIntent', `critical input from ${sender} blocked by shields`);
    return { intent: 'alert', urgency: 'high', action: 'shields blocked', sender, blocked: true };
  }

  let verdict;
  try { verdict = await callHaiku(text); }
  catch (e) {
    onLog?.('warn', 'WAIntent', `Haiku call failed: ${e.message}`);
    return null;
  }

  verdict.sender = sender;
  verdict.raw    = text.slice(0, 200);

  const lvl = verdict.urgency === 'high' ? 'err' : verdict.urgency === 'medium' ? 'warn' : 'ok';
  onLog?.(lvl, 'WAIntent', `${verdict.intent}/${verdict.urgency} from ${sender}: ${verdict.summary}`);

  if (verdict.urgency === 'high' || verdict.intent === 'alert') {
    onAlert?.({
      title: `WA · ${verdict.intent.toUpperCase()} · ${sender}`,
      body: `**Urgency:** ${verdict.urgency}\n**Action:** ${verdict.action}\n**Summary:** ${verdict.summary}\n**Raw:** \`${verdict.raw}\``,
    });
  }
  return verdict;
}

export function startIntentLoop({ onLog, onAlert, onHandoff }) {
  if (!API_KEY) {
    onLog?.('warn', 'WAIntent', 'ANTHROPIC_API_KEY missing — intent extraction disabled');
    return { stop: () => {} };
  }
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    const msgs = await fetchNewMessages();
    for (const m of msgs) {
      const v = await processOne(m, { onLog, onAlert });
      if (v) onHandoff?.({ source: 'whatsapp-intent', verdict: v, ts: Date.now() });
    }
  };
  const id = setInterval(tick, POLL_MS);
  tick(); // first run immediately
  onLog?.('mod', 'WAIntent', `loop started (poll ${POLL_MS/1000}s, model ${MODEL})`);
  return { stop: () => { stopped = true; clearInterval(id); } };
}
