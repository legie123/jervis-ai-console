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

import { riskToLedIndex } from "./components/constants.js";
import { createBootPoller } from "./components/boot-poller.js";
import { mountJervisOrb } from "./components/jervis-orb.js";
import { mountFsmPill } from "./components/fsm-pill.js";
import { mountRiskIndicator } from "./components/risk-indicator.js";
import { mountVoiceOrb } from "./components/voice-orb.js";
import { mountToastRegion } from "./components/toasts.js";
import { mountErrorBoundary } from "./components/error-boundary.js";
import { mountStatusTile } from "./components/status-tile.js";
import { mountCaptainsLog } from "./components/captains-log.js";
import { createAuditFeed } from "./components/audit-feed.js";
import { mountPendingActionModal } from "./components/pending-action-modal.js";
import { mountCommandPalette } from "./components/command-palette.js";
import { mountOperatorSettings } from "./components/operator-settings.js";

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

/** Elite UI shared state */
let liveFsmState = "STANDBY";
let riskTierIndex = 0;
let lastHealth = null;
let lastAuditEntries = [];
let prevFsmForGate = "STANDBY";

const toastRegion = mountToastRegion(document.querySelector("#mountToasts"));
mountErrorBoundary(document.querySelector("#errorBoundaryBanner"));

const orbApi = mountJervisOrb(document.querySelector("#mountJervisOrb"), () => liveFsmState);
const fsmApi = mountFsmPill(document.querySelector("#mountFsmPill"), () => liveFsmState);
const riskApi = mountRiskIndicator(document.querySelector("#mountRiskIndicator"), () => riskTierIndex);

mountVoiceOrb(document.querySelector("#mountVoiceOrb"), {
  onToggle: (on) => {
    toastRegion.push(on ? "Voice channel armed (demo)" : "Voice channel idle", "info");
  }
});

const bootBadgeEl = document.querySelector("#mountBootBadge");
const clockEl = document.querySelector("#mountClock");

