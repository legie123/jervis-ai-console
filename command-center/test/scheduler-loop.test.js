import { test } from "node:test";
import assert from "node:assert/strict";
import { SchedulerLoop } from "../apps/operator/src/scheduler-loop.js";

test("scheduler loop is disabled by default and never auto-sends", () => {
  const loop = new SchedulerLoop({ enabled: false });
  const status = loop.start();

  assert.equal(status.enabled, false);
  assert.equal(status.running, false);
  assert.equal(status.autoSend, false);
});

test("scheduler loop tick skips concurrent execution", async () => {
  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const loop = new SchedulerLoop({
    enabled: true,
    runDue: async () => {
      await blocker;
      return { processed: 0, results: [] };
    },
    logger: { log() {}, error() {} }
  });

  const first = loop.tick();
  const second = await loop.tick();
  release();
  await first;

  assert.equal(second.skipped, true);
  assert.equal(second.reason, "previous_tick_running");
});
