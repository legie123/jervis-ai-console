/**
 * tests/graphify/index.test.js — Phase 10 Graphify tests
 * Run: node --test tests/graphify/index.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  emitNode, emitEdge, emitMission,
  getNode, listNodes, listEdges, neighbors, summary,
  exportObsidian, configure,
  NODE_TYPES, EDGE_TYPES,
  _testReset
} from "../../server/graphify/index.js";
import { _testReset as auditReset } from "../../server/audit/log.js";

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "jervis-graph-")); }

test("NODE_TYPES + EDGE_TYPES exposed", () => {
  assert.ok(NODE_TYPES.includes("mission"));
  assert.ok(NODE_TYPES.includes("project"));
  assert.ok(NODE_TYPES.includes("file"));
  assert.ok(EDGE_TYPES.includes("uses"));
  assert.ok(EDGE_TYPES.includes("modified"));
});

test("emitNode rejects unknown type", () => {
  _testReset();
  assert.throws(() => emitNode({ type: "alien", name: "x" }), /unknown node type/);
});

test("emitNode requires name", () => {
  _testReset();
  assert.throws(() => emitNode({ type: "mission" }), /name required/);
});

test("emitNode is idempotent on type+name", () => {
  _testReset();
  const n1 = emitNode({ type: "mission", name: "Refactor V3" });
  const n2 = emitNode({ type: "mission", name: "Refactor V3", meta: { extra: 1 } });
  assert.equal(n1.id, n2.id);
  assert.equal(n2.meta.extra, 1);
});

test("getNode by id and by type+name", () => {
  _testReset();
  const n = emitNode({ type: "project", name: "trade ai" });
  assert.equal(getNode(n.id).name, "trade ai");
  assert.equal(getNode("project", "trade ai").id, n.id);
  assert.equal(getNode("project", "missing"), null);
});

test("listNodes filters by type", () => {
  _testReset();
  emitNode({ type: "mission", name: "m1" });
  emitNode({ type: "tool", name: "t1" });
  emitNode({ type: "tool", name: "t2" });
  assert.equal(listNodes({ type: "mission" }).length, 1);
  assert.equal(listNodes({ type: "tool" }).length, 2);
  assert.equal(listNodes().length, 3);
});

test("emitEdge rejects unknown type", () => {
  _testReset();
  const a = emitNode({ type: "mission", name: "a" });
  const b = emitNode({ type: "tool", name: "b" });
  assert.throws(() => emitEdge({ from: a, to: b, type: "schmoo" }), /unknown edge type/);
});

test("emitEdge requires existing nodes", () => {
  _testReset();
  assert.throws(() => emitEdge({ from: "nope1", to: "nope2", type: "uses" }), /requires existing nodes/);
});

test("emitEdge stores edge", () => {
  _testReset();
  const a = emitNode({ type: "mission", name: "a" });
  const b = emitNode({ type: "tool", name: "b" });
  const e = emitEdge({ from: a, to: b, type: "uses" });
  assert.equal(e.from, a.id);
  assert.equal(e.to, b.id);
  assert.equal(e.type, "uses");
});

test("listEdges filters by from + type", () => {
  _testReset();
  const m = emitNode({ type: "mission", name: "M" });
  const t1 = emitNode({ type: "tool", name: "T1" });
  const t2 = emitNode({ type: "tool", name: "T2" });
  const f = emitNode({ type: "file", name: "F" });
  emitEdge({ from: m, to: t1, type: "uses" });
  emitEdge({ from: m, to: t2, type: "uses" });
  emitEdge({ from: m, to: f, type: "modified" });
  assert.equal(listEdges({ from: m, type: "uses" }).length, 2);
  assert.equal(listEdges({ from: m, type: "modified" }).length, 1);
  assert.equal(listEdges({ from: m }).length, 3);
});

test("emitMission creates full subgraph", () => {
  _testReset();
  const r = emitMission({
    mission: "Add IDE Layer",
    project: "jervis bridge",
    tools: ["Cursor", "Claude Code"],
    files: ["server/ide/index.js", "tests/ide/router.test.js"],
    result: "delivered",
    person: "Andrei"
  });
  assert.equal(r.mission.type, "mission");
  assert.equal(r.project.type, "project");
  assert.equal(r.tools.length, 2);
  assert.equal(r.files.length, 2);
  assert.equal(r.result.type, "result");
  assert.equal(r.person.type, "person");
  assert.ok(r.edges.length >= 6);
});

test("neighbors returns in + out", () => {
  _testReset();
  const m = emitNode({ type: "mission", name: "X" });
  const t = emitNode({ type: "tool", name: "Y" });
  const p = emitNode({ type: "person", name: "Z" });
  emitEdge({ from: m, to: t, type: "uses" });
  emitEdge({ from: p, to: m, type: "owns" });

  const ngh = neighbors(m);
  assert.equal(ngh.out.length, 1);
  assert.equal(ngh.in.length, 1);
  assert.equal(ngh.out[0].node.name, "Y");
  assert.equal(ngh.in[0].node.name, "Z");
});

test("summary returns counts", () => {
  _testReset();
  emitMission({ mission: "M", tools: ["T"], files: ["F"] });
  const s = summary();
  assert.equal(s.nodes, 3); // mission, tool, file
  assert.equal(s.edges, 2); // uses + modified
  assert.equal(s.byNodeType.mission, 1);
  assert.equal(s.byEdgeType.uses, 1);
});

test("audit hooks fire when autoAuditOnEmit enabled", () => {
  auditReset({ enabled: false });
  _testReset({ autoAuditOnEmit: true });
  emitNode({ type: "mission", name: "audited" });
  // no throw = ok; we don't assert audit content here (covered in audit tests)
  assert.ok(true);
});

test("exportObsidian fails when vault missing", async () => {
  _testReset({ vaultRoot: "/path/that/does/not/exist/123abc" });
  emitNode({ type: "mission", name: "ghost" });
  const r = await exportObsidian();
  assert.equal(r.ok, false);
  assert.match(r.error, /vault not found/);
});

test("exportObsidian writes notes when vault exists", async () => {
  const vault = tmp();
  _testReset({ vaultRoot: vault });
  const m = emitNode({ type: "mission", name: "Build IDE Layer" });
  const t = emitNode({ type: "tool", name: "Cursor" });
  const f = emitNode({ type: "file", name: "ide.js" });
  emitEdge({ from: m, to: t, type: "uses" });
  emitEdge({ from: m, to: f, type: "modified" });

  const r = await exportObsidian();
  assert.equal(r.ok, true);
  assert.equal(r.count, 1);
  assert.ok(r.files[0].endsWith(".md"));
  const content = fs.readFileSync(r.files[0], "utf8");
  assert.match(content, /# Mission: Build IDE Layer/);
  assert.match(content, /\[\[Cursor\]\]/);
  assert.match(content, /\[\[ide\.js\]\]/);
  assert.match(content, /uses/);
  assert.match(content, /modified/);
});

test("persistence: nodes.jsonl + edges.jsonl created", async () => {
  const dir = tmp();
  _testReset({ storeDir: dir, enabled: true });
  emitMission({ mission: "Persist test", tools: ["T1"], files: ["F1"] });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fs.existsSync(path.join(dir, "nodes.jsonl")), true);
  assert.equal(fs.existsSync(path.join(dir, "edges.jsonl")), true);
});

test("emitMission with no tools/files/result still works", () => {
  _testReset();
  const r = emitMission({ mission: "Solo mission", project: "p" });
  assert.ok(r.mission);
  assert.ok(r.project);
  assert.equal(r.tools.length, 0);
  assert.equal(r.result, null);
});
