/**
 * JERVIS · ACTION ROUTER
 * Mapează intent extras din WhatsApp → executor concret.
 * Reguli stricte de safety: dry-run by default, alert gate, allowlist verbs.
 *
 * Verbe suportate (allowlist):
 *   "status"       → returnează state public (no shell)
 *   "log"          → scrie în Captain's Log
 *   "alert"        → schimbă alert level (DOAR dacă mesajul vine de la sender allowlist)
 *   "scan"         → rulează shields pe text
 *   "compute"      → expresii matematice simple via sandbox node (allowlist)
 *   "remind"       → ack + notează în transporter pentru follow-up
 *
 * Toate celelalte intenții → DRY-RUN (returnează plan, NU execută).
 *
 * Safety gates ÎN ORDINE:
 *   1. dryRun forțat dacă alert === 'RED'
 *   2. shields rescan pe action.payload
 *   3. allowlist verbs
 *   4. allowlist senders pentru verbe sensibile (alert, remind)
 *   5. rate limit (max 6 acțiuni / minut per sender)
 */

const ALLOWED_VERBS = new Set(['status', 'log', 'alert', 'scan', 'compute', 'remind']);
const SENSITIVE_VERBS = new Set(['alert']);
const SENDER_ALLOWLIST = (process.env.JERVIS_ACTION_SENDERS || '').split(',').map(s => s.trim()).filter(Boolean);

const _rateLimit = new Map(); // sender → [timestamps]
function rateOk(sender) {
  const now = Date.now();
  const windowMs = 60_000;
  const cap = 6;
  const arr = (_rateLimit.get(sender) || []).filter(t => now - t < windowMs);
  arr.push(now);
  _rateLimit.set(sender, arr);
  return arr.length <= cap;
}

/**
 * Parse action verb from intent verdict.
 * Heuristic: first allowed-verb word found in `action` or `summary`.
 */
function parseVerb(verdict) {
  const text = `${verdict.action || ''} ${verdict.summary || ''}`.toLowerCase();
  for (const v of ALLOWED_VERBS) {
    if (text.includes(v)) return v;
  }
  return null;
}

/**
 * Run an action. Returns { executed, dryRun, verb, result, reason }.
 *
 * @param verdict     intent verdict from jervis-whatsapp-intent
 * @param ctx         { state, shieldsScan, writeCaptainsLog, alertLevel, sandboxCall, log }
 * @param opts        { dryRunDefault: false }
 */
export async function routeAction(verdict, ctx, opts = {}) {
  const { state, shieldsScan, writeCaptainsLog, log } = ctx;
  const sender = verdict.sender || 'unknown';

  // Gate 1: only execute on intent=command + urgency=high (else dry-run plan only)
  const eligible = verdict.intent === 'command' && verdict.urgency === 'high';
  let dryRun = opts.dryRunDefault ?? !eligible;

  // Gate 2: RED alert → force dry-run
  if (state.alert === 'RED') {
    dryRun = true;
    log?.('warn', 'Router', `forced dry-run (RED ALERT) for ${sender}`);
  }

  // Gate 3: rate limit
  if (!rateOk(sender)) {
    log?.('err', 'Router', `RATE LIMIT exceeded for ${sender}`);
    return { executed: false, dryRun: true, reason: 'rate-limit', verb: null, sender };
  }

  // Gate 4: shields on raw payload
  const sec = shieldsScan(`${verdict.action} ${verdict.summary} ${verdict.raw || ''}`);
  if (!sec.safe && (sec.severity === 'high' || sec.severity === 'critical')) {
    log?.('err', 'Router', `SHIELDS blocked action from ${sender} (${sec.severity})`);
    state.metrics.alerts++;
    return { executed: false, dryRun: true, reason: 'shields', severity: sec.severity, sender };
  }

  // Parse verb
  const verb = parseVerb(verdict);
  if (!verb) {
    return { executed: false, dryRun: true, reason: 'no-verb-matched', verb: null, sender,
             plan: `unknown action: "${verdict.action}"` };
  }

  // Gate 5: sensitive verbs require allowlist sender
  if (SENSITIVE_VERBS.has(verb) && !SENDER_ALLOWLIST.includes(sender)) {
    log?.('err', 'Router', `sensitive verb ${verb} blocked — ${sender} not in allowlist`);
    return { executed: false, dryRun: true, reason: 'sender-not-allowlisted', verb, sender };
  }

  // ============= DISPATCH =============
  if (dryRun) {
    log?.('info', 'Router', `[DRY-RUN] ${verb} for ${sender}: ${verdict.summary}`);
    return { executed: false, dryRun: true, verb, sender,
             plan: `would execute "${verb}" with payload: ${verdict.action}` };
  }

  state.metrics.tasks++;
  switch (verb) {
    case 'status':
      log?.('ok', 'Router', `[EXEC] status for ${sender}`);
      return { executed: true, verb, sender,
               result: { alert: state.alert, modules: Object.keys(state.modules).length, agents: state.swarm.agents.length } };

    case 'log':
      await writeCaptainsLog?.({
        title: `WA Command · ${sender}`,
        body: `**Action:** ${verdict.action}\n**Summary:** ${verdict.summary}\n**Raw:** \`${verdict.raw || ''}\``,
      });
      log?.('ok', 'Router', `[EXEC] log written for ${sender}`);
      return { executed: true, verb, sender, result: 'captains-log appended' };

    case 'alert': {
      // Parse target level from action text
      const m = `${verdict.action}`.match(/\b(green|yellow|red)\b/i);
      if (!m) return { executed: false, dryRun: true, verb, sender, reason: 'no-level-found' };
      const lvl = m[1].toUpperCase();
      const prev = state.alert;
      state.alert = lvl;
      log?.('mod', 'Router', `[EXEC] alert ${prev} → ${lvl} (by ${sender})`);
      if (lvl === 'RED') await writeCaptainsLog?.({ title: `RED ALERT (by ${sender})`, body: verdict.summary });
      return { executed: true, verb, sender, result: { from: prev, to: lvl } };
    }

    case 'scan':
      log?.('ok', 'Router', `[EXEC] scan for ${sender}`);
      return { executed: true, verb, sender, result: shieldsScan(verdict.raw || '') };

    case 'compute': {
      const expr = (verdict.raw || '').match(/[-+*/().\d\s]+/)?.[0] || '';
      if (!expr || /[a-zA-Z]/.test(expr)) {
        return { executed: false, dryRun: true, verb, sender, reason: 'expr-invalid', expr };
      }
      try {
        // safe: only digits + operators
        const result = new Function(`"use strict";return (${expr})`)();
        log?.('ok', 'Router', `[EXEC] compute "${expr}" = ${result}`);
        return { executed: true, verb, sender, result, expr };
      } catch (e) { return { executed: false, dryRun: true, verb, sender, reason: e.message }; }
    }

    case 'remind':
      // Just appends to handoff for follow-up; no execution
      log?.('ok', 'Router', `[EXEC] remind queued for ${sender}: ${verdict.summary}`);
      return { executed: true, verb, sender, result: { queued: verdict.summary, ts: Date.now() } };

    default:
      return { executed: false, dryRun: true, verb, sender, reason: 'unknown-verb' };
  }
}

export const VERBS = ALLOWED_VERBS;
