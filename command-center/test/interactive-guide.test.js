import test from "node:test";
import assert from "node:assert/strict";
import { getInteractiveGuideStepCount } from "../apps/web/src/components/interactive-guide.js";

test("interactive guide exposes stable step count", () => {
  assert.ok(getInteractiveGuideStepCount() >= 5);
});
