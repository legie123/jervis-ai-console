import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveApiUrl } from "../apps/web/src/services/api-base.js";

test("resolveApiUrl leaves path unchanged when no Vite origin (node / default)", () => {
  assert.equal(resolveApiUrl("/api/health"), "/api/health");
  assert.equal(resolveApiUrl("/api/missions/stream"), "/api/missions/stream");
});
