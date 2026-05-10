import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JARVIS_PERSONAL_KEYS,
  loadPriorities,
  loadScratch,
  savePriorities,
  saveScratch
} from "../apps/web/src/services/personal-desk-store.js";

test("personal desk store roundtrip on memory localStorage", () => {
  const mem = new Map();
  /** @type {Storage} */
  const storage = {
    get length() {
      return mem.size;
    },
    key() {
      return null;
    },
    clear() {
      mem.clear();
    },
    getItem(key) {
      return mem.has(key) ? mem.get(key) : null;
    },
    setItem(key, val) {
      mem.set(key, String(val));
    },
    removeItem(key) {
      mem.delete(key);
    }
  };

  assert.equal(saveScratch("hello world", storage), true);
  assert.equal(loadScratch(storage), "hello world");
  assert.ok(JARVIS_PERSONAL_KEYS.scratch.includes("jarvis.personal"));

  const rows = [
    { id: "x", text: "a", done: false, order: 1 },
    { id: "y", text: "b", done: true, order: 2 }
  ];
  assert.equal(savePriorities(rows, storage), true);
  assert.deepEqual(loadPriorities(storage), rows);
});
