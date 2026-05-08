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
import { mountApprovalQueue } from "./components/approval-queue.js";
import { mountLiveUnifiedInbox } from "./components/live-unified-inbox.js";
import { mountPremiumUxRail } from "./components/premium-ux-rail.js";
import { mountInteractiveGuide } from "./components/interactive-guide.js";
import { loadCollaborationFeeds } from "./services/collaboration-feeds.js";
import { createGraphRuntime } from "./services/graph-runtime.js";
import {
  clearEmergencyStop as clearEmergencyStopService,
  resolveScopedToken as resolveScopedTokenService,
  triggerEmergencyStop as triggerEmergencyStopService
} from "./services/security-ops.js";
import { createShellNavigation } from "./services/shell-navigation.js";
import { createMissionStateStream, mergeBootAndMissionFsm } from "./services/mission-state-stream.js";

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

/** Elite UI shared state — boot supervisor vs operator mission FSM merge */
let bootFsmState = "STANDBY";
let missionFsmState = "STANDBY";
let riskTierIndex = 0;
let lastHealth = null;
let lastAuditEntries = [];
let prevBootFsmForGate = "STANDBY";
let approvalQueueCtl = null;
let unifiedInboxCtl = null;
let bootProbeOffline = false;
let missionCopilotMeta = { preview: "", planStatus: "" };
let uxRail = null;

function getCopilotSnapshot() {
  return {
    effectiveFsm: effectiveFsmState(),
    bootOffline: bootProbeOffline,
    emergencyActive: Boolean(lastHealth?.security?.emergency?.active),
    missionPreview: missionCopilotMeta.preview || "",
    planStatus: missionCopilotMeta.planStatus || ""
  };
}

const toastRegion = mountToastRegion(document.querySelector("#mountToasts"));
mountErrorBoundary(document.querySelector("#errorBoundaryBanner"));

function effectiveFsmState() {
  return mergeBootAndMissionFsm(bootFsmState, missionFsmState);
}

const orbApi = mountJervisOrb(document.querySelector("#mountJervisOrb"), () => effectiveFsmState());
const fsmApi = mountFsmPill(document.querySelector("#mountFsmPill"), () => effectiveFsmState());
const riskApi = mountRiskIndicator(document.querySelector("#mountRiskIndicator"), () => riskTierIndex);

const voiceOrbApi = mountVoiceOrb(document.querySelector("#mountVoiceOrb"), {
  onToggle: (on) => {
    if (on) toastRegion.push("Voice channel armed", "info");
  },
  commandHandlers: {
    show_new_messages: () => handleVoiceShowMessages(),
    approve_last: () => handleVoiceApproveLast(),
    read_aloud: () => handleVoiceReadSelected(),
    voice_reply: () => handleVoiceReplySelected()
  }
});

const bootBadgeEl = document.querySelector("#mountBootBadge");
const bootRetryBtn = document.querySelector("#bootRetryBtn");
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
  uxRail?.updateCopilot?.(getCopilotSnapshot);
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
      bootProbeOffline = true;
      if (result.cooldownActive && result.retryAtMs) {
        const seconds = Math.max(1, Math.ceil((result.retryAtMs - Date.now()) / 1000));
        updateBootBadge(`BOOT OFFLINE · breaker ${seconds}s`, "offline");
      } else {
        updateBootBadge("BOOT OFFLINE · :7777 / :7778 (start supervisors)", "offline");
      }
      bootFsmState = "STANDBY";
      paintFsmWidgets();
      return;
    }
    bootProbeOffline = false;
    if (result.state) {
      bootFsmState = result.state;
      updateBootBadge(`FSM · ${result.label} :${result.port}`, "online");
      paintFsmWidgets();
      if (bootFsmState === "WAITING_CONFIRMATION" && prevBootFsmForGate !== "WAITING_CONFIRMATION") {
        pendingGate.open({
          message: "Supervisor requests explicit confirmation before ACTION."
        });
      }
      prevBootFsmForGate = bootFsmState;
    }
  }
});

function triggerBootRetry() {
  bootPoller.retryNow?.();
  updateBootBadge("BOOT RETRY · scanning supervisors…", "loading");
  toastRegion.push("Boot probe retried", "info");
}

bootRetryBtn?.addEventListener("click", () => {
  triggerBootRetry();
});

bootPoller.start();

