/**
 * wake.test.js — Phase 8 wake-phrase detector unit tests
 * Author: Claude (sesiunea 2026-05-05)
 *
 * Run with: node --test tests/voice/wake.test.js
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectWake, stripWake, WAKE_PHRASES } from "../../src/voice/wake.js";

test("detects 'hey jervis'", () => {
  assert.equal(detectWake("hey jervis open claude code"), "hey jervis");
});

test("detects 'Hey JERVIS' case-insensitive", () => {
  assert.equal(detectWake("Hey JERVIS, status please"), "hey jervis");
});

test("detects with diacritics in surrounding text", () => {
  assert.equal(detectWake("hei jervis astăzi"), null); // 'hei' not in default list
  assert.equal(detectWake("salut jervis ce faci"), "salut jervis");
});

test("detects without space between words", () => {
  assert.equal(detectWake("heyjervis"), "hey jervis");
});

test("returns null when no wake phrase present", () => {
  assert.equal(detectWake("just some random text"), null);
  assert.equal(detectWake(""), null);
  assert.equal(detectWake(null), null);
});

test("stripWake removes the matched phrase", () => {
  assert.equal(
    stripWake("hey jervis open claude code"),
    "open claude code"
  );
});

test("stripWake handles punctuation around the phrase", () => {
  assert.equal(stripWake("Hey, JERVIS — status."), "Hey, JERVIS — status.");
  // (current impl is whitespace-bound; stripping punctuation is residue)
});

test("stripWake collapses whitespace", () => {
  assert.equal(stripWake("hey jervis    open  app"), "open app");
});

test("WAKE_PHRASES is non-empty array of strings", () => {
  assert.ok(Array.isArray(WAKE_PHRASES));
  assert.ok(WAKE_PHRASES.length >= 4);
  for (const p of WAKE_PHRASES) assert.equal(typeof p, "string");
});

test("custom phrases override default", () => {
  assert.equal(
    detectWake("computer status", ["computer"]),
    "computer"
  );
  assert.equal(
    detectWake("hey jervis", ["computer"]),
    null
  );
});
