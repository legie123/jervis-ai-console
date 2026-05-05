import {
  GRAPH_NODE_TYPES,
  GRAPH_TYPE_META,
  GRAPH_ZOOM,
  clampZoom,
  createGraphFilters,
  filterGraphBySearch,
  getGraphNodeContext,
  layoutGraph,
  nextZoom,
  shortGraphLabel,
  summarizeGraph
} from "./graph-viewer.js";

const statusLine = document.querySelector("#statusLine");
const missionForm = document.querySelector("#missionForm");
const missionInput = document.querySelector("#missionInput");
const missionOutput = document.querySelector("#missionOutput");
const draftForm = document.querySelector("#draftForm");
const draftTo = document.querySelector("#draftTo");
const draftBody = document.querySelector("#draftBody");
const draftSchedule = document.querySelector("#draftSchedule");
const draftOutput = document.querySelector("#draftOutput");
const sendForm = document.querySelector("#sendForm");
const sendDraftId = document.querySelector("#sendDraftId");
const sendToken = document.querySelector("#sendToken");
const sendOutput = document.querySelector("#sendOutput");
const bridgeStatus = document.querySelector("#bridgeStatus");
const bridgeToken = document.querySelector("#bridgeToken");
const bridgeOutput = document.querySelector("#bridgeOutput");
const bridgeInboxList = document.querySelector("#bridgeInboxList");
const bridgeDraftList = document.querySelector("#bridgeDraftList");
const inboxList = document.querySelector("#inboxList");
const draftList = document.querySelector("#draftList");
const jobList = document.querySelector("#jobList");
const schedulerStatus = document.querySelector("#schedulerStatus");
const auditList = document.querySelector("#auditList");
const backupLabel = document.querySelector("#backupLabel");
const backupOutput = document.querySelector("#backupOutput");
const obsidianToken = document.querySelector("#obsidianToken");
const obsidianOutput = document.querySelector("#obsidianOutput");
const graphifyOutput = document.querySelector("#graphifyOutput");
const graphCounts = document.querySelector("#graphCounts");
const graphFilters = document.querySelector("#graphFilters");
const graphSearch = document.querySelector("#graphSearch");
const graphMatchCount = document.querySelector("#graphMatchCount");
const graphSvg = document.querySelector("#graphSvg");
const graphNodeDetails = document.querySelector("#graphNodeDetails");

let currentGraphMap = null;
let graphFiltersState = createGraphFilters();
let graphView = { x: 0, y: 0, scale: GRAPH_ZOOM.initial };
let graphDrag = null;
let graphRelatedIds = new Set();
let selectedGraphNodeId = "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function showJson(element, value) {
  element.textContent = JSON.stringify(value, null, 2);
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function renderGraphFilters() {
  graphFilters.replaceChildren(
    ...GRAPH_NODE_TYPES.map((type) => {
      const label = document.createElement("label");
      label.className = "graph-filter";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = graphFiltersState[type] !== false;
      input.addEventListener("change", () => {
        graphFiltersState[type] = input.checked;
        renderGraph();
      });

      const swatch = document.createElement("span");
      swatch.className = "graph-swatch";
      swatch.style.background = GRAPH_TYPE_META[type].color;

      const text = document.createElement("span");
      text.textContent = GRAPH_TYPE_META[type].label;

      label.append(input, swatch, text);
      return label;
    })
  );
}

function renderGraphCounts(map) {
  const summary = summarizeGraph(map);
  graphCounts.replaceChildren(
    ...Object.entries(summary).map(([key, value]) => {
      const item = document.createElement("span");
      item.textContent = `${key}: ${value}`;
      return item;
    })
  );
}

function graphTransform() {
  return `translate(${graphView.x} ${graphView.y}) scale(${graphView.scale})`;
}

function updateGraphMatchCount() {
  if (!currentGraphMap) {
    graphMatchCount.textContent = "0 matches";
    return;
  }

  const visible = filterGraphBySearch(currentGraphMap, graphSearch.value, graphFiltersState);
  const label = graphSearch.value.trim() ? "matches" : "visible";
  graphMatchCount.textContent = `${visible.nodes.length} ${label}`;
}

function applyGraphNodeShortcut(node) {
  const context = getGraphNodeContext(currentGraphMap, node);
  graphRelatedIds = new Set(context.relatedIds);
  selectedGraphNodeId = node.id;

  if (context.action.type === "reply_draft") {
    draftTo.value = context.action.details.to;
    draftBody.value = "";
    draftBody.focus();
  }

  if (context.action.type === "send_gate") {
    sendDraftId.value = context.action.details.draftId;
    sendToken.focus();
  }

  if (context.action.type === "scheduler_details" && context.action.details.relatedDraftId) {
    sendDraftId.value = context.action.details.relatedDraftId;
  }

  graphNodeDetails.textContent = JSON.stringify(
    {
      action: context.action,
      relatedIds: context.relatedIds,
      node
    },
    null,
    2
  );
}

