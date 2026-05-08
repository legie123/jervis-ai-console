import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAuditExportBlob } from "../apps/web/src/components/audit-feed.js";

test("buildAuditExportBlob serializes entries with metadata", () => {
  const entries = [
    { ts: "2026-05-07T10:00:00Z", action: "draft.create", risk: "LOW" },
    { ts: "2026-05-07T10:01:00Z", action: "send.gate", risk: "HIGH" }
  ];
  const json = buildAuditExportBlob(entries, "2026-05-07T12:00:00Z");
  const parsed = JSON.parse(json);
  assert.equal(parsed.exportedAt, "2026-05-07T12:00:00Z");
  assert.equal(parsed.count, 2);
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.entries[1].action, "send.gate");
});

test("buildAuditExportBlob handles non-array gracefully", () => {
  const json = buildAuditExportBlob(null, "2026-05-07T12:00:00Z");
  const parsed = JSON.parse(json);
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.entries, []);
});
