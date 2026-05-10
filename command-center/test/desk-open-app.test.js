import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalizeDeskOpenApp } from "../apps/web/src/services/desk-open-app.js";

test("canonicalizeDeskOpenApp maps common aliases case-insensitive", () => {
  assert.equal(canonicalizeDeskOpenApp("safari"), "Safari");
  assert.equal(canonicalizeDeskOpenApp("Cursor"), "Cursor");
  assert.equal(canonicalizeDeskOpenApp("terminal"), "Terminal");
  assert.equal(canonicalizeDeskOpenApp("code"), "Visual Studio Code");
});

test("canonicalizeDeskOpenApp preserves bespoke multi-word names", () => {
  assert.match(canonicalizeDeskOpenApp("Activity Monitor"), /Activity Monitor/);
});
