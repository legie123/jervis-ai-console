import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeShieldsForDisplay } from "../apps/web/src/components/shields-strip.js";

test("summarizeShieldsForDisplay unknown without security", () => {
  const out = summarizeShieldsForDisplay({ ok: true, status: "REAL" });
  assert.equal(out.state, "unknown");
  assert.equal(out.chips.length, 0);
});

test("summarizeShieldsForDisplay builds chips from health.security", () => {
  const out = summarizeShieldsForDisplay({
    security: {
      pathGuard: {
        policy: {
          readAllow: ["a", "b"],
          writeAllow: ["x"],
          writeDeny: ["y", "z"]
        }
      },
      emergency: { active: false },
      tokens: { pending: 2 }
    }
  });
  assert.equal(out.state, "ok");
  assert.equal(out.emergencyActive, false);
  assert.equal(out.chips.length, 4);
  assert.ok(out.chips.some((c) => c.label.includes("2 read zones")));
  assert.ok(out.chips.some((c) => c.label.includes("1 write zones")));
  assert.ok(out.chips.some((c) => c.label.includes("2 pending")));
});

test("summarizeShieldsForDisplay flags emergency", () => {
  const out = summarizeShieldsForDisplay({
    security: {
      pathGuard: { policy: { readAllow: [], writeAllow: [], writeDeny: [] } },
      emergency: { active: true },
      tokens: { pending: 0 }
    }
  });
  assert.equal(out.emergencyActive, true);
  assert.ok(out.chips.find((c) => c.key === "emergency").label.includes("active"));
});
