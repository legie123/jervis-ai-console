import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Scheduler } from "../packages/scheduler/src/index.js";
import { WhatsAppDraftStore } from "../packages/whatsapp/src/index.js";

test("scheduler persists jobs and returns due jobs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-scheduler-"));
  const scheduler = new Scheduler({ filePath: path.join(dir, "jobs.json") });

  const job = await scheduler.scheduleDraft({
    targetId: "draft_1",
    runAt: "2026-05-03T00:00:00.000Z",
    action: "whatsapp.ready_for_confirmation"
  });

  assert.equal(job.status, "scheduled");
  assert.equal((await scheduler.list()).length, 1);
  assert.equal((await scheduler.due(new Date("2026-05-03T00:00:01.000Z"))).length, 1);
  assert.equal((await scheduler.due(new Date("2026-05-02T23:59:59.000Z"))).length, 0);
});

test("draft store can activate scheduled draft for confirmation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-drafts-"));
  const store = new WhatsAppDraftStore(path.join(dir, "drafts.json"));

  const draft = await store.create({
    to: "40700000000",
    body: "Salut",
    scheduledFor: "2026-05-03T00:00:00.000Z"
  });

  assert.equal(draft.status, "scheduled_draft");

  const ready = await store.markReadyForConfirmation(draft.id);
  assert.equal(ready.status, "pending_confirmation");
  assert.ok(ready.readyForConfirmationAt);
});