const pendingGate = mountPendingActionModal(document.querySelector("#mountPendingModal"), {
  onResolve: (ev) => {
    if (ev?.action === "confirmed") {
      toastRegion.push("Risk gate cleared (demo acknowledge)", "info");
    }
  }
});

createMissionStateStream({
  pollMs: 3200,
  onPayload: (body) => {
    missionCopilotMeta = {
      preview: body.mission?.inputPreview || "",
      planStatus: body.mission?.planStatus || ""
    };
    const prevEffective = effectiveFsmState();
    missionFsmState = body.derivedFsm || "STANDBY";
    const nextEffective = effectiveFsmState();
    if (
      nextEffective === "WAITING_CONFIRMATION" &&
      prevEffective !== "WAITING_CONFIRMATION" &&
      bootFsmState === "STANDBY"
    ) {
      toastRegion.push("Mission plan awaits confirmation", "info");
    }
    paintFsmWidgets();
  }
}).start();

uxRail = mountPremiumUxRail({
  onboardingHost: document.querySelector("#mountFirstRunBanner"),
  copilotHost: document.querySelector("#mountContextCopilot"),
  onSpotlightTour: () => startSpotlightTour()
});
paintFsmWidgets();

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

approvalQueueCtl = mountApprovalQueue(document.querySelector("#mountApprovalQueue"), {
  pendingGate,
  toastRegion,
  onAction: (ev) => {
    if (ev.type === "approved") {
      toastRegion.push(`Approved: ${ev.action.title}`, "info");
    }
    if (ev.type === "always") {
      // could persist preference in future
    }
    unifiedInboxCtl?.refresh();
  }
});

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

unifiedInboxCtl = mountLiveUnifiedInbox(document.querySelector("#mountLiveUnifiedInbox"), {
  fetchWhatsAppMessages: async () => {
    const { messages } = await api("/api/whatsapp/messages");
    return messages || [];
  },
  getApprovalItems: () => approvalQueueCtl?.getItems?.() || [],
  fetchAuditEntries: async () => {
    const { entries } = await api("/api/audit");
    return entries || [];
  },
  fetchReminderJobs: async () => {
    const { jobs } = await api("/api/scheduler/jobs");
    return jobs || [];
  },
  fetchChannelFeeds: () => loadCollaborationChannelFeeds(),
  onReadAloud: (item) => {
    readInboxItemAloud(item);
  },
  onVoiceReply: (item) => {
    startVoiceReplyForItem(item);
  }
});

const graphRuntime = createGraphRuntime({
  graphCountsEl: graphCounts,
  graphFiltersEl: graphFilters,
  graphSearchEl: graphSearch,
  graphMatchCountEl: graphMatchCount,
  graphSvgEl: graphSvg,
  graphNodeDetailsEl: graphNodeDetails,
  graphZoomOutBtn: document.querySelector("#graphZoomOutBtn"),
  graphZoomInBtn: document.querySelector("#graphZoomInBtn"),
  graphResetBtn: document.querySelector("#graphResetBtn"),
  draftToInput: draftTo,
  draftBodyInput: draftBody,
  sendDraftIdInput: sendDraftId,
  sendTokenInput: sendToken
});

let shellNavigation = null;
let startSpotlightTour = () => {};