function renderGraph() {
  graphSvg.replaceChildren();
  if (!currentGraphMap) {
    graphNodeDetails.textContent = "Export map to render graph.";
    return;
  }

  const layout = layoutGraph(currentGraphMap, graphFiltersState, graphSearch.value);
  updateGraphMatchCount();
  const scene = createSvgElement("g", {
    id: "graphScene",
    transform: graphTransform()
  });
  const edgeLayer = createSvgElement("g", { class: "graph-edge-layer" });
  const nodeLayer = createSvgElement("g", { class: "graph-node-layer" });

  for (const edge of layout.edges) {
    edgeLayer.append(
      createSvgElement("line", {
        class: "graph-edge",
        x1: edge.fromNode.x,
        y1: edge.fromNode.y,
        x2: edge.toNode.x,
        y2: edge.toNode.y
      })
    );

    const distance = Math.hypot(edge.toNode.x - edge.fromNode.x, edge.toNode.y - edge.fromNode.y);
    if (distance > 130) {
      const label = createSvgElement("text", {
        class: "graph-edge-label",
        x: (edge.fromNode.x + edge.toNode.x) / 2,
        y: (edge.fromNode.y + edge.toNode.y) / 2 - 4
      });
      label.textContent = shortGraphLabel(edge.type, 22);
      edgeLayer.append(label);
    }
  }

  for (const node of layout.nodes) {
    const classNames = [
      "graph-node",
      `graph-node-${node.type}`,
      graphSearch.value.trim() && node.matched ? "graph-node-match" : "",
      graphRelatedIds.has(node.id) ? "graph-node-related" : "",
      selectedGraphNodeId === node.id ? "graph-node-selected" : ""
    ].filter(Boolean);
    const group = createSvgElement("g", {
      class: classNames.join(" "),
      tabindex: "0",
      role: "button"
    });
    const color = GRAPH_TYPE_META[node.type]?.color || "#e8eef8";

    group.append(
      createSvgElement("circle", {
        cx: node.x,
        cy: node.y,
        r: node.type === "system" ? 34 : 25,
        fill: color
      })
    );

    const label = createSvgElement("text", {
      class: "graph-node-label",
      x: node.x,
      y: node.y + 43
    });
    label.textContent = shortGraphLabel(node.label || node.id, 24);
    group.append(label);

    const status = createSvgElement("text", {
      class: "graph-node-status",
      x: node.x,
      y: node.y + 57
    });
    status.textContent = shortGraphLabel(node.status || node.type, 20);
    group.append(status);

    const selectNode = () => {
      applyGraphNodeShortcut(node);
      renderGraph();
    };
    group.addEventListener("click", selectNode);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectNode();
      }
    });

    nodeLayer.append(group);
  }

  scene.append(edgeLayer, nodeLayer);
  graphSvg.append(scene);
}

async function loadHealth() {
  const health = await api("/api/health");
  const sendStatus = health.whatsapp.realSendEnabled ? "WhatsApp send enabled" : "WhatsApp send disabled";
  const bridgeText = health.whatsappBridge?.ok ? "bridge online" : "bridge offline";
  statusLine.textContent = `${health.status}: ${health.tools.length} tools loaded. ${sendStatus}. ${bridgeText}.`;
  schedulerStatus.textContent = `Loop enabled=${health.scheduler.enabled} interval=${health.scheduler.intervalMs}ms autoSend=false`;
  bridgeStatus.textContent = `${health.whatsappBridge?.status || "UNKNOWN"} ${health.whatsappBridge?.url || ""}`;
}

async function loadDrafts() {
  const { drafts } = await api("/api/whatsapp/drafts");
  draftList.replaceChildren(
    ...drafts.map((draft) => {
      const item = document.createElement("article");
      item.className = "item";

      const title = document.createElement("strong");
      title.textContent = `${draft.to} - ${draft.status}`;

      const text = document.createElement("p");
      text.textContent = draft.body;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "danger";
      button.textContent = "Confirm No-Send";
      button.disabled = draft.status !== "pending_confirmation" && draft.status !== "scheduled_draft";
      button.addEventListener("click", async () => {
        const result = await api(`/api/whatsapp/drafts/${draft.id}/confirm`, { method: "POST" });
        showJson(draftOutput, result);
        await loadDrafts();
        await loadAudit();
      });

      const sendPick = document.createElement("button");
      sendPick.type = "button";
      sendPick.textContent = "Use For Send";
      sendPick.addEventListener("click", () => {
        sendDraftId.value = draft.id;
        sendToken.focus();
      });

      item.append(title, text, button, sendPick);
      return item;
    })
  );

  if (drafts.length === 0) {
    draftList.textContent = "No drafts.";
  }
}

