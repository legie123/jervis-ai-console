import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMission, planMission } from "../packages/core/src/index.js";
import { assessConfirmation, confirmAction } from "../packages/tools/src/index.js";
import { SafeWhatsApp, WhatsAppDraftStore } from "../packages/whatsapp/src/index.js";

test("whatsapp mission requires confirmation", () => {
  const mission = createMission({ input: "draft whatsapp reply" });
  const plan = planMission(mission, [{ id: "whatsapp.draft" }]);

  assert.equal(plan.status, "waiting_confirmation");
  assert.deepEqual(plan.risks, ["DANGEROUS"]);
});

test("dangerous action is blocked until exact confirmation", () => {
  const gate = assessConfirmation({
    action: "send_whatsapp",
    target: "client",
    risk: "DANGEROUS"
  });

  assert.equal(gate.allowed, false);
  assert.equal(confirmAction(gate, "yes").allowed, false);
  assert.equal(confirmAction(gate, "CONFIRM").allowed, true);
});

test("real whatsapp send is disabled", async () => {
  const whatsapp = new SafeWhatsApp();
  await assert.rejects(() => whatsapp.send(), /sendConfirmedDraft/);
});

test("send confirmed draft requires exact token", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-safety-"));
  const whatsapp = new SafeWhatsApp({
    draftStore: new WhatsAppDraftStore(path.join(dir, "drafts.json"))
  });
  const draft = await whatsapp.draftMessage({ to: "40700000000", body: "Salut" });

  await assert.rejects(() => whatsapp.sendConfirmedDraft(draft.id, "CONFIRM"), /Missing exact/);
});
