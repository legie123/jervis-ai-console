import crypto from "node:crypto";

const DEFAULT_SCOPE = "generic";

function clampTtl(value, { minMs, maxMs, fallbackMs }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.min(Math.max(Math.round(parsed), minMs), maxMs);
}

function cleanScope(rawScope) {
  const scope = String(rawScope || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "");
  return scope || DEFAULT_SCOPE;
}

export class ConfirmationTokenService {
  constructor({
    now = () => Date.now(),
    randomBytes = crypto.randomBytes,
    defaultTtlMs = Number(process.env.JARVIS_CONFIRM_TOKEN_TTL_MS || 120000),
    minTtlMs = 5000,
    maxTtlMs = Number(process.env.JARVIS_CONFIRM_TOKEN_MAX_TTL_MS || 900000)
  } = {}) {
    this.now = now;
    this.randomBytes = randomBytes;
    this.defaultTtlMs = defaultTtlMs;
    this.minTtlMs = minTtlMs;
    this.maxTtlMs = maxTtlMs;
    this.tokens = new Map();
  }

  issue({ scope, targetId = "", ttlMs } = {}) {
    this.cleanup();
    const scoped = cleanScope(scope);
    const ttl = clampTtl(ttlMs, {
      minMs: this.minTtlMs,
      maxMs: this.maxTtlMs,
      fallbackMs: this.defaultTtlMs
    });

    const issuedAtMs = this.now();
    const expiresAtMs = issuedAtMs + ttl;
    const token = `ctk_${this.randomBytes(16).toString("hex")}`;

    const record = {
      token,
      scope: scoped,
      targetId: String(targetId || ""),
      issuedAtMs,
      expiresAtMs
    };
    this.tokens.set(token, record);

    return {
      token,
      scope: scoped,
      targetId: record.targetId,
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      ttlMs: ttl
    };
  }

  verifyAndConsume({ token, scope, targetId = "" } = {}) {
    if (!token || typeof token !== "string") {
      return { ok: false, reason: "missing_token" };
    }

    const scoped = cleanScope(scope);
    const record = this.tokens.get(token);
    if (!record) {
      return { ok: false, reason: "invalid_token" };
    }

    if (record.expiresAtMs <= this.now()) {
      this.tokens.delete(token);
      return { ok: false, reason: "token_expired" };
    }

    if (record.scope !== scoped) {
      return { ok: false, reason: "scope_mismatch" };
    }

    const expectedTarget = String(record.targetId || "");
    const requestedTarget = String(targetId || "");
    if (expectedTarget && expectedTarget !== requestedTarget) {
      return { ok: false, reason: "target_mismatch" };
    }

    this.tokens.delete(token);
    return {
      ok: true,
      scope: record.scope,
      targetId: record.targetId,
      expiresAt: new Date(record.expiresAtMs).toISOString()
    };
  }

  cleanup() {
    const nowMs = this.now();
    for (const [token, record] of this.tokens.entries()) {
      if (record.expiresAtMs <= nowMs) this.tokens.delete(token);
    }
  }

  status() {
    this.cleanup();
    return {
      pending: this.tokens.size,
      defaultTtlMs: this.defaultTtlMs,
      minTtlMs: this.minTtlMs,
      maxTtlMs: this.maxTtlMs
    };
  }
}

export function createConfirmationTokenService(options = {}) {
  return new ConfirmationTokenService(options);
}