function scrollToSection(id) {
  shellNavigation?.scrollToSection(id);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function resolveScopedToken({ scope, targetId = "", inputEl }) {
  return resolveScopedTokenService({
    api,
    scope,
    targetId,
    inputEl
  });
}

async function triggerEmergencyStop(source = "ui_shortcut") {
  return triggerEmergencyStopService({
    api,
    pendingGate,
    approvalQueueCtl,
    voiceOrbApi,
    toastRegion,
    source
  });
}

async function clearEmergencyStop(source = "palette") {
  return clearEmergencyStopService({
    api,
    toastRegion,
    source
  });
}

function showJson(element, value) {
  element.textContent = JSON.stringify(value, null, 2);
}

async function apiOptional(path) {
  try {
    return await api(path);
  } catch {
    return null;
  }
}

async function loadCollaborationChannelFeeds() {
  return loadCollaborationFeeds({ apiOptional });
}

function getSelectedInboxItem() {
  const selected = unifiedInboxCtl?.getSelectedItem?.();
  if (selected) return selected;
  return unifiedInboxCtl?.getItems?.()?.[0] || null;
}

function readInboxItemAloud(item = getSelectedInboxItem()) {
  if (!item) return false;
  unifiedInboxCtl?.selectById?.(item.id);
  const phrase = unifiedInboxCtl?.describeItem?.(item) || `${item.title}. ${item.preview}`;
  const spoken = voiceOrbApi.speak(phrase);
  if (!spoken) toastRegion.push("Speech synthesis unavailable", "error");
  return spoken;
}

function applyVoiceReplyDraft(item, transcript) {
  const text = String(transcript || "").trim();
  if (!text) {
    toastRegion.push("No voice reply captured", "error");
    return;
  }
  if (item?.replyTo) draftTo.value = item.replyTo;
  draftBody.value = text;
  scrollToSection("section-ops");
  draftBody.focus();
  toastRegion.push("Voice reply drafted", "info");
}

function startVoiceReplyForItem(item = getSelectedInboxItem()) {
  if (!item) return false;
  unifiedInboxCtl?.selectById?.(item.id);
  if (item.replyTo) draftTo.value = item.replyTo;

  const target = item.replyTo || item.channelLabel || "selected item";
  const started = voiceOrbApi.startVoiceReply({
    prompt: `Voice reply for ${target}. Dictate now.`,
    onTranscript: (transcript) => applyVoiceReplyDraft(item, transcript)
  });
  if (!started) toastRegion.push("Speech recognition unavailable", "error");
  return started;
}

async function handleVoiceShowMessages() {
  await unifiedInboxCtl?.refresh();
  unifiedInboxCtl?.focus();
  return { spokenText: "Unified inbox refreshed." };
}

async function handleVoiceApproveLast() {
  if (!approvalQueueCtl?.approveLast) {
    return { spokenText: "Approval queue unavailable." };
  }

  const result = await approvalQueueCtl.approveLast({ source: "voice" });
  if (result?.ok) {
    await unifiedInboxCtl?.refresh();
    return { spokenText: `Approved ${result.action.title}` };
  }

  if (result?.reason === "gate_required") {
    approvalQueueCtl.focus?.();
    return { spokenText: "High risk action needs manual confirmation." };
  }

  return { spokenText: "No pending approvals." };
}

function handleVoiceReadSelected() {
  const item = getSelectedInboxItem();
  if (!item) return { spokenText: "Unified inbox is empty." };
  readInboxItemAloud(item);
  return { statusText: `Reading ${item.channelLabel}` };
}

function handleVoiceReplySelected() {
  const started = startVoiceReplyForItem();
  if (!started) return { statusText: "Voice reply unavailable" };
  return { statusText: "Voice reply armed" };
}

async function loadHealth() {
  try {
    const health = await api("/api/health");
    lastHealth = health;
    const sendStatus = health.whatsapp.realSendEnabled ? "WhatsApp send enabled" : "WhatsApp send disabled";
    const bridgeText = health.whatsappBridge?.ok ? "bridge online" : "bridge offline";
    const emergencyText = health.security?.emergency?.active ? "EMERGENCY STOP ACTIVE" : "emergency clear";
    statusLine.textContent = `${health.status}: ${health.tools.length} tools loaded. ${sendStatus}. ${bridgeText}. ${emergencyText}.`;
    schedulerStatus.textContent = `Loop enabled=${health.scheduler.enabled} interval=${health.scheduler.intervalMs}ms autoSend=false`;
    bridgeStatus.textContent = `${health.whatsappBridge?.status || "UNKNOWN"} ${health.whatsappBridge?.url || ""}`;
    tileToolsCtl.update();
    tileBridgeCtl.update();
    tileSchedCtl.update();
    paintFsmWidgets();
  } catch (e) {
    statusLine.textContent = `Operator unreachable · ${e.message}`;
    toastRegion.push(`Health check failed · ${e.message}`, "error");
    paintFsmWidgets();
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
      title: "Go · Unified inbox",
      group: "Navigation",
      keywords: "live inbox whatsapp approvals audit reminders obsidian ruflo hermes good mood",
      run: () => unifiedInboxCtl?.focus()
    },
    {
      title: "Refresh health",
      group: "Actions",
      keywords: "status operator",
      run: () => loadHealth().then(() => toastRegion.push("Health refreshed", "info"))
    },
    {
      title: "Retry · Boot FSM probe",
      group: "Actions",
      keywords: "boot breaker fsm retry supervisor",
      run: () => triggerBootRetry()
    },
    {
      title: "Emergency · Stop all actions",
      group: "Safety",
      keywords: "kill switch abort stop all cmd dot",
      run: () => triggerEmergencyStop("palette").catch((error) => toastRegion.push(error.message, "error"))
    },
    {
      title: "Emergency · Clear stop",
      group: "Safety",
      keywords: "resume clear unblock emergency",
      run: () => clearEmergencyStop("palette").catch((error) => toastRegion.push(error.message, "error"))
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
      title: "Refresh · Unified inbox",
      group: "Actions",
      keywords: "live feed sync",
      run: () => unifiedInboxCtl?.refresh().then(() => toastRegion.push("Unified inbox refreshed", "info"))
    },
    {
      title: "Voice · Start listening",
      group: "Voice",
      keywords: "orb microphone command",
      run: () => {
        const started = voiceOrbApi.startListening();
        if (!started) toastRegion.push("Speech recognition unavailable", "error");
      }
    },
    {
      title: "Voice · Read selected inbox item",
      group: "Voice",
      keywords: "read aloud speak selected",
      run: () => {
        const ok = readInboxItemAloud();
        if (!ok) toastRegion.push("No item available for read aloud", "error");
      }
    },
    {
      title: "Voice · Reply to selected item",
      group: "Voice",
      keywords: "dictate voice reply",
      run: () => {
        const started = startVoiceReplyForItem();
        if (!started) toastRegion.push("Voice reply unavailable", "error");
      }
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
    },
    {
      title: "Help · Spotlight workspace tour",
      group: "Help",
      keywords: "onboarding guide tour spotlight intro walkthrough",
      run: () => startSpotlightTour()
    },
    {
      title: "Focus · Approval queue",
      group: "Actions",
      keywords: "approve queue pending actions jarvis autonomous",
      run: () => {
        const q = document.querySelector("#mountApprovalQueue");
        q?.scrollIntoView({ behavior: "smooth", block: "center" });
        toastRegion.push("Approval queue focused", "info");
      }
    }
  ],
  onClose: () => {}
});

