import { test } from "node:test";
import assert from "node:assert/strict";
import { createMission, planMission } from "../packages/core/src/index.js";
import { MissionStatus } from "../packages/core/src/types.js";
import {
  buildIntentToolCalls,
  mergePlanWithIntentRouting,
  routeMissionIntent,
  routeWithMockLlm,
  routeWithRegex
} from "../apps/operator/src/intent-router.js";

const tools = [
  {
    id: "whatsapp.draft",
    label: "WhatsApp Draft",
    risk: "DANGEROUS",
    requiresConfirmation: true
  },
  {
    id: "obsidian.sync",
    label: "Obsidian Sync",
    risk: "PARTIAL",
    requiresConfirmation: true
  },
  {
    id: "graphify.export",
    label: "Graphify Export",
    risk: "PARTIAL",
    requiresConfirmation: false
  }
];

test("intent router regex finds whatsapp tool for direct command", () => {
  const routed = routeWithRegex("send whatsapp message to 407");
  assert.ok(routed.requestedTools.includes("whatsapp.draft"));
  assert.equal(routed.source, "regex");
  assert.ok(routed.confidence >= 0.36);
});

test("intent router hybrid falls back to regex when llm confidence below threshold", () => {
  const llmOnly = routeWithMockLlm("sync obsidian vault notes");
  assert.ok(llmOnly.requestedTools.includes("obsidian.sync"));

  const routed = routeMissionIntent("sync obsidian vault notes", {
    mode: "hybrid",
    minConfidence: 0.95
  });
  assert.equal(routed.selectedSource, "regex");
  assert.equal(routed.fallbackUsed, true);
  assert.ok(routed.requestedTools.includes("obsidian.sync"));
});

test("intent router builds tool calls with parsed args and confirmation gate", () => {
  const calls = buildIntentToolCalls({
    missionInput: 'send whatsapp to +40700111222 "Salut din JARVIS"',
    requestedTools: ["whatsapp.draft"],
    tools
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].toolId, "whatsapp.draft");
  assert.equal(calls[0].requiresConfirmation, true);
  assert.equal(calls[0].args.to, "+40700111222");
  assert.equal(calls[0].args.body, "Salut din JARVIS");
});

test("intent router merge enriches fallback mission plan with routed tool calls", () => {
  const mission = createMission({ input: "status check" });
  const fallbackPlan = planMission(mission, tools);
  assert.equal(fallbackPlan.steps.length, 0);

  const route = routeMissionIntent('send whatsapp to +40700111222 "Salut"', {
    mode: "hybrid",
    minConfidence: 0.5
  });
  const toolCalls = buildIntentToolCalls({
    missionInput: mission.input,
    requestedTools: route.requestedTools,
    tools
  });
  const merged = mergePlanWithIntentRouting({
    mission,
    fallbackPlan,
    route,
    toolCalls
  });

  assert.equal(merged.steps.length, 1);
  assert.equal(merged.steps[0].toolId, "whatsapp.draft");
  assert.equal(merged.steps[0].status, MissionStatus.WAITING_CONFIRMATION);
  assert.equal(merged.status, MissionStatus.WAITING_CONFIRMATION);
  assert.equal(merged.intentRouter.selectedSource, route.selectedSource);
  assert.ok(Array.isArray(merged.toolCalls));
});
