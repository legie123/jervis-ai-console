import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRAPH_NODE_TYPES,
  clampZoom,
  createGraphFilters,
  filterGraphBySearch,
  getGraphNodeContext,
  getVisibleGraph,
  layoutGraph,
  nextZoom,
  shortGraphLabel,
  summarizeGraph
} from "../apps/web/src/graph-viewer.js";

const map = {
  counts: {
    nodes: 5,
    edges: 4,
    drafts: 1,
    inbox: 1,
    jobs: 1,
    audit: 1
  },
  nodes: [
    { id: "jarvis", type: "system", label: "JARVIS", status: "REAL" },
    { id: "tool:whatsapp.draft", type: "tool", label: "WhatsApp Draft", status: "PARTIAL" },
    { id: "draft:1", type: "whatsapp_draft", label: "407 pending", status: "pending_confirmation" },
    { id: "message:1", type: "whatsapp_message", label: "Client: Salut", status: "received", from: "407" },
    { id: "job:1", type: "scheduler_job", label: "ready", status: "scheduled" }
  ],
  edges: [
    { from: "jarvis", to: "tool:whatsapp.draft", type: "uses" },
    { from: "tool:whatsapp.draft", to: "draft:1", type: "creates" },
    { from: "message:1", to: "tool:whatsapp.draft", type: "can_reply_with" },
    { from: "job:1", to: "draft:1", type: "activates" }
  ]
};

test("graph viewer creates default filters for all node types", () => {
  const filters = createGraphFilters();
  assert.deepEqual(Object.keys(filters), GRAPH_NODE_TYPES);
  assert.equal(Object.values(filters).every(Boolean), true);
});

test("graph viewer filters nodes and connected edges", () => {
  const filters = createGraphFilters();
  filters.whatsapp_draft = false;
  const visible = getVisibleGraph(map, filters);

  assert.equal(visible.nodes.some((node) => node.type === "whatsapp_draft"), false);
  assert.equal(visible.edges.some((edge) => edge.to === "draft:1"), false);
});

test("graph viewer deterministic layout places key groups", () => {
  const layout = layoutGraph(map);
  const system = layout.nodes.find((node) => node.type === "system");
  const draft = layout.nodes.find((node) => node.type === "whatsapp_draft");
  const job = layout.nodes.find((node) => node.type === "scheduler_job");

  assert.equal(layout.width, 1000);
  assert.equal(layout.height, 660);
  assert.equal(system.x, 500);
  assert.ok(draft.y < job.y);
  assert.equal(layout.edges.length, 4);
});

test("graph viewer search matches node fields and hides unrelated edges", () => {
  const visible = filterGraphBySearch(map, "pending");

  assert.equal(visible.nodes.length, 1);
  assert.equal(visible.nodes[0].id, "draft:1");
  assert.equal(visible.edges.length, 0);
  assert.equal(visible.matchedNodeIds.has("draft:1"), true);

  const byType = filterGraphBySearch(map, "scheduler_job");
  assert.equal(byType.nodes[0].id, "job:1");
});

test("graph viewer empty search preserves type-filter behavior", () => {
  const filters = createGraphFilters();
  filters.whatsapp_message = false;
  const searched = filterGraphBySearch(map, "", filters);
  const visible = getVisibleGraph(map, filters);

  assert.deepEqual(
    searched.nodes.map((node) => node.id),
    visible.nodes.map((node) => node.id)
  );
  assert.deepEqual(
    searched.edges.map((edge) => edge.type),
    visible.edges.map((edge) => edge.type)
  );
});

test("graph viewer clamps and steps zoom", () => {
  assert.equal(clampZoom(0.1), 0.5);
  assert.equal(clampZoom(3), 2.5);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(nextZoom(1, 1), 1.2);
  assert.equal(nextZoom(1, -1), 0.8);
});

test("graph viewer returns node action shortcuts", () => {
  const message = getGraphNodeContext(map, map.nodes.find((node) => node.id === "message:1"));
  assert.equal(message.action.type, "reply_draft");
  assert.equal(message.action.details.to, "407");
  assert.ok(message.relatedIds.includes("tool:whatsapp.draft"));

  const draft = getGraphNodeContext(map, map.nodes.find((node) => node.id === "draft:1"));
  assert.equal(draft.action.type, "send_gate");
  assert.equal(draft.action.details.draftId, "1");

  const job = getGraphNodeContext(map, map.nodes.find((node) => node.id === "job:1"));
  assert.equal(job.action.type, "scheduler_details");
  assert.equal(job.action.details.relatedDraftId, "1");

  const tool = getGraphNodeContext(map, map.nodes.find((node) => node.id === "tool:whatsapp.draft"));
  assert.equal(tool.action.type, "highlight_related");
  assert.ok(tool.action.details.relatedCount > 0);
});

test("graph viewer mission context lists planned tools", () => {
  const missionMap = {
    nodes: [
      { id: "mission:1", type: "mission", label: "Plan", status: "drafted" },
      { id: "tool:whatsapp.draft", type: "tool", label: "WhatsApp", status: "PARTIAL" }
    ],
    edges: [{ from: "mission:1", to: "tool:whatsapp.draft", type: "plans_with" }]
  };
  const mission = getGraphNodeContext(missionMap, missionMap.nodes[0]);
  assert.equal(mission.action.type, "mission_steps");
  assert.deepEqual(mission.action.details.plannedTools, ["whatsapp.draft"]);
});

test("graph viewer summaries and labels are compact", () => {
  assert.deepEqual(summarizeGraph(map), {
    nodes: 5,
    edges: 4,
    drafts: 1,
    inbox: 1,
    jobs: 1,
    audit: 1
  });
  assert.equal(shortGraphLabel("1234567890", 6), "12345…");
});
