import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { recoverDraftArrayJson, WhatsAppDraftStore } from "../packages/whatsapp/src/draftStore.js";

test("recoverDraftArrayJson restores longest valid array prefix", () => {
  const good = JSON.stringify([{ id: "a", x: 1 }]);
  const corrupt = `${good}\n{ "broken`;
  const { drafts, recovered } = recoverDraftArrayJson(corrupt);
  assert.equal(recovered, true);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].id, "a");
});

test("WhatsAppDraftStore list rewrites corrupt file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-draft-"));
  const filePath = path.join(dir, "drafts.json");
  const good = JSON.stringify([{ id: "wa_draft_1", status: "pending_confirmation" }]);
  await fs.writeFile(filePath, `${good}\ntrailing garbage`, "utf8");

  const store = new WhatsAppDraftStore(filePath);
  const list = await store.list();
  assert.equal(list.length, 1);

  const roundTrip = await fs.readFile(filePath, "utf8");
  assert.doesNotThrow(() => JSON.parse(roundTrip));
});