async function loadInbox() {
  const { messages } = await api("/api/whatsapp/messages");
  inboxList.replaceChildren(
    ...messages.map((message) => {
      const item = document.createElement("article");
      item.className = "item";

      const title = document.createElement("strong");
      title.textContent = `${message.displayName || message.from} - ${message.type}`;

      const text = document.createElement("p");
      text.textContent = message.body || "[non-text message]";

      const reply = document.createElement("button");
      reply.type = "button";
      reply.textContent = "Reply Draft";
      reply.addEventListener("click", () => {
        draftTo.value = message.from;
        draftBody.value = "";
        draftBody.focus();
      });

      item.append(title, text, reply);
      return item;
    })
  );

  if (messages.length === 0) {
    inboxList.textContent = "No inbound messages.";
  }
}

async function loadBridgeStatus() {
  const result = await api("/api/bridge/whatsapp/status");
  bridgeStatus.textContent = `${result.status} ${result.url}`;
  showJson(bridgeOutput, result);
}

async function loadBridgePreflight() {
  const result = await api("/api/bridge/whatsapp/preflight");
  const preflight = result.preflight;
  bridgeStatus.textContent = preflight.ok
    ? "READY: WhatsApp bridge send config present"
    : `BLOCKED: missing ${preflight.missing.join(", ") || "unknown config"}`;
  showJson(bridgeOutput, result);
}

async function loadBridgeInbox() {
  const { messages } = await api("/api/bridge/whatsapp/messages");
  bridgeInboxList.replaceChildren(
    ...messages.map((message) => {
      const item = document.createElement("article");
      item.className = "item";

      const title = document.createElement("strong");
      title.textContent = `${message.displayName || message.from} - ${message.type || "message"}`;

      const text = document.createElement("p");
      text.textContent = message.body || message.text || "[non-text message]";

      const reply = document.createElement("button");
      reply.type = "button";
      reply.textContent = "Reply Draft";
      reply.addEventListener("click", () => {
        draftTo.value = message.from;
        draftBody.value = "";
        draftBody.focus();
      });

      item.append(title, text, reply);
      return item;
    })
  );

  if (messages.length === 0) {
    bridgeInboxList.textContent = "No bridge messages.";
  }
}

async function loadBridgeDrafts() {
  const { drafts } = await api("/api/bridge/whatsapp/drafts");
  bridgeDraftList.replaceChildren(
    ...drafts.map((draft) => {
      const item = document.createElement("article");
      item.className = "item";

      const title = document.createElement("strong");
      title.textContent = `${draft.to} - ${draft.status}`;

      const text = document.createElement("p");
      text.textContent = draft.text || draft.body || "";

      const pick = document.createElement("button");
      pick.type = "button";
      pick.textContent = "Use For Bridge Send";
      pick.disabled = draft.status !== "pending_confirmation";
      pick.addEventListener("click", () => {
        sendDraftId.value = draft.id;
        bridgeToken.focus();
      });

      item.append(title, text, pick);
      return item;
    })
  );

  if (drafts.length === 0) {
    bridgeDraftList.textContent = "No bridge drafts.";
  }
}

async function loadJobs() {
  const { jobs } = await api("/api/scheduler/jobs");
  jobList.replaceChildren(
    ...jobs.map((job) => {
      const item = document.createElement("article");
      item.className = "item";
      const title = document.createElement("strong");
      title.textContent = `${job.action} - ${job.status}`;
      const text = document.createElement("p");
      text.textContent = `${job.targetId} | ${job.runAt}`;
      item.append(title, text);
      return item;
    })
  );

  if (jobs.length === 0) {
    jobList.textContent = "No scheduled jobs.";
  }
}

async function loadAudit() {
  const { entries } = await api("/api/audit");
  auditList.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement("article");
      item.className = "item";
      const title = document.createElement("strong");
      title.textContent = `${entry.action} - ${entry.status}`;
      const text = document.createElement("p");
      text.textContent = `${entry.ts} | ${entry.source} | ${entry.risk}`;
      item.append(title, text);
      return item;
    })
  );

  if (entries.length === 0) {
    auditList.textContent = "No audit entries.";
  }
}

missionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api("/api/mission", {
    method: "POST",
    body: JSON.stringify({ input: missionInput.value })
  });
  showJson(missionOutput, result);
  await loadAudit();
});

draftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api("/api/whatsapp/drafts", {
    method: "POST",
    body: JSON.stringify({
      to: draftTo.value,
      body: draftBody.value,
      scheduledFor: draftSchedule.value || null,
      reason: "Created from command center UI"
    })
  });
  showJson(draftOutput, result);
  draftBody.value = "";
  await loadDrafts();
  await loadJobs();
  await loadAudit();
});

