import { riskToLedIndex } from "./constants.js";

const RISK_TIERS = ["LOW", "MED", "HIGH", "CRIT"];

export const PREMIUM_CHANNEL_FEEDS = Object.freeze([
  {
    key: "obsidian",
    label: "Obsidian",
    endpoint: "/api/obsidian/feed",
    fallbackTitle: "Obsidian vault pulse",
    fallbackBody: "Local adapter online. Waiting for dedicated endpoint payload.",
    risk: "LOW"
  },
  {
    key: "ruflo",
    label: "Ruflo Agents",
    endpoint: "/api/ruflo/feed",
    fallbackTitle: "Ruflo swarm telemetry",
    fallbackBody:
      "Command Center always polls this feed. Enable JARVIS_ADAPTER_RUFLO_ENABLED and emit audit rows tagged ruflo / swarm / claude_flow.",
    risk: "MED"
  },
  {
    key: "hermes",
    label: "Hermes Agents",
    endpoint: "/api/hermes/feed",
    fallbackTitle: "Hermes dispatch stream",
    fallbackBody: "Task routing visible even without backend feed.",
    risk: "LOW"
  },
  {
    key: "good_mood",
    label: "GoodMood",
    endpoint: "/api/good-mood/feed",
    fallbackTitle: "GoodMood coaching",
    fallbackBody: "Mood channel available in local fallback mode.",
    risk: "LOW"
  }
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeRisk(value, fallback = "LOW") {
  const idx = riskToLedIndex(value || fallback);
  return RISK_TIERS[idx] || "LOW";
}

function toEpoch(value, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function relativeTime(epochMs, now = Date.now()) {
  const diffMs = Math.max(now - epochMs, 0);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}h ago`;
  const day = Math.floor(hour / 24);
  return `${day}d ago`;
}

function mapWhatsAppMessages(messages, now) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message, index) => {
    const ts = toEpoch(message.ts || message.timestamp || message.receivedAt, now - index * 1000);
    return {
      id: `whatsapp:${message.id || `${safeText(message.from, "anon")}:${index}`}`,
      source: "whatsapp",
      channelKey: "whatsapp",
      channelLabel: "WhatsApp",
      title: `${safeText(message.displayName || message.from, "Unknown sender")} · ${safeText(message.type, "message")}`,
      preview: safeText(message.body || message.text, "[non-text message]"),
      ts,
      risk: normalizeRisk("LOW"),
      replyTo: safeText(message.from, ""),
      meta: { ...message }
    };
  });
}

function mapApprovalItems(actions, now) {
  if (!Array.isArray(actions)) return [];
  return actions.map((actionItem, index) => {
    const ts = toEpoch(actionItem.ts, now - index * 1000);
    return {
      id: `approval:${actionItem.id || index}`,
      source: "approvals",
      channelKey: "approvals",
      channelLabel: "Approvals",
      title: safeText(actionItem.title, "Pending approval"),
      preview: safeText(actionItem.details, "Action waiting for confirmation."),
      ts,
      risk: normalizeRisk(actionItem.risk || "MED"),
      replyTo: "",
      meta: { ...actionItem }
    };
  });
}

function mapAuditEntries(entries, now) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry, index) => {
    const ts = toEpoch(entry.ts || entry.timestamp, now - index * 1000);
    return {
      id: `audit:${entry.id || `${entry.action || "event"}:${index}`}`,
      source: "audit",
      channelKey: "audit",
      channelLabel: "Audit",
      title: `${safeText(entry.action, "event")} · ${safeText(entry.status, "logged")}`,
      preview: `${safeText(entry.source, "operator")} · ${safeText(entry.risk, "LOW")}`,
      ts,
      risk: normalizeRisk(entry.risk || "LOW"),
      replyTo: "",
      meta: { ...entry }
    };
  });
}

function reminderRisk(job) {
  const status = safeText(job.status, "").toLowerCase();
  if (status.includes("failed") || status.includes("blocked")) return "HIGH";
  if (status.includes("pending")) return "MED";
  return "LOW";
}

function mapReminderJobs(jobs, now) {
  if (!Array.isArray(jobs)) return [];
  return jobs.map((job, index) => {
    const ts = toEpoch(job.runAt || job.ts, now - index * 1000);
    return {
      id: `reminder:${job.id || `${job.action || "job"}:${index}`}`,
      source: "reminders",
      channelKey: "reminders",
      channelLabel: "Reminders",
      title: `${safeText(job.action, "scheduled_job")} · ${safeText(job.status, "scheduled")}`,
      preview: `${safeText(job.targetId, "local")} · ${safeText(job.runAt, "next tick")}`,
      ts,
      risk: normalizeRisk(reminderRisk(job)),
      replyTo: "",
      meta: { ...job }
    };
  });
}

function mapCollaborationFeeds(channelFeeds, now) {
  const feedMap = channelFeeds && typeof channelFeeds === "object" ? channelFeeds : {};

  return PREMIUM_CHANNEL_FEEDS.flatMap((channel, channelIndex) => {
    const rows = Array.isArray(feedMap[channel.key]) ? feedMap[channel.key] : [];
    if (!rows.length) {
      return [
        {
          id: `channel:${channel.key}:fallback`,
          source: channel.key,
          channelKey: channel.key,
          channelLabel: channel.label,
          title: channel.fallbackTitle,
          preview: channel.fallbackBody,
          ts: now - channelIndex * 2500,
          risk: normalizeRisk(channel.risk),
          replyTo: "",
          meta: { isFallbackChannel: true, endpoint: channel.endpoint || "" }
        }
      ];
    }

    return rows.slice(0, 8).map((row, rowIndex) => {
      const event = typeof row === "string" ? { title: row } : row || {};
      const ts = toEpoch(event.ts || event.timestamp || event.updatedAt, now - (channelIndex + rowIndex) * 1200);
      return {
        id: `channel:${channel.key}:${event.id || rowIndex}`,
        source: channel.key,
        channelKey: channel.key,
        channelLabel: channel.label,
        title: safeText(event.title || event.action, channel.fallbackTitle),
        preview: safeText(event.preview || event.body || event.details, "Channel event"),
        ts,
        risk: normalizeRisk(event.risk || channel.risk),
        replyTo: safeText(event.replyTo || event.from, ""),
        meta: { ...event, endpoint: channel.endpoint || "" }
      };
    });
  });
}

function summarizeCounts(items) {
  const counts = { total: items.length, alerts: 0 };
  items.forEach((item) => {
    counts[item.source] = (counts[item.source] || 0) + 1;
    if (riskToLedIndex(item.risk) >= 2) counts.alerts += 1;
  });
  return counts;
}

export function describeUnifiedInboxItem(item) {
  if (!item) return "";
  return [item.channelLabel, item.title, item.preview]
    .filter(Boolean)
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function aggregateUnifiedInboxModel({
  whatsappMessages = [],
  approvalItems = [],
  auditEntries = [],
  reminderJobs = [],
  channelFeeds = {},
  now = Date.now()
} = {}) {
  const nowMs = toEpoch(now, Date.now());
  const items = [
    ...mapWhatsAppMessages(whatsappMessages, nowMs),
    ...mapApprovalItems(approvalItems, nowMs),
    ...mapAuditEntries(auditEntries, nowMs),
    ...mapReminderJobs(reminderJobs, nowMs),
    ...mapCollaborationFeeds(channelFeeds, nowMs)
  ].sort((left, right) => right.ts - left.ts);

  return {
    items,
    counts: summarizeCounts(items),
    badgeCount: items.length
  };
}

async function safeAsync(fn, fallback) {
  if (typeof fn !== "function") return fallback;
  try {
    const value = await fn();
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSync(fn, fallback) {
  if (typeof fn !== "function") return fallback;
  try {
    const value = fn();
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function mountLiveUnifiedInbox(container, options = {}) {
  const {
    fetchWhatsAppMessages = async () => [],
    getApprovalItems = () => [],
    fetchAuditEntries = async () => [],
    fetchReminderJobs = async () => [],
    fetchChannelFeeds = async () => ({}),
    pollMs = 9000,
    onReadAloud,
    onVoiceReply,
    onSelect
  } = options;

  let stopped = false;
  let timer = null;
  let state = {
    items: [],
    counts: { total: 0, alerts: 0 },
    selectedId: "",
    lastUpdatedMs: 0
  };

  container.innerHTML = `
    <details class="panel-section glass live-unified-inbox" open>
      <summary>
        Live unified inbox
        <span class="uix-badge" aria-live="polite">0</span>
        <span class="uix-alert">0 risk</span>
      </summary>
      <div class="panel-section-body">
        <div class="uix-toolbar">
          <span class="uix-live"><span class="live-dot" aria-hidden="true"></span>Live sync</span>
          <button type="button" class="btn-secondary btn-compact" data-uix-refresh>Refresh</button>
        </div>
        <p class="uix-status">Waiting for first sync...</p>
        <div class="uix-list" role="list"></div>
      </div>
    </details>
  `;

  const panel = container.querySelector(".live-unified-inbox");
  const badgeEl = container.querySelector(".uix-badge");
  const alertEl = container.querySelector(".uix-alert");
  const statusEl = container.querySelector(".uix-status");
  const listEl = container.querySelector(".uix-list");
  const refreshBtn = container.querySelector("[data-uix-refresh]");

  function selectedItem() {
    return state.items.find((item) => item.id === state.selectedId) || null;
  }

  function applySelection() {
    if (!state.selectedId || !state.items.some((item) => item.id === state.selectedId)) {
      state.selectedId = state.items[0]?.id || "";
    }
  }

  function render() {
    badgeEl.textContent = String(state.counts.total || 0);
    alertEl.textContent = `${state.counts.alerts || 0} risk`;
    listEl.replaceChildren();

    if (!state.items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state empty-state-compact";
      empty.innerHTML =
        '<span class="empty-icon" aria-hidden="true">∅</span><strong>No unified items.</strong><span class="empty-hint">Polling active. Waiting for events.</span>';
      listEl.append(empty);
      return;
    }

    state.items.slice(0, 40).forEach((item) => {
      const card = document.createElement("article");
      card.className = "uix-card";
      card.dataset.id = item.id;
      card.setAttribute("role", "listitem");
      card.tabIndex = 0;
      if (item.id === state.selectedId) card.classList.add("is-selected");

      const riskTier = RISK_TIERS[riskToLedIndex(item.risk)] || "LOW";
      card.innerHTML = `
        <div class="uix-card-head">
          <span class="uix-source">${escapeHtml(item.channelLabel)}</span>
          <time class="uix-time" datetime="${new Date(item.ts).toISOString()}">${escapeHtml(relativeTime(item.ts))}</time>
        </div>
        <strong class="uix-title">${escapeHtml(item.title)}</strong>
        <p class="uix-preview">${escapeHtml(item.preview)}</p>
        <div class="uix-meta">
          <span class="risk-led is-active" data-tier="${riskTier}"></span>
          <span>${escapeHtml(item.risk)}</span>
          ${item.meta?.isFallbackChannel ? '<span class="uix-fallback">adapter</span>' : ""}
        </div>
        <div class="uix-actions">
          <button type="button" class="btn-secondary btn-compact" data-uix-action="select">Select</button>
          <button type="button" class="btn-secondary btn-compact" data-uix-action="read">Read aloud</button>
          <button type="button" class="btn-secondary btn-compact" data-uix-action="reply">Voice reply</button>
        </div>
      `;

      listEl.append(card);
    });
  }

  function selectById(id, { announce = true } = {}) {
    if (!id || id === state.selectedId) return selectedItem();
    if (!state.items.some((item) => item.id === id)) return selectedItem();
    state.selectedId = id;
    render();
    const item = selectedItem();
    if (announce) onSelect?.(item);
    return item;
  }

  async function refresh({ announceSelection = false } = {}) {
    statusEl.textContent = "Syncing sources...";

    const [whatsappMessages, auditEntries, reminderJobs, channelFeeds] = await Promise.all([
      safeAsync(fetchWhatsAppMessages, []),
      safeAsync(fetchAuditEntries, []),
      safeAsync(fetchReminderJobs, []),
      safeAsync(fetchChannelFeeds, {})
    ]);
    const approvalItems = safeSync(getApprovalItems, []);

    const next = aggregateUnifiedInboxModel({
      whatsappMessages,
      approvalItems,
      auditEntries,
      reminderJobs,
      channelFeeds
    });

    state.items = next.items;
    state.counts = next.counts;
    state.lastUpdatedMs = Date.now();
    applySelection();
    render();
    statusEl.textContent = `Live · ${new Date(state.lastUpdatedMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;

    if (announceSelection && state.selectedId) {
      onSelect?.(selectedItem());
    }

    return state.items;
  }

  async function pollLoop() {
    if (stopped) return;
    await refresh();
    if (!stopped) timer = setTimeout(pollLoop, pollMs);
  }

  refreshBtn.addEventListener("click", () => {
    refresh({ announceSelection: true });
  });

  listEl.addEventListener("click", (event) => {
    const card = event.target.closest(".uix-card");
    if (!card) return;
    const action = event.target.closest("button[data-uix-action]")?.dataset.uixAction;
    const item = selectById(card.dataset.id, { announce: true }) || selectedItem();
    if (!item) return;

    if (!action || action === "select") return;
    if (action === "read") onReadAloud?.(item);
    if (action === "reply") onVoiceReply?.(item);
  });

  listEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".uix-card");
    if (!card) return;
    event.preventDefault();
    selectById(card.dataset.id, { announce: true });
  });

  pollLoop();

  return {
    refresh,
    focus() {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      const selected = [...listEl.querySelectorAll(".uix-card")].find((node) => node.dataset.id === state.selectedId);
      selected?.focus();
    },
    getItems() {
      return state.items.slice();
    },
    getInboxSyncMeta() {
      return { lastUpdatedMs: state.lastUpdatedMs, itemCount: state.items.length };
    },
    getSelectedItem() {
      return selectedItem();
    },
    selectById(id) {
      return selectById(id, { announce: true });
    },
    describeItem(item) {
      return describeUnifiedInboxItem(item);
    },
    readSelected() {
      const item = selectedItem() || state.items[0] || null;
      if (item) onReadAloud?.(item);
      return item;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    }
  };
}