function setClock() {
  const d = new Date();
  clockEl.dateTime = d.toISOString();
  clockEl.textContent = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
setClock();
setInterval(setClock, 30_000);

function paintFsmWidgets() {
  orbApi.update();
  fsmApi.update();
  riskApi.update();
}

function updateBootBadge(text, mode = "loading") {
  bootBadgeEl.textContent = text;
  bootBadgeEl.classList.remove("boot-badge-online", "boot-badge-offline", "boot-badge-loading");
  bootBadgeEl.classList.add(
    mode === "online" ? "boot-badge-online" : mode === "offline" ? "boot-badge-offline" : "boot-badge-loading"
  );
}

const bootPoller = createBootPoller({
  onTick: (result) => {
    if (result.offline) {
      updateBootBadge("BOOT OFFLINE · :7777 / :7778 (start supervisors)", "offline");
      liveFsmState = "STANDBY";
      paintFsmWidgets();
      return;
    }
    if (result.state) {
      liveFsmState = result.state;
      updateBootBadge(`FSM · ${result.label} :${result.port}`, "online");
      paintFsmWidgets();
      if (liveFsmState === "WAITING_CONFIRMATION" && prevFsmForGate !== "WAITING_CONFIRMATION") {
        pendingGate.open({
          message: "Supervisor requests explicit confirmation before ACTION."
        });
      }
      prevFsmForGate = liveFsmState;
    }
  }
});
bootPoller.start();

const pendingGate = mountPendingActionModal(document.querySelector("#mountPendingModal"), {
  onResolve: (ev) => {
    if (ev?.action === "confirmed") {
      toastRegion.push("Risk gate cleared (demo acknowledge)", "info");
    }
  }
});

const operatorSettings = mountOperatorSettings(document.querySelector("#mountOperatorSettings"), {
  onSaved: () => {
    toastRegion.push("Operator settings saved · boot URLs updated", "info");
  }
});

const tilesHost = document.querySelector("#mountStatusTiles");
const tTools = document.createElement("div");
const tBridge = document.createElement("div");
const tSched = document.createElement("div");
tilesHost.append(tTools, tBridge, tSched);

const sparkTools = [3, 4, 5, 4, 6];
const tileToolsCtl = mountStatusTile(tTools, {
  title: "TOOLS LOADED",
  getValue: () => lastHealth?.tools?.length ?? "—",
  spark: sparkTools
});

const tileBridgeCtl = mountStatusTile(tBridge, {
  title: "BRIDGE",
  getValue: () => (lastHealth?.whatsappBridge?.ok ? "ONLINE" : "OFFLINE"),
  spark: [0, 0, 1, 1, 1]
});

const tileSchedCtl = mountStatusTile(tSched, {
  title: "SCHEDULER MS",
  getValue: () => lastHealth?.scheduler?.intervalMs ?? "—",
  spark: [60000, 60000, 60000, 120000, 60000]
});

mountCaptainsLog(document.querySelector("#mountCaptainsLog"));

const auditCtl = createAuditFeed(document.querySelector("#mountAuditFeed"), {
  fetchAudit: async () => {
    const { entries } = await api("/api/audit");
    lastAuditEntries = entries || [];
    if (entries?.length) {
      riskTierIndex = riskToLedIndex(entries[0].risk);
      paintFsmWidgets();
    }
    return entries || [];
  }
});
auditCtl.start();

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
  try {
    const health = await api("/api/health");
    lastHealth = health;
    const sendStatus = health.whatsapp.realSendEnabled ? "WhatsApp send enabled" : "WhatsApp send disabled";
    const bridgeText = health.whatsappBridge?.ok ? "bridge online" : "bridge offline";
    statusLine.textContent = `${health.status}: ${health.tools.length} tools loaded. ${sendStatus}. ${bridgeText}.`;
    schedulerStatus.textContent = `Loop enabled=${health.scheduler.enabled} interval=${health.scheduler.intervalMs}ms autoSend=false`;
    bridgeStatus.textContent = `${health.whatsappBridge?.status || "UNKNOWN"} ${health.whatsappBridge?.url || ""}`;
    tileToolsCtl.update();
    tileBridgeCtl.update();
    tileSchedCtl.update();
  } catch (e) {
    statusLine.textContent = `Operator unreachable · ${e.message}`;
    toastRegion.push(`Health check failed · ${e.message}`, "error");
  }
}

function emptyListMessage(container, icon, title, hint) {
  container.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.innerHTML = `<span class="empty-icon" aria-hidden="true">${icon}</span><strong>${title}</strong><span class="empty-hint">${hint}</span>`;
  container.append(wrap);
}