shellNavigation = createShellNavigation({
  navButtons: [...document.querySelectorAll(".nav-btn")],
  shortcutsOverlay: document.querySelector("#shortcutsOverlay"),
  shortcutsCloseBtn: document.querySelector("#shortcutsCloseBtn"),
  paletteCtl,
  operatorSettings,
  pendingGate,
  onEmergencyStop: (source) => triggerEmergencyStop(source),
  onError: (error) => {
    toastRegion.push(error?.message || String(error), "error");
  }
});

const interactiveGuideCtl = mountInteractiveGuide(document, {
  shellNavigate: (id) => scrollToSection(id)
});
startSpotlightTour = () => interactiveGuideCtl.startTour();

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
    const confirmToken = await resolveScopedToken({
      scope: "whatsapp.send",
      targetId: sendDraftId.value,
      inputEl: sendToken
    });
    const result = await api(`/api/whatsapp/drafts/${sendDraftId.value}/send`, {
      method: "POST",
      body: JSON.stringify({ confirmToken })
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
    const confirmToken = await resolveScopedToken({
      scope: "whatsapp.bridge.send",
      targetId: sendDraftId.value,
      inputEl: bridgeToken
    });
    const result = await api(`/api/bridge/whatsapp/drafts/${sendDraftId.value}/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmToken })
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
    const confirmToken = await resolveScopedToken({
      scope: "obsidian.sync",
      targetId: "",
      inputEl: obsidianToken
    });
    const result = await api("/api/obsidian/sync-summary", {
      method: "POST",
      body: JSON.stringify({ confirmToken })
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
    graphRuntime.setMap(result.map);
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

/** Predictive focus */
function predictiveFocus() {
  if (effectiveFsmState() === "WAITING_CONFIRMATION" && pendingGate.element?.open) {
    document.querySelector("#pendingPhraseInput")?.focus();
    return;
  }
  if (effectiveFsmState() === "STANDBY") {
    missionInput?.focus();
  }
}

await loadHealth();
await loadInbox();
await loadDrafts();
await loadJobs();
await auditCtl.refresh();
await unifiedInboxCtl?.refresh();

predictiveFocus();
