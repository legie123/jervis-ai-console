import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterCaptainsLogBody,
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

test("filterCaptainsLogBody returns full text when query empty", () => {
  const raw = "Alpha\nBeta\nGamma";
  const out = filterCaptainsLogBody(raw, "  ");
  assert.equal(out.queryActive, false);
  assert.equal(out.body, raw);
  assert.equal(out.shownLines, 3);
});

test("filterCaptainsLogBody filters lines case-insensitively", () => {
  const out = filterCaptainsLogBody("One\nTWO\nthree", "two");
  assert.equal(out.queryActive, true);
  assert.equal(out.shownLines, 1);
  assert.equal(out.body, "TWO");
});

test("filterCaptainsLogBody shows hint when no matches", () => {
  const out = filterCaptainsLogBody("a\nb", "zzz");
  assert.equal(out.shownLines, 0);
  assert.match(out.body, /No lines match/);
});

test("loadCaptainsLogForDate swallows network errors", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const result = await loadCaptainsLogForDate("2026-05-07", fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.text, "");
});