async function loadDrafts() {
  const { drafts } = await api("/api/whatsapp/drafts");
  draftList.replaceChildren(
    ...drafts.map((draft) => {
      const item = document.createElement("article");
      item.className = "item";
      item.setAttribute("role", "listitem");

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
        await auditCtl.refresh();
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
    emptyListMessage(draftList, "✉", "Niciun draft", "JERVIS așteaptă instrucțiuni.");
  }
}

async function loadInbox() {
  const { messages } = await api("/api/whatsapp/messages");
  inboxList.replaceChildren(
    ...messages.map((message) => {
      const item = document.createElement("article");
      item.className = "item";
      item.setAttribute("role", "listitem");

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
    emptyListMessage(inboxList, "◇", "Niciun mesaj", "JERVIS așteaptă.");
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
      item.setAttribute("role", "listitem");

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
    emptyListMessage(bridgeInboxList, "◇", "Bridge inbox gol", "Pornește bridge-ul sau verifică token-ul.");
  }
}

async function loadBridgeDrafts() {
  const { drafts } = await api("/api/bridge/whatsapp/drafts");
  bridgeDraftList.replaceChildren(
    ...drafts.map((draft) => {
      const item = document.createElement("article");
      item.className = "item";
      item.setAttribute("role", "listitem");

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
    emptyListMessage(bridgeDraftList, "✉", "Niciun bridge draft", "Creează din formular.");
  }
}

async function loadJobs() {
  const { jobs } = await api("/api/scheduler/jobs");
  jobList.replaceChildren(
    ...jobs.map((job) => {
      const item = document.createElement("article");
      item.className = "item";
      item.setAttribute("role", "listitem");
      const title = document.createElement("strong");
      title.textContent = `${job.action} - ${job.status}`;
      const text = document.createElement("p");
      text.textContent = `${job.targetId} | ${job.runAt}`;
      item.append(title, text);
      return item;
    })
  );

  if (jobs.length === 0) {
    emptyListMessage(jobList, "⏱", "Niciun job programat", "Scheduler gol.");
  }
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.target === id);
  });
}

const shortcutsOverlay = document.querySelector("#shortcutsOverlay");
document.querySelector("#shortcutsCloseBtn")?.addEventListener("click", () => {
  shortcutsOverlay.hidden = true;
});

shortcutsOverlay?.addEventListener("click", (e) => {
  if (e.target === shortcutsOverlay) shortcutsOverlay.hidden = true;
});

function navTargets() {
  return ["section-mission", "section-ops", "section-bridge", "section-system", "section-graph"];
}

const paletteCtl = mountCommandPalette(document.querySelector("#mountCommandPalette"), {
  commands: [
    {
      title: "Go · Mission",
      group: "Navigation",
      keywords: "mission plan",
      run: () => scrollToSection("section-mission")
    },
    {
      title: "Go · Ops",
      group: "Navigation",
      keywords: "whatsapp inbox draft",
      run: () => scrollToSection("section-ops")
    },
    {
      title: "Go · Bridge",
      group: "Navigation",
      keywords: "bridge whatsapp",
      run: () => scrollToSection("section-bridge")
    },
    {
      title: "Go · System",
      group: "Navigation",
      keywords: "backup scheduler obsidian",
      run: () => scrollToSection("section-system")
    },
    {
      title: "Go · Graphify",
      group: "Navigation",
      keywords: "graph map export",
      run: () => scrollToSection("section-graph")
    },
    {
      title: "Refresh health",
      group: "Actions",
      keywords: "status operator",
      run: () => loadHealth().then(() => toastRegion.push("Health refreshed", "info"))
    },
    {
      title: "Focus mission input",
      group: "Actions",
      keywords: "compose type",
      run: () => {
        scrollToSection("section-mission");
        missionInput.focus();
      }
    },
    {
      title: "Open risk gate demo",
      group: "Safety",
      keywords: "confirm modal",
      run: () =>
        pendingGate.open({
          message: "Demo risk gate — requires CONFIRM phrase."
        })
    },
    {
      title: "Refresh inbox",
      group: "WhatsApp",
      keywords: "messages",
      run: () => loadInbox().then(() => toastRegion.push("Inbox refreshed", "info"))
    },
    {
      title: "Open · Operator settings",
      group: "System",
      keywords: "boot fsm urls config localStorage settings preferences",
      run: () => operatorSettings.open()
    },
    {
      title: "Export · Audit JSON",
      group: "System",
      keywords: "audit export download json",
      run: () => {
        auditCtl.exportEntries();
        toastRegion.push("Audit JSON downloaded", "info");
      }
    }
  ],
  onClose: () => {}
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => scrollToSection(btn.dataset.target));
});

document.addEventListener("keydown", (e) => {
  const meta = e.metaKey || e.ctrlKey;
  if (meta && e.key.toLowerCase() === "k") {
    e.preventDefault();
    paletteCtl.open();
  }
  if (meta && e.key === ",") {
    e.preventDefault();
    operatorSettings.open();
  }
  if (meta && e.key >= "1" && e.key <= "5") {
    e.preventDefault();
    const idx = Number(e.key) - 1;
    const id = navTargets()[idx];
    if (id) scrollToSection(id);
  }
  if (!meta && e.key === "?") {
    e.preventDefault();
    shortcutsOverlay.hidden = !shortcutsOverlay.hidden;
  }
  if (e.key === "Escape" && !shortcutsOverlay.hidden) {
    shortcutsOverlay.hidden = true;
  }
  if ((meta || e.ctrlKey) && e.key === "Enter") {
    const dlg = pendingGate.element;
    if (dlg?.open) {
      e.preventDefault();
      const phrase = document.querySelector("#pendingPhraseInput");
      if (phrase && phrase.value.trim().toUpperCase() === "CONFIRM") {
        document.querySelector("#pendingStep2Btn")?.click();
      } else {
        document.querySelector("#pendingStep1Btn")?.click();
      }
    }
  }
});

missionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/mission", {
      method: "POST",
      body: JSON.stringify({ input: missionInput.value })
    });
    showJson(missionOutput, result);
    toastRegion.push("Mission planned", "info");
    await auditCtl.refresh();
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});

draftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
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
    toastRegion.push("Draft created", "info");
    await loadDrafts();
    await loadJobs();
    await auditCtl.refresh();
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});

document.querySelector("#bridgeCreateDraftBtn").addEventListener("click", async () => {
  try {
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
    await auditCtl.refresh();
    toastRegion.push("Bridge draft created", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});

sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api(`/api/whatsapp/drafts/${sendDraftId.value}/send`, {
      method: "POST",
      body: JSON.stringify({ confirmToken: sendToken.value })
    });
    showJson(sendOutput, result);
    await loadDrafts();
    await auditCtl.refresh();
    toastRegion.push("Send gate processed", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});

document.querySelector("#bridgeSendBtn").addEventListener("click", async () => {
  try {
    const result = await api(`/api/bridge/whatsapp/drafts/${sendDraftId.value}/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmToken: bridgeToken.value })
    });
    showJson(bridgeOutput, result);
    await loadBridgeDrafts();
    await auditCtl.refresh();
    toastRegion.push("Bridge send attempted", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});

document.querySelector("#healthBtn").addEventListener("click", loadHealth);
document.querySelector("#bridgeStatusBtn").addEventListener("click", loadBridgeStatus);
document.querySelector("#bridgePreflightBtn").addEventListener("click", loadBridgePreflight);
document.querySelector("#bridgeInboxBtn").addEventListener("click", loadBridgeInbox);
document.querySelector("#bridgeDraftsBtn").addEventListener("click", loadBridgeDrafts);
document.querySelector("#refreshDraftsBtn").addEventListener("click", loadDrafts);
document.querySelector("#refreshInboxBtn").addEventListener("click", loadInbox);
document.querySelector("#runDueBtn").addEventListener("click", async () => {
  try {
    const result = await api("/api/scheduler/run-due", { method: "POST" });
    showJson(draftOutput, result);
    await loadDrafts();
    await loadJobs();
    await auditCtl.refresh();
    toastRegion.push("Scheduler tick", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});
document.querySelector("#backupBtn").addEventListener("click", async () => {
  try {
    const result = await api("/api/backup", {
      method: "POST",
      body: JSON.stringify({ label: backupLabel.value || "manual" })
    });
    showJson(backupOutput, result);
    await auditCtl.refresh();
    toastRegion.push("Backup requested", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});
document.querySelector("#exportStateBtn").addEventListener("click", async () => {
  try {
    const result = await api("/api/state/export");
    showJson(backupOutput, result);
    toastRegion.push("State exported", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});
document.querySelector("#obsidianSyncBtn").addEventListener("click", async () => {
  try {
    const result = await api("/api/obsidian/sync-summary", {
      method: "POST",
      body: JSON.stringify({ confirmToken: obsidianToken.value })
    });
    showJson(obsidianOutput, result);
    await auditCtl.refresh();
    toastRegion.push("Obsidian sync attempted", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
});
document.querySelector("#graphifyExportBtn").addEventListener("click", async () => {
  try {
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
    await auditCtl.refresh();
    toastRegion.push("Graph exported", "info");
  } catch (err) {
    toastRegion.push(err.message, "error");
  }
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

/** Predictive focus */
function predictiveFocus() {
  if (liveFsmState === "WAITING_CONFIRMATION" && pendingGate.element?.open) {
    document.querySelector("#pendingPhraseInput")?.focus();
    return;
  }
  if (liveFsmState === "STANDBY") {
    missionInput?.focus();
  }
}

await loadHealth();
await loadInbox();
await loadDrafts();
await loadJobs();
await auditCtl.refresh();

predictiveFocus();
