import { test } from "node:test";
import assert from "node:assert/strict";
import { EmergencyStopState } from "../apps/operator/src/security/emergency-stop.js";

test("emergency stop toggles active state and blocks execution", () => {
  const stop = new EmergencyStopState();
  assert.equal(stop.status().active, false);

  const triggered = stop.trigger({ reason: "panic", source: "test" });
  assert.equal(triggered.active, true);
  assert.equal(triggered.reason, "panic");

  assert.throws(() => stop.assertRunnable("send_message"), /Emergency stop active/);

  const cleared = stop.clear({ reason: "resume", source: "test" });
  assert.equal(cleared.active, false);
  assert.equal(stop.status().active, false);
});
