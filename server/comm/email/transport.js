/**
 * server/comm/email/transport.js — pluggable transport
 * Author: claude-coder
 *
 * Three transport options:
 *   - dry-run (default, just logs + returns mock id)
 *   - smtp (lazy nodemailer, requires npm i nodemailer + SMTP env)
 *   - http (generic JSON POST to a configured endpoint, e.g. Resend/SendGrid/Mailgun)
 *
 * Each transport has shape: { name, send({from, to, subject, body, dryRun}) -> {id} }
 */

export function createDryRunTransport() {
  return {
    name: "dry-run",
    async send({ from, to, subject, body, dryRun = true }) {
      // never actually sends
      const id = `drymsg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      return { id, accepted: true, dryRun: true, from, to, subject, bodyLength: String(body).length };
    }
  };
}

/**
 * SMTP transport. Requires nodemailer (lazy import). Returns null transport if missing.
 */
export async function createSmtpTransport({ host, port = 587, user, pass, secure = false } = {}) {
  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch {
    return null;
  }
  const tr = nodemailer.createTransport({
    host, port, secure,
    auth: user && pass ? { user, pass } : undefined
  });
  return {
    name: "smtp",
    async send({ from, to, subject, body, dryRun = false }) {
      if (dryRun) return { id: `dry_smtp_${Date.now()}`, dryRun: true };
      const info = await tr.sendMail({ from, to, subject, text: body });
      return { id: info.messageId, accepted: info.accepted };
    }
  };
}

/**
 * HTTP transport — POST JSON to an endpoint.
 * Useful for Resend/SendGrid/Mailgun/local Express bridges.
 */
export function createHttpTransport({ url, headers = {}, mapBody } = {}) {
  if (!url) throw new Error("createHttpTransport: url required");

  const _mapBody = mapBody || (({ from, to, subject, body }) => ({
    from, to, subject, text: body
  }));

  return {
    name: "http",
    url,
    async send({ from, to, subject, body, dryRun = false }) {
      if (dryRun) return { id: `dry_http_${Date.now()}`, dryRun: true };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(_mapBody({ from, to, subject, body }))
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`http transport ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = await res.json().catch(() => ({}));
      return { id: json.id || json.messageId || `http_${Date.now()}`, accepted: true, raw: json };
    }
  };
}

export default { createDryRunTransport, createSmtpTransport, createHttpTransport };
