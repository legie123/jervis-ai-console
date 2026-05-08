/**
 * server/graphify/index.js — JERVIS V3 Phase 10
 * Author: claude-coder (sesiunea 2026-05-06)
 *
 * Graph emitter — captures mission→project→tool→file→result→person edges
 * as agent operates. JSONL persist + in-memory adjacency map. Auto-export
 * to Obsidian markdown notes for visual recall.
 *
 * Node types:
 *   mission    — operator's high-level objective
 *   project    — codebase / location
 *   tool       — IDE/Cursor/WhatsApp/etc launched
 *   file       — touched/created/modified
 *   result     — outcome record
 *   person     — operator or contact
 *   event      — FSM transition / audit milestone
 *
 * Edge types:
 *   uses, contains, modified, sent_to, completed_by, blocked_by, references, depends_on
 *
 * Pure ESM. Zero deps.
 */

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import { appendEvent } from "../audit/log.js";

export const NODE_TYPES = Object.freeze([
  "mission", "project", "tool", "file", "result", "person", "event"
]);

export const EDGE_TYPES = Object.freeze([
  "uses", "contains", "modified", "sent_to",
  "completed_by", "blocked_by", "references", "depends_on", "owns", "produced"
]);

const _nodes = new Map();   // id -> node
const _edges = [];          // {from, to, type, ts, meta}
const _byType = new Map();  // type -> Set<id>

let _config = {
  storeDir: process.env.JERVIS_GRAPH_DIR || path.join(process.cwd(), "data", "graphify"),
  vaultRoot: process.env.JERVIS_VAULT || "/Users/user/Desktop/BUSSINES/Antigraity/TRADE AI",
  vaultDir: "Graphify",
  enabled: true,
  autoAuditOnEmit: true
};

/* ============================================================
   NODE OPS
   ============================================================ */

function nodeId(type, name) {
  const norm = `${type}:${String(name).toLowerCase().trim()}`;
  return createHash("sha256").update(norm).digest("hex").slice(0, 12);
}

/**
 * Idempotent: returns existing node if same type+name; updates metadata.
 */
export function emitNode({ type, name, label, meta = {} }) {
  if (!NODE_TYPES.includes(type)) throw new Error(`unknown node type: ${type}`);
  if (!name || !String(name).trim()) throw new Error("node name required");

  const id = nodeId(type, name);
  const existing = _nodes.get(id);

  if (existing) {
    existing.label = label || existing.label;
    existing.meta = { ...existing.meta, ...meta };
    existing.touchedAt = new Date().toISOString();
    return existing;
  }

  const node = {
    id,
    type,
    name: String(name).trim(),
    label: label || String(name).trim(),
    meta: { ...meta },
    createdAt: new Date().toISOString(),
    touchedAt: new Date().toISOString()
  };

  _nodes.set(id, node);
  if (!_byType.has(type)) _byType.set(type, new Set());
  _byType.get(type).add(id);

  if (_config.autoAuditOnEmit) {
    appendEvent({
      eventType: "memory",
      action: "graph_node_emit",
      result: "ok",
      meta: { id, type, name }
    });
  }

  persistNode(node).catch(() => {});
  return node;
}

/* ============================================================
   EDGE OPS
   ============================================================ */

export function emitEdge({ from, to, type, meta = {} }) {
  if (!EDGE_TYPES.includes(type)) throw new Error(`unknown edge type: ${type}`);
  const fromNode = typeof from === "object" ? from : _nodes.get(from);
  const toNode   = typeof to   === "object" ? to   : _nodes.get(to);
  if (!fromNode || !toNode) {
    throw new Error(`edge requires existing nodes; from=${from} to=${to}`);
  }

  const edge = {
    id: randomUUID().slice(0, 12),
    from: fromNode.id,
    to:   toNode.id,
    type,
    ts: new Date().toISOString(),
    meta: { ...meta }
  };

  _edges.push(edge);

  if (_config.autoAuditOnEmit) {
    appendEvent({
      eventType: "memory",
      action: "graph_edge_emit",
      result: "ok",
      meta: { from: fromNode.name, to: toNode.name, type }
    });
  }

  persistEdge(edge).catch(() => {});
  return edge;
}

/**
 * Convenience: emit a complete subgraph for a mission.
 *
 * @example
 *   emitMission({
 *     mission: "Refactor JERVIS V3",
 *     project: "trade ai",
 *     tools: ["Claude Code", "Cursor"],
 *     files: ["src/main.jsx", "server/index.js"],
 *     result: "completed",
 *     person: "Andrei"
 *   });
 */
export function emitMission({ mission, project, tools = [], files = [], result, person, meta = {} }) {
  const m = emitNode({ type: "mission", name: mission, meta: { ...meta, missionTitle: mission } });
  const out = { mission: m, project: null, tools: [], files: [], result: null, person: null, edges: [] };

  if (project) {
    out.project = emitNode({ type: "project", name: project });
    out.edges.push(emitEdge({ from: m, to: out.project, type: "uses" }));
  }

  for (const t of tools) {
    const n = emitNode({ type: "tool", name: t });
    out.tools.push(n);
    out.edges.push(emitEdge({ from: m, to: n, type: "uses" }));
  }

  for (const f of files) {
    const n = emitNode({ type: "file", name: f });
    out.files.push(n);
    out.edges.push(emitEdge({ from: m, to: n, type: "modified" }));
  }

  if (result) {
    out.result = emitNode({ type: "result", name: result });
    out.edges.push(emitEdge({ from: m, to: out.result, type: "completed_by" }));
  }

  if (person) {
    out.person = emitNode({ type: "person", name: person });
    out.edges.push(emitEdge({ from: out.person, to: m, type: "owns" }));
  }

  return out;
}

