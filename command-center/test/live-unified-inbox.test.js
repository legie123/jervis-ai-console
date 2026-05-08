import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PREMIUM_CHANNEL_FEEDS,
  aggregateUnifiedInboxModel
} from "../apps/web/src/components/live-unified-inbox.js";

test("aggregateUnifiedInboxModel merges core sources and counts badges", () => {
  const model = aggregateUnifiedInboxModel({
    now: "2026-05-08T10:00:00Z",
    whatsappMessages: [{ id: "m1", from: "40710000000", body: "Salut", ts: "2026-05-08T09:59:00Z" }],
    approvalItems: [
      {
        id: "a1",
        title: "Approve outbound summary",
        details: "Needs operator confirmation",
        risk: "HIGH",
        ts: "2026-05-08T09:59:30Z"
      }
    ],
    auditEntries: [{ id: "au1", action: "draft_created", status: "ok", risk: "LOW", ts: "2026-05-08T09:58:00Z" }],
    reminderJobs: [{ id: "j1", action: "follow_up", status: "pending", runAt: "2026-05-08T10:05:00Z" }],
    channelFeeds: {
      obsidian: [{ id: "o1", title: "Vault note updated", details: "Daily sync", ts: "2026-05-08T09:57:00Z" }]
    }
  });

  assert.equal(model.counts.whatsapp, 1);
  assert.equal(model.counts.approvals, 1);
  assert.equal(model.counts.audit, 1);
  assert.equal(model.counts.reminders, 1);
  assert.equal(model.counts.obsidian, 1);
  assert.equal(model.items[0].source, "reminders");
  assert.equal(model.counts.alerts >= 1, true);
});

test("aggregateUnifiedInboxModel injects fallback collaboration channels", () => {
  const model = aggregateUnifiedInboxModel({ now: "2026-05-08T10:00:00Z" });
  const fallbackKeys = model.items
    .filter((item) => item.meta?.isFallbackChannel)
    .map((item) => item.channelKey)
    .sort();

  assert.deepEqual(
    fallbackKeys,
    PREMIUM_CHANNEL_FEEDS.map((channel) => channel.key).sort()
  );
});
