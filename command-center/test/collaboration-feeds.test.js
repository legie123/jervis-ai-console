import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadCollaborationFeeds,
  resetCollaborationFeedCache
} from "../apps/web/src/services/collaboration-feeds.js";

test("loadCollaborationFeeds always hits ruflo, hermes, and good_mood feeds when registry lists other adapters only", async () => {
  resetCollaborationFeedCache();
  const calls = [];

  async function apiOptional(path) {
    calls.push(path);
    if (path === "/api/adapters") {
      return {
        ok: true,
        adapters: [{ id: "obsidian", enabled: true, feedPath: "/api/obsidian/feed" }]
      };
    }
    if (path === "/api/obsidian/feed") {
      return { ok: true, enabled: true, entries: [{ id: "1", title: "note", preview: "x", ts: new Date().toISOString() }] };
    }
    if (path === "/api/ruflo/feed") {
      return { ok: true, enabled: false, entries: [] };
    }
    if (path === "/api/hermes/feed") {
      return { ok: true, enabled: false, entries: [] };
    }
    if (path === "/api/good-mood/feed") {
      return { ok: true, enabled: false, entries: [] };
    }
    return { ok: true, entries: [] };
  }

  const feeds = await loadCollaborationFeeds({ apiOptional, force: true });
  assert.ok(calls.includes("/api/ruflo/feed"), `ruflo feed required, calls=${calls.join(",")}`);
  assert.ok(calls.includes("/api/hermes/feed"), `hermes feed required, calls=${calls.join(",")}`);
  assert.ok(calls.includes("/api/good-mood/feed"), `good_mood feed required, calls=${calls.join(",")}`);
  assert.ok(Array.isArray(feeds.obsidian));
  assert.equal(feeds.ruflo, undefined);
});
