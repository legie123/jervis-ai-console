export const GRAPH_NODE_TYPES = [
  "system",
  "tool",
  "mission",
  "whatsapp_draft",
  "whatsapp_message",
  "scheduler_job",
  "audit_summary"
];

export const GRAPH_TYPE_META = {
  system: { label: "System", color: "#e8eef8" },
  tool: { label: "Tools", color: "#81c784" },
  mission: { label: "Missions", color: "#64b5f6" },
  whatsapp_draft: { label: "Drafts", color: "#ffb74d" },
  whatsapp_message: { label: "Inbox", color: "#4dd0e1" },
  scheduler_job: { label: "Jobs", color: "#ba68c8" },
  audit_summary: { label: "Audit", color: "#e57373" }
};

export const GRAPH_ZOOM = {
  min: 0.5,
  max: 2.5,
  step: 0.2,
  initial: 1
};

const GROUP_LAYOUT = {
  system: { x: 500, y: 300, columns: 1, gapX: 1, gapY: 1 },
  tool: { x: 360, y: 90, columns: 3, gapX: 150, gapY: 88 },
  mission: { x: 120, y: 210, columns: 1, gapX: 1, gapY: 82 },
  whatsapp_draft: { x: 390, y: 210, columns: 2, gapX: 155, gapY: 74 },
  whatsapp_message: { x: 720, y: 200, columns: 2, gapX: 145, gapY: 74 },
  scheduler_job: { x: 300, y: 515, columns: 3, gapX: 155, gapY: 74 },
  audit_summary: { x: 860, y: 515, columns: 1, gapX: 1, gapY: 1 }
};

export function createGraphFilters(enabled = true) {
  return Object.fromEntries(GRAPH_NODE_TYPES.map((type) => [type, enabled]));
}

export function summarizeGraph(map) {
  const counts = map?.counts || {};
  return {
    nodes: counts.nodes || map?.nodes?.length || 0,
    edges: counts.edges || map?.edges?.length || 0,
    drafts: counts.drafts || 0,
    inbox: counts.inbox || 0,
    jobs: counts.jobs || 0,
    audit: counts.audit || 0
  };
}

export function getVisibleGraph(map, filters = createGraphFilters()) {
  const nodes = (map?.nodes || []).filter((node) => filters[node.type] !== false);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = (map?.edges || []).filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  return { nodes, edges };
}

function nodeMatchesSearch(node, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [node.id, node.label, node.status, node.type, node.risk]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

export function filterGraphBySearch(map, query = "", filters = createGraphFilters()) {
  const typeVisible = getVisibleGraph(map, filters);
  const normalized = query.trim();
  if (!normalized) return { ...typeVisible, matchedNodeIds: new Set(typeVisible.nodes.map((node) => node.id)) };

  const nodes = typeVisible.nodes.filter((node) => nodeMatchesSearch(node, normalized));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = typeVisible.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));

  return { nodes, edges, matchedNodeIds: visibleIds };
}

export function layoutGraph(map, filters = createGraphFilters(), query = "") {
  const visible = filterGraphBySearch(map, query, filters);
  const groupedIndexes = new Map();
  const positionedNodes = visible.nodes.map((node) => {
    const group = GROUP_LAYOUT[node.type] || GROUP_LAYOUT.system;
    const index = groupedIndexes.get(node.type) || 0;
    groupedIndexes.set(node.type, index + 1);

    const column = index % group.columns;
    const row = Math.floor(index / group.columns);
    const offsetX = group.columns > 1 ? column * group.gapX - ((group.columns - 1) * group.gapX) / 2 : 0;

    return {
      ...node,
      matched: visible.matchedNodeIds?.has(node.id) || false,
      x: group.x + offsetX,
      y: group.y + row * group.gapY
    };
  });

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));
  const positionedEdges = visible.edges
    .map((edge) => ({
      ...edge,
      fromNode: nodeById.get(edge.from),
      toNode: nodeById.get(edge.to)
    }))
    .filter((edge) => edge.fromNode && edge.toNode);

  return {
    width: 1000,
    height: 660,
    nodes: positionedNodes,
    edges: positionedEdges
  };
}

export function shortGraphLabel(value, maxLength = 34) {
  const label = String(value || "");
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

export function getGraphNodeContext(map, node) {
  const edges = map?.edges || [];
  const relatedEdges = edges.filter((edge) => edge.from === node.id || edge.to === node.id);
  const relatedIds = new Set(
    relatedEdges.flatMap((edge) => [edge.from, edge.to]).filter((id) => id && id !== node.id)
  );

  let action = {
    type: "inspect",
    label: "Inspect node",
    details: {}
  };

  if (node.type === "whatsapp_message") {
    action = {
      type: "reply_draft",
      label: "Reply draft target filled",
      details: { to: node.from || "" }
    };
  }

  if (node.type === "whatsapp_draft") {
    action = {
      type: "send_gate",
      label: "Send Gate draft filled",
      details: { draftId: node.id.replace(/^draft:/, "") }
    };
  }

  if (node.type === "scheduler_job") {
    const draftId = [...relatedIds].find((id) => id.startsWith("draft:")) || "";
    action = {
      type: "scheduler_details",
      label: "Scheduler relationship highlighted",
      details: { relatedDraftId: draftId.replace(/^draft:/, "") }
    };
  }

  if (node.type === "tool") {
    action = {
      type: "highlight_related",
      label: "Related nodes highlighted",
      details: { relatedCount: relatedIds.size }
    };
  }

  if (node.type === "mission") {
    const plannedTools = [...relatedIds]
      .filter((id) => id.startsWith("tool:"))
      .map((id) => id.replace(/^tool:/, ""));
    action = {
      type: "mission_steps",
      label: "Mission plan tools shown",
      details: { plannedTools }
    };
  }

  return {
    node,
    action,
    relatedEdges,
    relatedIds: [...relatedIds]
  };
}

export function clampZoom(value) {
  if (!Number.isFinite(value)) return GRAPH_ZOOM.initial;
  return Math.min(GRAPH_ZOOM.max, Math.max(GRAPH_ZOOM.min, Number(value.toFixed(2))));
}

export function nextZoom(current, direction) {
  return clampZoom(current + GRAPH_ZOOM.step * direction);
}
