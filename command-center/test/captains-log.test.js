import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isoDateString,
  loadCaptainsLogForDate,
  shiftIsoDate
} from "../apps/web/src/components/captains-log.js";

test("isoDateString formats local date as YYYY-MM-DD", () => {
  const fixed = new Date(2026, 4, 7, 13, 30, 0); // local
  const iso = isoDateString(fixed);
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(iso, "2026-05-07");
});

test("shiftIsoDate moves forward and backward", () => {
  assert.equal(shiftIsoDate("2026-05-07", -1), "2026-05-06");
  assert.equal(shiftIsoDate("2026-05-07", 1), "2026-05-08");
  assert.equal(shiftIsoDate("2026-05-31", 1), "2026-06-01");
  assert.equal(shiftIsoDate("2026-03-01", -1), "2026-02-28");
});

test("shiftIsoDate handles malformed input by falling back to today", () => {
  const out = shiftIsoDate("not-a-date", 0);
  assert.match(out, /^\d{4}-\d{2}-\d{2}$/);
});

test("loadCaptainsLogForDate returns ok+text on 200", async () => {
  const fakeFetch = async () => ({
    ok: true,
    text: async () => "captain log body"
  });
  const result = await loadCaptainsLogForDate("2026-05-07", fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.text, "captain log body");
});

test("loadCaptainsLogForDate returns empty on 404", async () => {
  const fakeFetch = async () => ({ ok: false, text: async () => "" });
  const result = await loadCaptainsLogForDate("2999-01-01", fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.text, "");
});

test("loadCaptainsLogForDate swallows network errors", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const result = await loadCaptainsLogForDate("2026-05-07", fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.text, "");
});