/* ============================================================
   QUERY
   ============================================================ */

export function getNode(idOrType, name) {
  if (!name) return _nodes.get(idOrType) || null;
  return _nodes.get(nodeId(idOrType, name)) || null;
}

export function listNodes({ type, limit = 100 } = {}) {
  if (type) {
    const ids = _byType.get(type) || new Set();
    return [...ids].slice(0, limit).map((id) => ({ ..._nodes.get(id) }));
  }
  return [..._nodes.values()].slice(0, limit).map((n) => ({ ...n }));
}

export function listEdges({ from, to, type, limit = 100 } = {}) {
  return _edges
    .filter((e) => {
      if (from && e.from !== (typeof from === "object" ? from.id : from)) return false;
      if (to && e.to !== (typeof to === "object" ? to.id : to)) return false;
      if (type && e.type !== type) return false;
      return true;
    })
    .slice(-limit)
    .reverse()
    .map((e) => ({ ...e }));
}

export function neighbors(nodeIdOrObj) {
  const id = typeof nodeIdOrObj === "object" ? nodeIdOrObj.id : nodeIdOrObj;
  const out = { in: [], out: [] };
  for (const e of _edges) {
    if (e.from === id) {
      const n = _nodes.get(e.to);
      if (n) out.out.push({ edge: { ...e }, node: { ...n } });
    }
    if (e.to === id) {
      const n = _nodes.get(e.from);
      if (n) out.in.push({ edge: { ...e }, node: { ...n } });
    }
  }
  return out;
}

export function summary() {
  const byType = {};
  for (const [t, set] of _byType) byType[t] = set.size;
  const edgeByType = {};
  for (const e of _edges) edgeByType[e.type] = (edgeByType[e.type] || 0) + 1;
  return {
    nodes: _nodes.size,
    edges: _edges.length,
    byNodeType: byType,
    byEdgeType: edgeByType
  };
}

/* ============================================================
   PERSISTENCE
   ============================================================ */

async function persistNode(node) {
  if (!_config.enabled) return;
  await fs.mkdir(_config.storeDir, { recursive: true });
  await fs.appendFile(path.join(_config.storeDir, "nodes.jsonl"), JSON.stringify(node) + "\n");
}

async function persistEdge(edge) {
  if (!_config.enabled) return;
  await fs.mkdir(_config.storeDir, { recursive: true });
  await fs.appendFile(path.join(_config.storeDir, "edges.jsonl"), JSON.stringify(edge) + "\n");
}

/* ============================================================
   OBSIDIAN EXPORT
   ============================================================ */

/**
 * Export current graph to Obsidian markdown — one note per mission.
 * Returns array of file paths written.
 */
export async function exportObsidian() {
  if (!fss.existsSync(_config.vaultRoot)) {
    return { ok: false, error: `vault not found: ${_config.vaultRoot}` };
  }
  const dir = path.join(_config.vaultRoot, _config.vaultDir);
  await fs.mkdir(dir, { recursive: true });

  const written = [];
  const missions = listNodes({ type: "mission" });

  for (const m of missions) {
    const ngh = neighbors(m.id);
    const lines = [];
    lines.push(`---`);
    lines.push(`type: mission`);
    lines.push(`mission: ${m.name}`);
    lines.push(`createdAt: ${m.createdAt}`);
    lines.push(`tags: [jervis, graphify, mission]`);
    lines.push(`---`);
    lines.push("");
    lines.push(`# Mission: ${m.label}`);
    lines.push("");

    const grouped = {};
    for (const item of ngh.out) {
      const t = item.node.type;
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(item);
    }
    for (const item of ngh.in) {
      const t = item.node.type + ":in";
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(item);
    }

    for (const [type, items] of Object.entries(grouped)) {
      lines.push(`## ${type}`);
      lines.push("");
      for (const it of items) {
        lines.push(`- [[${it.node.label}]] _(${it.edge.type})_`);
      }
      lines.push("");
    }

    const safeName = m.name.replace(/[^\w\s.-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    const file = path.join(dir, `${safeName || "mission-" + m.id}.md`);
    await fs.writeFile(file, lines.join("\n"));
    written.push(file);
  }

  return { ok: true, count: written.length, files: written };
}

/* ============================================================
   CONFIG + RESET
   ============================================================ */

export function configure(opts = {}) {
  _config = { ..._config, ...opts };
}

export function _testReset(opts = {}) {
  _nodes.clear();
  _edges.length = 0;
  _byType.clear();
  _config = {
    storeDir: path.join(process.cwd(), "data", "graphify"),
    vaultRoot: "/tmp/nonexistent-vault",
    vaultDir: "Graphify",
    enabled: true,
    autoAuditOnEmit: false,
    ...opts
  };
}

export default {
  NODE_TYPES, EDGE_TYPES,
  emitNode, emitEdge, emitMission,
  getNode, listNodes, listEdges, neighbors, summary,
  exportObsidian, configure, _testReset
};
