import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfirmationTokenService } from "../apps/operator/src/security/confirmation-tokens.js";

test("confirmation tokens are scoped and single-use", () => {
  let nowMs = 1_000_000;
  const service = new ConfirmationTokenService({
    now: () => nowMs
  });

  const issued = service.issue({ scope: "whatsapp.send", targetId: "draft_1", ttlMs: 30_000 });
  assert.ok(issued.token.startsWith("ctk_"));

  const ok = service.verifyAndConsume({
    token: issued.token,
    scope: "whatsapp.send",
    targetId: "draft_1"
  });
  assert.equal(ok.ok, true);

  const reused = service.verifyAndConsume({
    token: issued.token,
    scope: "whatsapp.send",
    targetId: "draft_1"
  });
  assert.equal(reused.ok, false);
  assert.equal(reused.reason, "invalid_token");
});

test("confirmation tokens enforce scope and ttl", () => {
  let nowMs = 2_000_000;
  const service = new ConfirmationTokenService({
    now: () => nowMs
  });

  const issued = service.issue({ scope: "obsidian.sync", ttlMs: 5000 });
  const wrongScope = service.verifyAndConsume({
    token: issued.token,
    scope: "whatsapp.send"
  });
  assert.equal(wrongScope.ok, false);
  assert.equal(wrongScope.reason, "scope_mismatch");

  nowMs += 6000;
  const expired = service.verifyAndConsume({
    token: issued.token,
    scope: "obsidian.sync"
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.reason, "token_expired");
});