document.querySelector("#bridgeCreateDraftBtn").addEventListener("click", async () => {
  const result = await api("/api/bridge/whatsapp/drafts", {
    method: "POST",
    body: JSON.stringify({
      to: draftTo.value,
      body: draftBody.value,
      reason: "Created from command center bridge UI"
    })
  });
  showJson(bridgeOutput, result);
  await loadBridgeDrafts();
  await loadAudit();
});

sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api(`/api/whatsapp/drafts/${sendDraftId.value}/send`, {
    method: "POST",
    body: JSON.stringify({ confirmToken: sendToken.value })
  });
  showJson(sendOutput, result);
  await loadDrafts();
  await loadAudit();
});

document.querySelector("#bridgeSendBtn").addEventListener("click", async () => {
  const result = await api(`/api/bridge/whatsapp/drafts/${sendDraftId.value}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmToken: bridgeToken.value })
  });
  showJson(bridgeOutput, result);
  await loadBridgeDrafts();
  await loadAudit();
});

document.querySelector("#healthBtn").addEventListener("click", loadHealth);
document.querySelector("#bridgeStatusBtn").addEventListener("click", loadBridgeStatus);
document.querySelector("#bridgePreflightBtn").addEventListener("click", loadBridgePreflight);
document.querySelector("#bridgeInboxBtn").addEventListener("click", loadBridgeInbox);
document.querySelector("#bridgeDraftsBtn").addEventListener("click", loadBridgeDrafts);
document.querySelector("#refreshDraftsBtn").addEventListener("click", loadDrafts);
document.querySelector("#refreshInboxBtn").addEventListener("click", loadInbox);
document.querySelector("#runDueBtn").addEventListener("click", async () => {
  const result = await api("/api/scheduler/run-due", { method: "POST" });
  showJson(draftOutput, result);
  await loadDrafts();
  await loadJobs();
  await loadAudit();
});
document.querySelector("#refreshAuditBtn").addEventListener("click", loadAudit);
document.querySelector("#backupBtn").addEventListener("click", async () => {
  const result = await api("/api/backup", {
    method: "POST",
    body: JSON.stringify({ label: backupLabel.value || "manual" })
  });
  showJson(backupOutput, result);
  await loadAudit();
});
document.querySelector("#exportStateBtn").addEventListener("click", async () => {
  const result = await api("/api/state/export");
  showJson(backupOutput, result);
});
document.querySelector("#obsidianSyncBtn").addEventListener("click", async () => {
  const result = await api("/api/obsidian/sync-summary", {
    method: "POST",
    body: JSON.stringify({ confirmToken: obsidianToken.value })
  });
  showJson(obsidianOutput, result);
  await loadAudit();
});
document.querySelector("#graphifyExportBtn").addEventListener("click", async () => {
  const result = await api("/api/graphify/export", { method: "POST" });
  currentGraphMap = result.map;
  renderGraphCounts(currentGraphMap);
  renderGraphFilters();
  renderGraph();
  showJson(graphifyOutput, {
    exportPath: result.exportPath,
    counts: result.map.counts,
    status: result.map.status
  });
  await loadAudit();
});
graphSearch.addEventListener("input", renderGraph);
document.querySelector("#graphZoomOutBtn").addEventListener("click", () => {
  graphView.scale = nextZoom(graphView.scale, -1);
  renderGraph();
});
document.querySelector("#graphZoomInBtn").addEventListener("click", () => {
  graphView.scale = nextZoom(graphView.scale, 1);
  renderGraph();
});
document.querySelector("#graphResetBtn").addEventListener("click", () => {
  graphView = { x: 0, y: 0, scale: GRAPH_ZOOM.initial };
  renderGraph();
});
graphSvg.addEventListener("wheel", (event) => {
  if (!currentGraphMap) return;
  event.preventDefault();
  graphView.scale = nextZoom(graphView.scale, event.deltaY > 0 ? -1 : 1);
  renderGraph();
});
graphSvg.addEventListener("pointerdown", (event) => {
  if (!currentGraphMap) return;
  graphDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    viewX: graphView.x,
    viewY: graphView.y
  };
  graphSvg.setPointerCapture(event.pointerId);
});
graphSvg.addEventListener("pointermove", (event) => {
  if (!graphDrag || graphDrag.pointerId !== event.pointerId) return;
  graphView.x = graphDrag.viewX + event.clientX - graphDrag.startX;
  graphView.y = graphDrag.viewY + event.clientY - graphDrag.startY;
  const scene = document.querySelector("#graphScene");
  scene?.setAttribute("transform", graphTransform());
});
graphSvg.addEventListener("pointerup", (event) => {
  if (graphDrag?.pointerId === event.pointerId) graphDrag = null;
});
graphSvg.addEventListener("pointercancel", () => {
  graphDrag = null;
});

await loadHealth();
await loadInbox();
await loadDrafts();
await loadJobs();
await loadAudit();
