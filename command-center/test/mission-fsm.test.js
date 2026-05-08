import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveMissionUiFsm, buildMissionStateSnapshot } from "../packages/core/src/missionFsm.js";
import { MissionStatus } from "../packages/core/src/types.js";

test("deriveMissionUiFsm standby without mission", () => {
  const out = deriveMissionUiFsm(null);
  assert.equal(out.fsm, "STANDBY");
});

test("deriveMissionUiFsm waiting_confirmation from plan", () => {
  const mission = {
    id: "m1",
    status: MissionStatus.DRAFTED,
    input: "draft whatsapp",
    plan: { status: MissionStatus.WAITING_CONFIRMATION, steps: [], risks: [] }
  };
  assert.equal(deriveMissionUiFsm(mission).fsm, "WAITING_CONFIRMATION");
});

test("deriveMissionUiFsm ready plan maps to DONE", () => {
  const mission = {
    id: "m2",
    status: MissionStatus.DRAFTED,
    input: "obsidian",
    plan: { status: MissionStatus.READY, steps: [{ status: MissionStatus.READY }], risks: [] }
  };
  assert.equal(deriveMissionUiFsm(mission).fsm, "DONE");
});

test("deriveMissionUiFsm step waiting_confirmation wins over ready plan", () => {
  const mission = {
    id: "m3",
    status: MissionStatus.DRAFTED,
    input: "mixed",
    plan: {
      status: MissionStatus.READY,
      steps: [{ status: MissionStatus.WAITING_CONFIRMATION }],
      risks: []
    }
  };
  assert.equal(deriveMissionUiFsm(mission).fsm, "WAITING_CONFIRMATION");
});

test("buildMissionStateSnapshot trims preview", () => {
  const snap = buildMissionStateSnapshot({
    id: "x",
    status: MissionStatus.DRAFTED,
    input: "a".repeat(200),
    plan: { status: MissionStatus.READY, steps: [] }
  });
  assert.equal(snap.derivedFsm, "DONE");
  assert.equal(snap.mission.inputPreview.length, 160);
});
