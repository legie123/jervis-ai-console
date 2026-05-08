import { test } from "node:test";
import assert from "node:assert/strict";
import { createBootPoller, fetchFsmFromBoots } from "../apps/web/src/components/boot-poller.js";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test("fetchFsmFromBoots reports all503 metadata when every boot is 503", async () => {
  const originalFetch = global.fetch;
  const originalBoots = globalThis.__JARVIS_BOOT_FSM_URLS__;

  globalThis.__JARVIS_BOOT_FSM_URLS__ = [
    { url: "http://127.0.0.1:7777/fsm", port: 7777, label: "Boot A" },
    { url: "http://127.0.0.1:7778/fsm", port: 7778, label: "Boot B" }
  ];
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });

  try {
    const result = await fetchFsmFromBoots(50);
    assert.equal(result.offline, true);
    assert.equal(result.all503, true);
    assert.ok(Array.isArray(result.failures));
    assert.equal(result.statusCodes.every((status) => status === 503), true);
  } finally {
    global.fetch = originalFetch;
    if (originalBoots === undefined) delete globalThis.__JARVIS_BOOT_FSM_URLS__;
    else globalThis.__JARVIS_BOOT_FSM_URLS__ = originalBoots;
  }
});

test("createBootPoller opens breaker after repeated 503 and supports manual retry", async () => {
  let calls = 0;
  const ticks = [];

  const poller = createBootPoller({
    baseMs: 1,
    breakerThreshold: 2,
    breakerCooldownMs: 1000,
    fetchFsm: async () => {
      calls += 1;
      if (calls <= 2) return { ok: false, offline: true, all503: true };
      return { ok: true, offline: false, state: "STANDBY", label: "Codex", port: 7777 };
    },
    onTick: (result) => ticks.push(result)
  });

  try {
    poller.start();
    await sleep(12);

    assert.ok(ticks.some((result) => result.breakerOpened));
    assert.equal(calls, 2);

    poller.retryNow();
    await sleep(12);

    assert.ok(ticks.some((result) => result.state === "STANDBY"));
  } finally {
    poller.stop();
  }
});
