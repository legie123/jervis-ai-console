import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCopilotHint } from "../apps/web/src/services/copilot-hints.js";

test("copilot hints prioritize emergency stop", () => {
  const text = resolveCopilotHint({
    effectiveFsm: "STANDBY",
    bootOffline: false,
    emergencyActive: true,
    missionPreview: "x"
  });
  assert.match(text, /Emergency stop/i);
});

test("copilot hints surface boot offline", () => {
  const text = resolveCopilotHint({ bootOffline: true, effectiveFsm: "DONE" });
  assert.match(text, /offline/i);
});

test("copilot hints show confirmation guidance", () => {
  const text = resolveCopilotHint({ effectiveFsm: "WAITING_CONFIRMATION" });
  assert.match(text, /confirmation/i);
});

test("copilot hints default shortcut tip", () => {
  const text = resolveCopilotHint({ effectiveFsm: "STANDBY", bootOffline: false });
  assert.match(text, /⌘K/);
  assert.match(text, /Ruflo \+ Hermes \+ GoodMood feeds/i);
});

test("copilot hints append workspace nudge on standby", () => {
  const ops = resolveCopilotHint({
    effectiveFsm: "STANDBY",
    bootOffline: false,
    activeSectionId: "section-ops"
  });
  assert.match(ops, /Ruflo Agents feed/i);

  const graph = resolveCopilotHint({
    effectiveFsm: "STANDBY",
    bootOffline: false,
    activeSectionId: "section-graph"
  });
  assert.match(graph, /Graph — search/);

  const desk = resolveCopilotHint({
    effectiveFsm: "STANDBY",
    bootOffline: false,
    activeSectionId: "section-desk"
  });
  assert.match(desk, /Desk — notes/i);
  assert.match(desk, /Ruflo pulse/i);
});

test("copilot hints summarize ready mission with preview", () => {
  const text = resolveCopilotHint({
    effectiveFsm: "DONE",
    missionPreview: "draft whatsapp to client about invoice",
    planStatus: "ready"
  });
  assert.match(text, /ready/i);
  assert.match(text, /draft whatsapp/i);
});
