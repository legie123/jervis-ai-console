import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BOOT_FSM_STORAGE_KEY,
  BOOT_FSM_URLS,
  clearStoredBootFsmUrls,
  loadStoredBootFsmUrls,
  resolveBootFsmUrls,
  riskToLedIndex,
  saveStoredBootFsmUrls
} from "../apps/web/src/components/constants.js";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map.entries())
  };
}

test("riskToLedIndex maps risk strings to tier index", () => {
  assert.equal(riskToLedIndex("LOW"), 0);
  assert.equal(riskToLedIndex("MED"), 1);
  assert.equal(riskToLedIndex("HIGH"), 2);
  assert.equal(riskToLedIndex("CRIT"), 3);
  assert.equal(riskToLedIndex("CRITICAL"), 3);
  assert.equal(riskToLedIndex("DANGEROUS"), 2);
  assert.equal(riskToLedIndex("MODERATE"), 1);
  assert.equal(riskToLedIndex(undefined), 0);
});

test("saveStoredBootFsmUrls + loadStoredBootFsmUrls roundtrip", () => {
  const storage = memoryStorage();
  const ok = saveStoredBootFsmUrls(
    [
      { url: "http://10.0.0.5:9000/fsm", port: 9000, label: "Lab" },
      { url: "http://10.0.0.6:9001/fsm", label: "Mirror" }
    ],
    storage
  );
  assert.equal(ok, true);
  const loaded = loadStoredBootFsmUrls(storage);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].label, "Lab");
  assert.equal(loaded[1].port, 9001);
});

test("saveStoredBootFsmUrls infers port from URL when missing", () => {
  const storage = memoryStorage();
  saveStoredBootFsmUrls([{ url: "http://127.0.0.1:8123/fsm", label: "Custom" }], storage);
  const loaded = loadStoredBootFsmUrls(storage);
  assert.equal(loaded[0].port, 8123);
});

test("saveStoredBootFsmUrls drops invalid rows", () => {
  const storage = memoryStorage();
  saveStoredBootFsmUrls([{ url: "" }, { url: "http://valid:7000/fsm" }], storage);
  const loaded = loadStoredBootFsmUrls(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].url, "http://valid:7000/fsm");
});

test("saveStoredBootFsmUrls with empty array clears storage", () => {
  const storage = memoryStorage();
  storage.setItem(BOOT_FSM_STORAGE_KEY, "[]");
  saveStoredBootFsmUrls([], storage);
  assert.equal(storage.getItem(BOOT_FSM_STORAGE_KEY), null);
});

test("clearStoredBootFsmUrls removes stored entry", () => {
  const storage = memoryStorage();
  saveStoredBootFsmUrls([{ url: "http://1.1.1.1:7777/fsm" }], storage);
  assert.notEqual(storage.getItem(BOOT_FSM_STORAGE_KEY), null);
  clearStoredBootFsmUrls(storage);
  assert.equal(storage.getItem(BOOT_FSM_STORAGE_KEY), null);
});

test("loadStoredBootFsmUrls returns null for malformed JSON", () => {
  const storage = memoryStorage();
  storage.setItem(BOOT_FSM_STORAGE_KEY, "not-json");
  assert.equal(loadStoredBootFsmUrls(storage), null);
});

test("loadStoredBootFsmUrls returns null for empty array payload", () => {
  const storage = memoryStorage();
  storage.setItem(BOOT_FSM_STORAGE_KEY, "[]");
  assert.equal(loadStoredBootFsmUrls(storage), null);
});

test("resolveBootFsmUrls priority: storage > globalThis > defaults", () => {
  const storage = memoryStorage();
  const prev = globalThis.__JARVIS_BOOT_FSM_URLS__;
  try {
    globalThis.__JARVIS_BOOT_FSM_URLS__ = undefined;
    const defaults = resolveBootFsmUrls(storage);
    assert.deepEqual(defaults, BOOT_FSM_URLS);

    globalThis.__JARVIS_BOOT_FSM_URLS__ = [
      { url: "http://global:7777/fsm", port: 7777, label: "Global" }
    ];
    const fromGlobal = resolveBootFsmUrls(storage);
    assert.equal(fromGlobal.length, 1);
    assert.equal(fromGlobal[0].label, "Global");

    saveStoredBootFsmUrls([{ url: "http://stored:9000/fsm", port: 9000, label: "Stored" }], storage);
    const fromStored = resolveBootFsmUrls(storage);
    assert.equal(fromStored.length, 1);
    assert.equal(fromStored[0].label, "Stored");
    assert.equal(fromStored[0].port, 9000);
  } finally {
    globalThis.__JARVIS_BOOT_FSM_URLS__ = prev;
  }
});
