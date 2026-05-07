import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BrainCircuit,
  ChevronDown,
  CircleAlert,
  CheckCircle2,
  CircleStop,
  Clock3,
  Cpu,
  Database,
  Mic,
  MicOff,
  Radio,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Unplug,
  Volume2
} from "lucide-react";
import { createAudioReactiveMeter } from "./voice/audioReactive.js";
import {
  createJervisVoiceController,
  isSpeechRecognitionSupported,
  JERVIS_GREETING,
  VOICE_UNAVAILABLE_MESSAGE
} from "./voice/jervisVoice.js";
import "./styles.css";
import JervisBridgePanel from "./JervisBridgePanel.jsx";

const JervisDragonCore = lazy(() => import("./visuals/JervisDragonCore.jsx"));

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const JARVIS_ENV_TOKEN = import.meta.env.VITE_JARVIS_TOKEN || "";
const JARVIS_BROWSER_TOKEN_KEY = "jarvis.accessToken";
const JARVIS_CORE_MODE_KEY = "jarvis.coreMode";
const JARVIS_CORE_MODE_MANUAL_KEY = "jarvis.coreModeManual";
const emptyContactDraft = {
  name: "",
  phone_e164: "",
  aliases: "",
  notes: "",
  whatsapp_allowed: false
};

const stateCopy = {
  idle: "Standby",
  requesting: "Requesting mic",
  connecting: "Linking",
  live: "Online",
  muted: "Muted",
  reconnecting: "Recovering",
  error: "Attention",
  voice: "Voice wake"
};

const quickCommands = [
  { label: "Urgent", command: "What is urgent?", icon: <CircleAlert size={15} /> },
  { label: "Recall", command: "Where did we leave off?", icon: <Database size={15} /> },
  { label: "Plan", command: "Plan my next move", icon: <BrainCircuit size={15} /> },
  { label: "Risk", command: "Run risk check", icon: <ShieldCheck size={15} /> },
  { label: "Memory", command: "Recall memory", icon: <Clock3 size={15} /> },
  { label: "Mission", command: "Show mission", icon: <TerminalSquare size={15} /> }
];

const capabilityCards = [
  { icon: <Radio size={18} />, title: "Voice", text: "Realtime link status. No fake voice state.", command: "status" },
  { icon: <Clock3 size={18} />, title: "Urgent", text: "Due items and active alerts.", command: "what is urgent?" },
  { icon: <BrainCircuit size={18} />, title: "Mission", text: "Current objective and next move.", command: "show mission" },
  { icon: <Database size={18} />, title: "Memory", text: "Local recall and Obsidian bridge.", command: "where did we leave off?" },
  { icon: <TerminalSquare size={18} />, title: "Graphify", text: "Project graph bridge status.", command: "graphify status" },
  { icon: <ShieldCheck size={18} />, title: "Risk gates", text: "Draft, confirm, then execute.", command: "run risk check" }
];

function statusTone(value) {
  const clean = String(value || "").toLowerCase();
  if (
    /\b[1-9]\d*\s+active\b/.test(clean) ||
    clean.includes("blocked") ||
    clean.includes("failed") ||
    clean.includes("error") ||
    clean.includes("unavailable")
  ) {
    return "critical";
  }
  if (clean.includes("awaiting") || clean.includes("confirmation") || clean.includes("armed") || clean.includes("warning")) {
    return "warning";
  }
  if (clean.includes("ready") || clean.includes("done") || clean.includes("connected") || clean.includes("available")) {
    return "ready";
  }
  return "quiet";
}

function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function readNotifiedAlertKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem("jarvis.notifiedAlerts") || "[]"));
  } catch {
    return new Set();
  }
}

function writeNotifiedAlertKeys(keys) {
  try {
    localStorage.setItem("jarvis.notifiedAlerts", JSON.stringify([...keys].slice(-100)));
  } catch {
    // Best-effort dedupe. UI alerts remain the fallback.
  }
}

function readJarvisAccessToken() {
  if (JARVIS_ENV_TOKEN) return JARVIS_ENV_TOKEN;
  try {
    return localStorage.getItem(JARVIS_BROWSER_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function writeJarvisAccessToken(value) {
  const clean = String(value || "").trim();
  try {
    if (clean) {
      localStorage.setItem(JARVIS_BROWSER_TOKEN_KEY, clean);
    } else {
      localStorage.removeItem(JARVIS_BROWSER_TOKEN_KEY);
    }
  } catch {
    // API calls still fail safely if browser storage is unavailable.
  }
  return clean;
}

function shouldPreferLiteCore() {
  try {
    const mobileWidth = window.matchMedia?.("(max-width: 700px)")?.matches;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
    const lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    return Boolean(reducedMotion || mobileWidth || (coarsePointer && (lowMemory || lowCpu)));
  } catch {
    return false;
  }
}

function readCoreMode() {
  try {
    const stored = localStorage.getItem(JARVIS_CORE_MODE_KEY);
    if (stored === "lite" || stored === "3d") return stored;
  } catch {
    // Fall through to automatic default.
  }
  return shouldPreferLiteCore() ? "lite" : "3d";
}

function writeCoreMode(value, { manual = true } = {}) {
  const mode = value === "lite" ? "lite" : "3d";
  try {
    localStorage.setItem(JARVIS_CORE_MODE_KEY, mode);
    if (manual) {
      localStorage.setItem(JARVIS_CORE_MODE_MANUAL_KEY, "true");
    }
  } catch {
    // Visual preference only. Default 3D remains available.
  }
  return mode;
}

function hasManualCoreMode() {
  try {
    return localStorage.getItem(JARVIS_CORE_MODE_MANUAL_KEY) === "true";
  } catch {
    return true;
  }
}

async function queryBrowserPermission(name) {
  if (!navigator.permissions?.query) return "unknown";
  try {
    const permission = await navigator.permissions.query({ name });
    return permission.state;
  } catch {
    return "unknown";
  }
}

function nowStamp() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function initialTranscriptLine() {
  return {
    id: crypto.randomUUID(),
    role: "jarvis",
    text: "JERVIS Max Operator standby. Start voice link, then say: Jervis, what's our status?",
    time: nowStamp()
  };
}

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const accessToken = readJarvisAccessToken();
  if (accessToken) {
    headers.set("X-Jarvis-Key", accessToken);
  }
  return fetch(url, { ...options, headers });
}

function App() {
  const [accessTokenDraft, setAccessTokenDraft] = useState("");
  const [accessTokenReady, setAccessTokenReady] = useState(Boolean(readJarvisAccessToken()));
  const [status, setStatus] = useState("idle");
  const [commandState, setCommandState] = useState("standby");
  const [micEnabled, setMicEnabled] = useState(true);
  const [transcript, setTranscript] = useState([initialTranscriptLine()]);
  const [draft, setDraft] = useState("");
  const [mission, setMission] = useState("Operate as my maximum-capability assistant with confirmation gates.");
  const [config, setConfig] = useState({ model: "gpt-realtime-1.5", voice: "cedar", hasServerKey: false, tools: [] });
  const [systemStatus, setSystemStatus] = useState(null);
  const [audit, setAudit] = useState([]);
  const [cleanupReview, setCleanupReview] = useState({ count: 0, candidates: [] });
  const [learning, setLearning] = useState({ signals: [], brief: null });
  const [scheduleView, setScheduleView] = useState({ summary: null, items: [], next_actions: [] });
  const [alerts, setAlerts] = useState([]);
  const [localApps, setLocalApps] = useState({ apps: [], aliases: [], app_count: 0, alias_count: 0 });
  const [browserTabs, setBrowserTabs] = useState({
    tabs: [],
    tab_count: 0,
    match_count: 0,
    browser_count: 0,
    browsers: [],
    query: "",
    status: "checking",
    error: ""
  });
  const [browserTabQuery, setBrowserTabQuery] = useState("");
  const [browserTabLimit, setBrowserTabLimit] = useState(8);
  const [whatsappDrafts, setWhatsappDrafts] = useState([]);
  const [whatsappMessages, setWhatsappMessages] = useState({ messages: [], count: 0 });
  const [whatsappExecutor, setWhatsappExecutor] = useState(null);
  const [whatsappLivePhrase, setWhatsappLivePhrase] = useState("");
  const [whatsappModeBusy, setWhatsappModeBusy] = useState(false);
  const [elevenLabsText, setElevenLabsText] = useState("Good morning, sir. JERVIS voice bridge is standing by.");
  const [elevenLabsBusy, setElevenLabsBusy] = useState(false);
  const [contacts, setContacts] = useState({ contacts: [], count: 0, allowed: 0 });
  const [contactDraft, setContactDraft] = useState(emptyContactDraft);
  const [contactBusyId, setContactBusyId] = useState("");
  const [contactDeleteConfirmId, setContactDeleteConfirmId] = useState("");
  const [aliasDraft, setAliasDraft] = useState("");
  const [aliasAppDraft, setAliasAppDraft] = useState("");
  const [editingAliasId, setEditingAliasId] = useState("");
  const [aliasDeleteConfirmId, setAliasDeleteConfirmId] = useState("");
  const [aliasBusyKey, setAliasBusyKey] = useState("");
  const [aliasConflict, setAliasConflict] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission);
  const [microphonePermission, setMicrophonePermission] = useState("unknown");
  const [editingAlertId, setEditingAlertId] = useState("");
  const [alertRescheduleText, setAlertRescheduleText] = useState("");
  const [alertBusyId, setAlertBusyId] = useState("");
  const [pendingActions, setPendingActions] = useState([]);
  const [activePendingAction, setActivePendingAction] = useState(null);
  const [error, setError] = useState("");
  const [signal, setSignal] = useState("offline");
  const [memory, setMemory] = useState([]);
  const [toolLog, setToolLog] = useState([
    { id: crypto.randomUUID(), name: "console", status: "ready", detail: "Tool bridge armed", time: nowStamp() }
  ]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeOpsTab, setActiveOpsTab] = useState("tools");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [voiceState, setVoiceState] = useState("standby");
  const [voiceWakeTranscript, setVoiceWakeTranscript] = useState("");
  const [voiceCommandTranscript, setVoiceCommandTranscript] = useState("");
  const [voiceResponse, setVoiceResponse] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [voiceSpeakingLevel, setVoiceSpeakingLevel] = useState(0);
  const [coreMode, setCoreMode] = useState(readCoreMode);
  const [coreModeAuto, setCoreModeAuto] = useState(() => !hasManualCoreMode());

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const streamRef = useRef(null);
  const reconnectTimer = useRef(null);
  const partialAssistantRef = useRef("");
  const partialUserRef = useRef("");
  const handledToolCallsRef = useRef(new Set());
  const notifiedAlertKeysRef = useRef(readNotifiedAlertKeys());
  const browserTabFilterRef = useRef({ query: "", limit: 8 });
  const browserTabQueryRef = useRef("");
  const voiceControllerRef = useRef(null);
  const audioMeterRef = useRef(null);
  const speakingMeterRef = useRef(null);

  const isLive = status === "live" || status === "muted";
  const isVoiceActive = ["standbyListeningForWake", "listening", "thinking", "speaking", "blocked", "done"].includes(voiceState);

  const visualState = useMemo(() => {
    if (voiceState === "unavailable") return "blocked";
    if (voiceState === "listening") return "listening";
    if (voiceState === "thinking") return "thinking";
    if (voiceState === "speaking") return "speaking";
    if (voiceState === "blocked") return "blocked";
    if (voiceState === "done") return "done";
    if (error || status === "error" || commandState === "error") return "blocked";
    if (activePendingAction || commandState === "blocked") return "blocked";
    if (commandState === "done") return "done";
    if (["confirming", "cancelling", "acknowledging", "snooze", "reschedule"].includes(commandState)) return "executing";
    if (commandState === "thinking" || signal === "thinking") return "thinking";
    if (isLive && micEnabled) return "listening";
    return "standby";
  }, [activePendingAction, commandState, error, isLive, micEnabled, signal, status, voiceState]);

  const visualLabel = {
    standby: "Standby",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    executing: "Executing",
    blocked: "Blocked",
    done: "Done"
  }[visualState];

  const latestTool = toolLog[0];
  const latestUserLine = [...transcript].reverse().find((item) => item.role === "you");
  const awaitingCount = pendingActions.filter((item) => item.status === "awaiting_confirmation").length;
  const browserTabsBlocked = browserTabs.status === "blocked" || systemStatus?.local_control?.browser_tabs_status === "blocked";
  const prioritizedBrowserTabs = useMemo(() => (
    [...browserTabs.tabs].sort((left, right) => {
      const leftLocal = /localhost|127\.0\.0\.1/.test(String(left.url || ""));
      const rightLocal = /localhost|127\.0\.0\.1/.test(String(right.url || ""));
      if (leftLocal !== rightLocal) return leftLocal ? -1 : 1;
      if (Boolean(left.active) !== Boolean(right.active)) return left.active ? -1 : 1;
      return String(left.title || left.url || left.id).localeCompare(String(right.title || right.url || right.id));
    })
  ), [browserTabs.tabs]);
  const responseBrief = {
    intent: latestUserLine?.text || mission,
    action: latestTool?.detail || "Standing by. No tool action proposed.",
    confirmation: activePendingAction
      ? "Confirmation required now"
      : awaitingCount
        ? `${awaitingCount} gated actions waiting`
        : "No confirmation required",
    log: latestTool ? `${latestTool.name}: ${latestTool.status}` : "No tool activity yet"
  };
  const lastWhatsappInbound = whatsappMessages.messages.find((item) => item.direction === "inbound");
  const lastWhatsappOutbound = whatsappMessages.messages.find((item) => item.direction === "outbound");
  const failedWhatsappSends = whatsappMessages.messages.filter((item) => item.direction === "outbound" && ["failed", "error"].includes(item.status)).length;

  useEffect(() => {
    refreshConfig();
    refreshStatus();
    refreshMemory();
    refreshAudit();
    refreshCleanupReview();
    refreshLearning();
    refreshSchedule();
    refreshAlerts();
    refreshLocalApps();
    refreshBrowserTabs();
    refreshWhatsappDrafts();
    refreshContacts();
    refreshPendingActions();
    refreshPermissionState();
    const pollTimer = setInterval(() => {
      refreshStatus();
      refreshSchedule();
      refreshAlerts();
      refreshBrowserTabs();
      refreshContacts();
      refreshPermissionState();
    }, 30_000);

    return () => {
      clearInterval(pollTimer);
      clearTimeout(reconnectTimer.current);
      clearInterval(speakingMeterRef.current);
      voiceControllerRef.current?.stop();
      audioMeterRef.current?.stop();
      cleanupSession();
    };
  }, []);

  useEffect(() => {
    if (hasManualCoreMode()) {
      setCoreModeAuto(false);
      return undefined;
    }

    const media = window.matchMedia?.("(max-width: 700px)");
    const syncAutoCoreMode = () => {
      const nextMode = shouldPreferLiteCore() ? "lite" : "3d";
      setCoreMode(writeCoreMode(nextMode, { manual: false }));
      setCoreModeAuto(true);
    };

    syncAutoCoreMode();
    media?.addEventListener?.("change", syncAutoCoreMode);
    return () => media?.removeEventListener?.("change", syncAutoCoreMode);
  }, []);

  useEffect(() => {
    if (notificationPermission !== "granted") return;
    alerts.forEach((item) => {
      const notifyKey = item.key || item.id;
      if (!notifyKey || notifiedAlertKeysRef.current.has(notifyKey)) return;

      const notification = new Notification(`JERVIS: ${alertBadge(item.kind)}`, {
        body: item.message,
        tag: `jarvis-${notifyKey}`,
        requireInteraction: item.severity === "critical"
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      notifiedAlertKeysRef.current.add(notifyKey);
    });
    writeNotifiedAlertKeys(notifiedAlertKeysRef.current);
  }, [alerts, notificationPermission]);

  const roomTone = useMemo(() => {
    if (voiceState === "standbyListeningForWake") return "Wake layer armed. Say Hey JERVIS.";
    if (voiceState === "listening") return "Listening. Give the mission.";
    if (voiceState === "thinking") return "Processing command through risk gates.";
    if (voiceState === "speaking") return "JERVIS response channel active.";
    if (voiceState === "blocked" || voiceState === "unavailable") return "Voice channel needs operator attention.";
    if (status === "live") return "JERVIS online. Awaiting mission input.";
    if (status === "muted") return "JERVIS online. Microphone channel paused.";
    if (status === "connecting") return "Establishing realtime voice link.";
    if (status === "reconnecting") return "Recovering the voice link.";
    if (status === "error") return "Connection needs operator attention.";
    return "Max Operator console with mandatory Obsidian and Graphify.";
  }, [status, voiceState]);

  async function refreshConfig() {
    try {
      const response = await apiFetch("/api/config");
      setConfig(await response.json());
    } catch {
      setConfig((current) => ({ ...current, hasServerKey: false }));
    }
  }

  async function refreshStatus() {
    try {
      const response = await apiFetch("/api/jarvis/status");
      setSystemStatus(await response.json());
    } catch {
      setSystemStatus(null);
    }
  }

  async function refreshMemory() {
    try {
      const response = await apiFetch("/api/jarvis/memory");
      const payload = await response.json();
      setMemory(Array.isArray(payload.notes) ? payload.notes.slice(-6).reverse() : []);
    } catch {
      setMemory([]);
    }
  }

  async function refreshAudit() {
    try {
      const response = await apiFetch("/api/jarvis/audit?limit=8");
      const payload = await response.json();
      setAudit(Array.isArray(payload.events) ? payload.events : []);
    } catch {
      setAudit([]);
    }
  }

  async function refreshCleanupReview() {
    try {
      const response = await apiFetch("/api/jarvis/cleanup-candidates");
      const payload = await response.json();
      setCleanupReview({
        count: Number(payload.count) || 0,
        candidates: Array.isArray(payload.candidates) ? payload.candidates : []
      });
    } catch {
      setCleanupReview({ count: 0, candidates: [] });
    }
  }

  async function refreshLearning() {
    try {
      const response = await apiFetch("/api/jarvis/learning?limit=8");
      const payload = await response.json();
      setLearning({
        signals: Array.isArray(payload.signals) ? payload.signals : [],
        brief: payload.brief?.ok ? payload.brief : null
      });
    } catch {
      setLearning({ signals: [], brief: null });
    }
  }

  async function refreshSchedule() {
    try {
      const response = await apiFetch("/api/jarvis/schedule?limit=8");
      const payload = await response.json();
      setScheduleView({
        summary: payload.ok ? payload.summary : null,
        items: Array.isArray(payload.items) ? payload.items : [],
        next_actions: Array.isArray(payload.next_actions) ? payload.next_actions : []
      });
    } catch {
      setScheduleView({ summary: null, items: [], next_actions: [] });
    }
  }

  async function refreshAlerts() {
    try {
      const response = await apiFetch("/api/jarvis/alerts?status=active&limit=8");
      const payload = await response.json();
      setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
    } catch {
      setAlerts([]);
    }
  }

  async function refreshLocalApps() {
    try {
      const response = await apiFetch("/api/jarvis/apps?limit=10");
      const payload = await response.json();
      setLocalApps({
        apps: Array.isArray(payload.apps) ? payload.apps : [],
        aliases: Array.isArray(payload.aliases) ? payload.aliases : [],
        app_count: Number(payload.app_count) || 0,
        alias_count: Number(payload.alias_count) || 0
      });
    } catch {
      setLocalApps({ apps: [], aliases: [], app_count: 0, alias_count: 0 });
    }
  }

  async function refreshBrowserTabs(options = {}) {
    const query = String(options.query ?? browserTabFilterRef.current.query ?? "").trim();
    const limit = Math.max(1, Math.min(Number(options.limit ?? browserTabFilterRef.current.limit) || 8, 40));
    browserTabFilterRef.current = { query, limit };
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (query) params.set("query", query);
      if (options.refresh) params.set("refresh", "1");
      const response = await apiFetch(`/api/jarvis/browser-tabs?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        setBrowserTabs({
          tabs: [],
          tab_count: 0,
          match_count: 0,
          browser_count: 0,
          browsers: [],
          query,
          status: "blocked",
          error: payload.error || "Browser-tab automation is blocked."
        });
        return { ok: false, error: payload.error || "Browser-tab automation is blocked." };
      }
      setBrowserTabs({
        tabs: Array.isArray(payload.tabs) ? payload.tabs : [],
        tab_count: Number(payload.tab_count) || 0,
        match_count: Number(payload.match_count) || 0,
        browser_count: Number(payload.browser_count) || 0,
        browsers: Array.isArray(payload.browsers) ? payload.browsers : [],
        query: String(payload.query || query),
        status: "ready",
        error: ""
      });
      const appliedQuery = String(payload.query || query);
      browserTabFilterRef.current = { query: appliedQuery, limit };
      setBrowserTabQueryValue(appliedQuery);
      return { ok: true, payload };
    } catch {
      setBrowserTabs({
        tabs: [],
        tab_count: 0,
        match_count: 0,
        browser_count: 0,
        browsers: [],
        query,
        status: "blocked",
        error: "Browser-tab automation is blocked or unavailable right now."
      });
      return { ok: false, error: "Browser-tab automation is blocked or unavailable right now." };
    }
  }

  async function refreshWhatsappDrafts() {
    try {
      const response = await apiFetch("/api/jarvis/whatsapp-drafts?limit=6");
      const payload = await response.json();
      setWhatsappDrafts(Array.isArray(payload.drafts) ? payload.drafts : []);
      setWhatsappExecutor(payload.executor || null);
    } catch {
      setWhatsappDrafts([]);
      setWhatsappExecutor(null);
    }

    try {
      const response = await apiFetch("/api/jarvis/whatsapp-messages?limit=8");
      const payload = await response.json();
      setWhatsappMessages({
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        count: Number(payload.count) || 0
      });
      if (payload.executor) setWhatsappExecutor(payload.executor);
    } catch {
      setWhatsappMessages({ messages: [], count: 0 });
    }
  }

  async function refreshContacts() {
    try {
      const response = await apiFetch("/api/jarvis/contacts?limit=8");
      const payload = await response.json();
      setContacts({
        contacts: Array.isArray(payload.contacts) ? payload.contacts : [],
        count: Number(payload.count) || 0,
        allowed: Number(payload.allowed) || 0
      });
    } catch {
      setContacts({ contacts: [], count: 0, allowed: 0 });
    }
  }

  async function setWhatsappMode(dryRun) {
    setWhatsappModeBusy(true);
    try {
      const response = await apiFetch("/api/jarvis/whatsapp-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dry_run: dryRun,
          confirmation_phrase: dryRun ? "" : whatsappLivePhrase
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "WhatsApp mode update failed.");
      }

      setWhatsappExecutor(payload.executor || null);
      if (!dryRun) setWhatsappLivePhrase("");
      addToolLog("whatsapp", payload.executor?.mode || "mode", payload.message);
      addLine("jarvis", payload.message);
      refreshStatus();
      refreshWhatsappDrafts();
      refreshAudit();
      return true;
    } catch (modeError) {
      const message = modeError instanceof Error ? modeError.message : "WhatsApp mode update failed.";
      setError(message);
      addToolLog("whatsapp", "failed", message);
      addLine("jarvis", `WhatsApp mode update failed: ${message}`);
      return false;
    } finally {
      setWhatsappModeBusy(false);
    }
  }

  async function playElevenLabsPreview() {
    const text = elevenLabsText.trim();
    if (!text) {
      setError("ElevenLabs preview needs text.");
      return false;
    }

    setElevenLabsBusy(true);
    try {
      const response = await apiFetch("/api/jarvis/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = [payload.error, payload.code, payload.recovery].filter(Boolean).join(" ");
        throw new Error(detail || "ElevenLabs preview failed.");
      }
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const preview = new Audio(audioUrl);
      preview.onended = () => URL.revokeObjectURL(audioUrl);
      preview.onerror = () => URL.revokeObjectURL(audioUrl);
      await preview.play();
      addToolLog("elevenlabs", "done", "Audio preview played.");
      addLine("jarvis", "ElevenLabs audio preview generated.");
      refreshStatus();
      refreshAudit();
      return true;
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "ElevenLabs preview failed.";
      setError(message);
      addToolLog("elevenlabs", "failed", message);
      addLine("jarvis", `ElevenLabs preview failed: ${message}`);
      return false;
    } finally {
      setElevenLabsBusy(false);
    }
  }

  async function playElevenLabsVoiceTest() {
    const text = "JARVIS online. ElevenLabs voice is active.";
    setElevenLabsBusy(true);
    setVoiceError("");
    setVoiceResponse(text);
    setVoiceState("speaking");
    startSpeakingMeter();

    try {
      const response = await apiFetch("/api/jarvis/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = [payload.error, payload.code, payload.recovery].filter(Boolean).join(" ");
        throw new Error(detail || "ElevenLabs voice test failed.");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      await new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        audio.onended = resolve;
        audio.onerror = () => reject(new Error("ElevenLabs audio playback failed."));
        audio.play().catch(reject);
      }).finally(() => URL.revokeObjectURL(audioUrl));

      addToolLog("elevenlabs", "done", "Primary JARVIS voice played through ElevenLabs.");
      addLine("jarvis", "ElevenLabs voice test played.");
      refreshStatus();
      refreshAudit();
      setVoiceState("done");
      return true;
    } catch (voiceTestError) {
      const message = voiceTestError instanceof Error ? voiceTestError.message : "ElevenLabs voice test failed.";
      setVoiceError(message);
      setVoiceState("blocked");
      setError(message);
      addToolLog("elevenlabs", "failed", message);
      addLine("jarvis", `ElevenLabs voice test failed: ${message}`);
      return false;
    } finally {
      stopSpeakingMeter();
      setElevenLabsBusy(false);
    }
  }

  function updateContactDraft(field, value) {
    setContactDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveContact(event) {
    event.preventDefault();
    setContactBusyId("new");
    try {
      const response = await apiFetch("/api/jarvis/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactDraft)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Contact save failed.");
      }

      addToolLog("contacts", "done", payload.message);
      addLine("jarvis", payload.message);
      setContactDraft(emptyContactDraft);
      refreshContacts();
      refreshStatus();
      refreshWhatsappDrafts();
      refreshAudit();
      return true;
    } catch (contactError) {
      const message = contactError instanceof Error ? contactError.message : "Contact save failed.";
      setError(message);
      addToolLog("contacts", "failed", message);
      addLine("jarvis", `Contact save failed: ${message}`);
      return false;
    } finally {
      setContactBusyId("");
    }
  }

  async function updateContactAllowlist(item, allowed) {
    setContactBusyId(item.id);
    try {
      const response = await apiFetch(`/api/jarvis/contacts/${item.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_allowed: allowed })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Contact update failed.");
      }

      addToolLog("contacts", "done", payload.message);
      addLine("jarvis", payload.message);
      refreshContacts();
      refreshStatus();
      refreshWhatsappDrafts();
      refreshAudit();
      return true;
    } catch (contactError) {
      const message = contactError instanceof Error ? contactError.message : "Contact update failed.";
      setError(message);
      addToolLog("contacts", "failed", message);
      addLine("jarvis", `Contact update failed: ${message}`);
      return false;
    } finally {
      setContactBusyId("");
    }
  }

  async function deleteContact(item) {
    setContactBusyId(item.id);
    try {
      const response = await apiFetch(`/api/jarvis/contacts/${item.id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Contact delete failed.");
      }

      addToolLog("contacts", "done", payload.message);
      addLine("jarvis", payload.message);
      setContactDeleteConfirmId("");
      refreshContacts();
      refreshStatus();
      refreshWhatsappDrafts();
      refreshAudit();
      return true;
    } catch (contactError) {
      const message = contactError instanceof Error ? contactError.message : "Contact delete failed.";
      setError(message);
      addToolLog("contacts", "failed", message);
      addLine("jarvis", `Contact delete failed: ${message}`);
      return false;
    } finally {
      setContactBusyId("");
    }
  }

  async function requestBrowserNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      addLine("jarvis", "Browser notifications are not supported here. UI alerts remain active.");
      return;
    }

    if (Notification.permission === "granted") {
      setNotificationPermission("granted");
      addLine("jarvis", "Browser alerts are already enabled.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    addLine(
      "jarvis",
      permission === "granted"
        ? "Browser alerts enabled. Due reminders will trigger notifications."
        : "Browser alerts were not enabled. UI alerts remain active."
    );
  }

  async function refreshPermissionState() {
    setNotificationPermission(getNotificationPermission());
    setMicrophonePermission(await queryBrowserPermission("microphone"));
  }

  function testBrowserNotification() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      addLine("jarvis", "Browser notifications are not supported here. UI alerts remain active.");
      return;
    }

    if (Notification.permission !== "granted") {
      setNotificationPermission(Notification.permission);
      addLine("jarvis", "Browser alerts are not enabled yet. Click Enable browser alerts and approve the browser prompt first.");
      return;
    }

    const notification = new Notification("JARVIS test alert", {
      body: "Browser notification channel is working.",
      tag: "jarvis-test-alert"
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    addLine("jarvis", "Browser notification test fired.");
  }

  async function testMicrophoneAccess() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophonePermission("unsupported");
      addLine("jarvis", "Microphone API is not available in this browser context.");
      return;
    }

    setCommandState("testing_mic");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicrophonePermission("granted");
      setCommandState("done");
      addLine("jarvis", "Microphone permission test passed. Voice session can be retried.");
    } catch (micError) {
      const message = micError instanceof Error ? micError.message : "Microphone test failed.";
      setMicrophonePermission(await queryBrowserPermission("microphone"));
      setCommandState("error");
      setError(message);
      addLine("jarvis", `Microphone test failed: ${message}`);
    }
  }

  async function refreshPendingActions() {
    try {
      const response = await apiFetch("/api/jarvis/pending-actions?limit=8");
      const payload = await response.json();
      setPendingActions(Array.isArray(payload.actions) ? payload.actions : []);
    } catch {
      setPendingActions([]);
    }
  }

  function addLine(role, text) {
    const clean = String(text || "").trim();
    if (!clean) return;
    setTranscript((items) => [
      ...items.slice(-60),
      {
        id: crypto.randomUUID(),
        role,
        text: clean,
        time: nowStamp()
      }
    ]);
  }

  function addToolLog(name, statusText, detail) {
    setToolLog((items) => [
      {
        id: crypto.randomUUID(),
        name,
        status: statusText,
        detail,
        time: nowStamp()
      },
      ...items
    ].slice(0, 8));
  }

  function saveAccessToken() {
    const clean = writeJarvisAccessToken(accessTokenDraft);
    setAccessTokenReady(Boolean(readJarvisAccessToken()));
    setAccessTokenDraft("");
    addToolLog("access", clean ? "ready" : "missing", clean ? "Browser access key saved locally." : "Browser access key cleared.");
  }

  function clearAccessToken() {
    writeJarvisAccessToken("");
    setAccessTokenReady(Boolean(readJarvisAccessToken()));
    setAccessTokenDraft("");
    addToolLog("access", JARVIS_ENV_TOKEN ? "env_locked" : "missing", JARVIS_ENV_TOKEN ? "Using build-time access key." : "Browser access key cleared.");
  }

  function applyCommandResult(payload) {
    if (payload?.tool === "get_schedule_overview" && payload.result?.ok) {
      setScheduleView({
        summary: payload.result.summary || null,
        items: Array.isArray(payload.result.items) ? payload.result.items : [],
        next_actions: Array.isArray(payload.result.next_actions) ? payload.result.next_actions : []
      });
    }
    if (payload?.tool === "get_operational_brief" && payload.result?.ok) {
      setLearning((current) => ({ ...current, brief: payload.result }));
    }
    if (payload?.tool === "record_learning_signal") {
      refreshLearning();
    }
    if (payload?.tool === "list_local_apps" && payload.result?.ok) {
      setLocalApps({
        apps: Array.isArray(payload.result.apps) ? payload.result.apps : [],
        aliases: Array.isArray(payload.result.aliases) ? payload.result.aliases : [],
        app_count: Number(payload.result.app_count) || 0,
        alias_count: Number(payload.result.alias_count) || 0
      });
    }
    if (payload?.tool === "list_browser_tabs" && payload.result?.ok) {
      const nextQuery = String(payload.result.query || "");
      browserTabFilterRef.current = { query: nextQuery, limit: browserTabFilterRef.current.limit };
      setBrowserTabs({
        tabs: Array.isArray(payload.result.tabs) ? payload.result.tabs : [],
        tab_count: Number(payload.result.tab_count) || 0,
        match_count: Number(payload.result.match_count) || 0,
        browser_count: Number(payload.result.browser_count) || 0,
        browsers: Array.isArray(payload.result.browsers) ? payload.result.browsers : [],
        query: nextQuery,
        status: "ready",
        error: ""
      });
      setBrowserTabQueryValue(nextQuery);
    }
    if (["open_browser_tab", "focus_browser_tab", "close_browser_tab"].includes(payload?.tool)) {
      refreshBrowserTabs();
    }
    if (payload?.tool === "remember_app_alias" || payload?.tool === "delete_app_alias") {
      refreshLocalApps();
    }
  }

  function resetAliasEditor() {
    setAliasDraft("");
    setAliasAppDraft("");
    setEditingAliasId("");
    setAliasConflict(null);
  }

  function setBrowserTabQueryValue(value) {
    browserTabQueryRef.current = value;
    setBrowserTabQuery(value);
  }

  async function submitBrowserTabSearch() {
    const nextQuery = browserTabQueryRef.current.trim();
    setBrowserTabLimit(8);
    browserTabFilterRef.current = { query: nextQuery, limit: 8 };
    const result = await refreshBrowserTabs({ query: nextQuery, limit: 8, refresh: true });
    addToolLog(
      "browser_tabs",
      result?.ok ? "filtered" : "failed",
      result?.ok
        ? nextQuery
          ? `Browser tab filter: ${nextQuery}`
          : "Browser tab filter cleared"
        : result?.error || "Browser tab filter failed"
    );
  }

  async function clearBrowserTabSearch() {
    setBrowserTabQueryValue("");
    setBrowserTabLimit(8);
    browserTabFilterRef.current = { query: "", limit: 8 };
    const result = await refreshBrowserTabs({ query: "", limit: 8, refresh: true });
    addToolLog("browser_tabs", result?.ok ? "ready" : "failed", result?.ok ? "Browser tab filter cleared" : result?.error || "Browser tab refresh failed");
  }

  async function showMoreBrowserTabs() {
    const nextLimit = Math.min(browserTabLimit + 8, 40);
    setBrowserTabLimit(nextLimit);
    browserTabFilterRef.current = { query: browserTabs.query || "", limit: nextLimit };
    const result = await refreshBrowserTabs({ query: browserTabs.query || "", limit: nextLimit, refresh: true });
    if (!result?.ok) {
      addToolLog("browser_tabs", "failed", result?.error || "Could not load more browser tabs");
    }
  }

  function beginAliasEdit(item = null, nextAppName = "") {
    setEditingAliasId(item?.id || "new");
    setAliasDraft(item?.alias || "");
    setAliasAppDraft(nextAppName || item?.app_name || "");
    setAliasDeleteConfirmId("");
    setAliasConflict(null);
  }

  function cleanupSession() {
    dcRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    handledToolCallsRef.current.clear();
    setSignal("offline");
  }

  async function startSession({ recovering = false } = {}) {
    clearTimeout(reconnectTimer.current);
    setError("");
    setStatus(recovering ? "reconnecting" : "requesting");
    cleanupSession();

    try {
      const tokenResponse = await apiFetch("/api/realtime-token", { method: "POST" });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(tokenPayload.error || "Could not mint a Realtime session token.");
      }

      const ephemeralKey = tokenPayload.value || tokenPayload.client_secret?.value;
      if (!ephemeralKey) {
        throw new Error("The token response did not include a client secret value.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      setStatus("connecting");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const remoteAudio = audioRef.current || document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      audioRef.current = remoteAudio;

      pc.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => {
          setError("Browser blocked autoplay. Tap the page, then reconnect.");
        });
      };

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      wireDataChannel(dc);

      pc.onconnectionstatechange = () => {
        setSignal(pc.connectionState);
        if (["failed", "disconnected"].includes(pc.connectionState)) {
          setStatus("reconnecting");
          reconnectTimer.current = setTimeout(() => startSession({ recovering: true }), 1400);
        }
        if (pc.connectionState === "connected") {
          setStatus(micEnabled ? "live" : "muted");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(OPENAI_REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp"
        }
      });

      const answerSdp = await sdpResponse.text();
      if (!sdpResponse.ok) {
        throw new Error(answerSdp || "Realtime SDP exchange failed.");
      }

      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (sessionError) {
      cleanupSession();
      setStatus("error");
      setError(sessionError instanceof Error ? sessionError.message : "Could not start JERVIS.");
    }
  }

  function wireDataChannel(dc) {
    dc.addEventListener("open", () => {
      setSignal("data open");
      addLine("jarvis", "Voice link open. Say 'Jervis' and give me an objective.");
      addToolLog("voice_link", "online", "Realtime data channel opened");
    });

    dc.addEventListener("message", (event) => {
      try {
        handleRealtimeEvent(JSON.parse(event.data));
      } catch {
        addToolLog("event", "ignored", "Received non-JSON data channel payload");
      }
    });

    dc.addEventListener("close", () => setSignal("data closed"));
    dc.addEventListener("error", () => setSignal("data error"));
  }

  async function executeToolCall(call) {
    if (!call?.call_id || handledToolCallsRef.current.has(call.call_id)) return;
    handledToolCallsRef.current.add(call.call_id);

    const args = parseToolArgs(call.arguments);
    addToolLog(call.name, "running", JSON.stringify(args));

    try {
      const response = await apiFetch("/api/jarvis/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: call.name, arguments: args })
      });
      const result = await response.json();
      addToolLog(call.name, result.ok ? "done" : "failed", result.ok ? "Result returned to model" : result.error);
      if (call.name === "remember_note") refreshMemory();
      if (call.name === "create_local_reminder") refreshSchedule();
      if (call.name === "record_learning_signal") refreshLearning();
      if (["list_browser_tabs", "open_browser_tab", "focus_browser_tab", "close_browser_tab"].includes(call.name)) refreshBrowserTabs();
      if (["list_local_apps", "remember_app_alias", "delete_app_alias"].includes(call.name)) refreshLocalApps();
      if (call.name === "get_schedule_overview" && result.ok) {
        setScheduleView({
          summary: result.summary || null,
          items: Array.isArray(result.items) ? result.items : [],
          next_actions: Array.isArray(result.next_actions) ? result.next_actions : []
        });
      }
      if (call.name === "get_operational_brief" && result.ok) {
        setLearning((current) => ({ ...current, brief: result }));
      }
      refreshAudit();
      refreshPendingActions();
      refreshSchedule();
      refreshAlerts();
      refreshBrowserTabs();
      refreshLocalApps();
      refreshStatus();

      dcRef.current?.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(result)
          }
        })
      );
      dcRef.current?.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
    } catch (toolError) {
      const message = toolError instanceof Error ? toolError.message : "Tool execution failed.";
      addToolLog(call.name, "failed", message);
      dcRef.current?.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify({ ok: false, error: message })
          }
        })
      );
      dcRef.current?.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
    }
  }

  function parseToolArgs(raw) {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function handleRealtimeEvent(event) {
    if (event.type === "conversation.item.input_audio_transcription.delta") {
      partialUserRef.current += event.delta || "";
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      addLine("you", event.transcript || partialUserRef.current);
      partialUserRef.current = "";
      return;
    }

    if (
      event.type === "response.output_audio_transcript.delta" ||
      event.type === "response.audio_transcript.delta" ||
      event.type === "response.output_text.delta"
    ) {
      partialAssistantRef.current += event.delta || "";
      return;
    }

    if (
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.audio_transcript.done" ||
      event.type === "response.output_text.done"
    ) {
      addLine("jarvis", event.transcript || event.text || partialAssistantRef.current);
      partialAssistantRef.current = "";
      return;
    }

    if (event.type === "response.function_call_arguments.done") {
      executeToolCall(event);
      return;
    }

    if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
      executeToolCall(event.item);
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      setSignal("hearing you");
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      setSignal("thinking");
      return;
    }

    if (event.type === "response.done") {
      setSignal("listening");
      event.response?.output?.filter((item) => item.type === "function_call").forEach(executeToolCall);
      return;
    }

    if (event.type === "error") {
      setError(event.error?.message || "Realtime event error.");
      setStatus("error");
    }
  }

  function stopSession() {
    clearTimeout(reconnectTimer.current);
    cleanupSession();
    setStatus("idle");
    setMicEnabled(true);
    addLine("jarvis", "Voice link closed. Console remains in standby.");
  }

  function stopSpeakingMeter() {
    clearInterval(speakingMeterRef.current);
    speakingMeterRef.current = null;
    setVoiceSpeakingLevel(0);
  }

  function startSpeakingMeter() {
    stopSpeakingMeter();
    let tick = 0;
    speakingMeterRef.current = setInterval(() => {
      tick += 0.42;
      setVoiceSpeakingLevel(0.12 + Math.abs(Math.sin(tick)) * 0.58);
    }, 80);
  }

  async function speakWithMeter(text, options = {}) {
    startSpeakingMeter();
    try {
      const clean = String(text || "").trim();
      if (!clean) return;

      voiceControllerRef.current?.pauseRecognition();
      setVoiceState(options.state || "speaking");
      setVoiceResponse(clean);

      if (options.externalTts === true && systemStatus?.elevenlabs?.configured) {
        try {
          const response = await apiFetch("/api/jarvis/elevenlabs/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: clean })
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const detail = [payload.error, payload.code, payload.recovery].filter(Boolean).join(" ");
            throw new Error(detail || "ElevenLabs speech failed.");
          }

          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          await new Promise((resolve, reject) => {
            const audio = new Audio(audioUrl);
            audio.onended = resolve;
            audio.onerror = () => reject(new Error("ElevenLabs audio playback failed."));
            audio.play().catch(reject);
          }).finally(() => URL.revokeObjectURL(audioUrl));
          addToolLog("elevenlabs", "speaking", "JARVIS response played through ElevenLabs.");
          return;
        } catch (speechError) {
          const message = speechError instanceof Error ? speechError.message : "ElevenLabs speech failed.";
          addToolLog("elevenlabs", "fallback", message);
        }
      }

      await voiceControllerRef.current?.speak(clean, options);
    } finally {
      stopSpeakingMeter();
    }
  }

  async function executeVoiceCommand(text) {
    const clean = String(text || "").trim();
    if (!clean) return false;
    setVoiceCommandTranscript(clean);
    setVoiceResponse("");
    setVoiceError("");
    setVoiceState("thinking");
    setCommandState("thinking");
    setSignal("voice thinking");
    addLine("you", clean);
    addToolLog("voice_command", "running", clean);

    try {
      const response = await apiFetch("/api/jarvis/voice-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: clean })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Voice command failed.");
      }

      const nextState = payload.status === "needs_confirmation"
        ? "blocked"
        : payload.status === "failed"
          ? "blocked"
          : payload.status || "done";
      const responseText = payload.message || "Voice command processed.";
      setVoiceResponse(responseText);
      setCommandState(nextState === "blocked" ? "blocked" : payload.status || "done");
      addToolLog(payload.tool || payload.intent || "voice_command", payload.status || "done", responseText);
      addLine("jarvis", responseText);
      if (payload.pending_action) setActivePendingAction(payload.pending_action);
      applyCommandResult(payload);
      refreshMemory();
      refreshStatus();
      refreshAudit();
      refreshCleanupReview();
      refreshSchedule();
      refreshAlerts();
      refreshBrowserTabs();
      refreshLocalApps();
      refreshWhatsappDrafts();
      refreshPendingActions();

      if (nextState === "blocked") {
        setVoiceState("blocked");
        await speakWithMeter(responseText, { state: "speaking" });
        setVoiceState("blocked");
        return true;
      }

      await speakWithMeter(responseText, { state: "speaking" });
      setVoiceState("done");
      setCommandState("done");
      window.setTimeout(() => {
        voiceControllerRef.current?.resumeWake();
        setSignal("wake armed");
      }, 900);
      return true;
    } catch (voiceCommandError) {
      const message = voiceCommandError instanceof Error ? voiceCommandError.message : "Voice command failed.";
      setVoiceError(message);
      setVoiceState("blocked");
      setCommandState("error");
      setSignal("voice error");
      addToolLog("voice_command", "failed", message);
      addLine("jarvis", `Voice command failed: ${message}`);
      await speakWithMeter(`Command failed: ${message}`, { state: "speaking" });
      setVoiceState("blocked");
      return false;
    }
  }

  function buildVoiceController() {
    return createJervisVoiceController({
      onState: (nextState) => {
        setVoiceState(nextState);
        if (nextState === "unavailable") setSignal("voice unavailable");
      },
      onTranscript: ({ phase, transcript: spoken }) => {
        if (phase === "wake") {
          setVoiceWakeTranscript(spoken);
        } else {
          setVoiceCommandTranscript(spoken);
        }
      },
      onWake: async (spoken) => {
        setVoiceWakeTranscript(spoken);
        setVoiceCommandTranscript("");
        setVoiceResponse(JERVIS_GREETING);
        setVoiceError("");
        setSignal("wake accepted");
        addLine("you", spoken);
        addLine("jarvis", JERVIS_GREETING);
        addToolLog("voice_wake", "online", "Wake phrase accepted");
        await speakWithMeter(JERVIS_GREETING, { state: "speaking" });
        voiceControllerRef.current?.listenForCommand();
      },
      onFinalCommand: (spoken) => {
        executeVoiceCommand(spoken);
      },
      onResponse: (spoken) => {
        setVoiceResponse(spoken);
      },
      onError: (message) => {
        const clean = message || VOICE_UNAVAILABLE_MESSAGE;
        setVoiceError(clean);
        setVoiceState("unavailable");
        addToolLog("voice_wake", "failed", clean);
      }
    });
  }

  async function startVoiceOperator() {
    clearTimeout(reconnectTimer.current);
    voiceControllerRef.current?.stop();
    voiceControllerRef.current = null;
    audioMeterRef.current?.stop();
    audioMeterRef.current = null;
    cleanupSession();
    setError("");
    setVoiceError("");
    setVoiceWakeTranscript("");
    setVoiceCommandTranscript("");
    setVoiceResponse("");
    setStatus("voice");
    setSignal("requesting mic");
    setMicEnabled(true);

    if (!isSpeechRecognitionSupported()) {
      setStatus("idle");
      setVoiceState("unavailable");
      setVoiceError(VOICE_UNAVAILABLE_MESSAGE);
      setSignal("voice unavailable");
      addToolLog("voice_wake", "failed", VOICE_UNAVAILABLE_MESSAGE);
      return false;
    }

    audioMeterRef.current = createAudioReactiveMeter({
      onLevel: setVoiceVolume,
      onError: (message) => {
        setVoiceError(message);
        addToolLog("audio_meter", "failed", message);
      }
    });
    await audioMeterRef.current.start();
    refreshPermissionState();

    voiceControllerRef.current?.stop();
    voiceControllerRef.current = buildVoiceController();
    const result = voiceControllerRef.current.startWake();
    if (!result.ok) {
      setStatus("idle");
      setVoiceState("unavailable");
      setVoiceError(result.error || VOICE_UNAVAILABLE_MESSAGE);
      setSignal("voice unavailable");
      return false;
    }

    addToolLog("voice_wake", "armed", "Say Hey JERVIS to activate command capture");
    setSignal("wake armed");
    return true;
  }

  function stopVoiceOperator() {
    voiceControllerRef.current?.stop();
    voiceControllerRef.current = null;
    audioMeterRef.current?.stop();
    audioMeterRef.current = null;
    stopSpeakingMeter();
    setVoiceVolume(0);
    setVoiceWakeTranscript("");
    setVoiceCommandTranscript("");
    setVoiceResponse("");
    setVoiceError("");
    setVoiceState("standby");
    setStatus("idle");
    setSignal("offline");
    addLine("jarvis", "Voice wake closed. Manual command mode remains available.");
  }

  function toggleMic() {
    const next = !micEnabled;
    setMicEnabled(next);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    if (isLive) setStatus(next ? "live" : "muted");
  }

  function sendRealtimeText(text) {
    if (!text || !dcRef.current || dcRef.current.readyState !== "open") return false;
    addLine("you", text);
    dcRef.current.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }]
        }
      })
    );
    dcRef.current.send(JSON.stringify({ type: "response.create", response: { output_modalities: ["audio"] } }));
    return true;
  }

  async function executeLocalCommand(text, { echo = true } = {}) {
    const clean = String(text || "").trim();
    if (!clean) return false;
    if (echo) addLine("you", clean);
    setCommandState("thinking");
    addToolLog("command", "running", clean);

    try {
      const response = await apiFetch("/api/jarvis/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Command failed.");
      }

      setCommandState(payload.status === "needs_confirmation" ? "blocked" : payload.status || "done");
      addToolLog(payload.tool || payload.intent || "command", payload.status || "done", payload.message);
      addLine("jarvis", payload.message);
      if (payload.pending_action) setActivePendingAction(payload.pending_action);
      applyCommandResult(payload);
      refreshMemory();
      refreshStatus();
      refreshAudit();
      refreshCleanupReview();
      refreshSchedule();
      refreshAlerts();
      refreshBrowserTabs();
      refreshLocalApps();
      refreshWhatsappDrafts();
      refreshPendingActions();
      return true;
    } catch (commandError) {
      const message = commandError instanceof Error ? commandError.message : "Local command failed.";
      setCommandState("error");
      setError(message);
      addToolLog("command", "failed", message);
      addLine("jarvis", `Command failed: ${message}`);
      return false;
    }
  }

  async function saveAlias({ forceReplace = false } = {}) {
    const alias = aliasDraft.trim();
    const appName = aliasAppDraft.trim();
    if (!alias || !appName) {
      setError("Alias and app name are required.");
      addLine("jarvis", "Alias save blocked. Fill alias and app name first.");
      return false;
    }

    setAliasBusyKey(editingAliasId || alias);
    setCommandState(forceReplace || editingAliasId ? "alias_replace" : "alias_save");
    setError("");
    try {
      const response = await apiFetch("/api/jarvis/app-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias,
          app_name: appName,
          replace_existing: forceReplace || Boolean(editingAliasId && editingAliasId !== "new")
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        if (response.status === 409 && payload.conflict) {
          setAliasConflict(payload);
          setEditingAliasId(payload.conflict.id || editingAliasId || "new");
          addToolLog("app_alias", "conflict", payload.error);
          addLine("jarvis", `${payload.error} Review and confirm replace if you want the new target.`);
          setCommandState("blocked");
          return false;
        }
        throw new Error(payload.error || "Could not save app alias.");
      }

      addToolLog("app_alias", payload.replaced ? "replaced" : payload.unchanged ? "unchanged" : "done", payload.message);
      addLine("jarvis", payload.message);
      resetAliasEditor();
      setAliasDeleteConfirmId("");
      setCommandState("done");
      refreshLocalApps();
      refreshAudit();
      refreshStatus();
      return true;
    } catch (aliasError) {
      const message = aliasError instanceof Error ? aliasError.message : "Could not save app alias.";
      setError(message);
      setCommandState("error");
      addToolLog("app_alias", "failed", message);
      addLine("jarvis", `Alias save failed: ${message}`);
      return false;
    } finally {
      setAliasBusyKey("");
    }
  }

  async function deleteAlias(item) {
    if (!item?.id) return false;
    setAliasBusyKey(item.id);
    setCommandState("alias_delete");
    setError("");
    try {
      const response = await apiFetch(`/api/jarvis/app-aliases/${item.id}/delete`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not delete app alias.");
      }

      addToolLog("app_alias", "removed", payload.message);
      addLine("jarvis", payload.message);
      if (editingAliasId === item.id) resetAliasEditor();
      setAliasDeleteConfirmId("");
      setCommandState("done");
      refreshLocalApps();
      refreshAudit();
      refreshStatus();
      return true;
    } catch (aliasError) {
      const message = aliasError instanceof Error ? aliasError.message : "Could not delete app alias.";
      setError(message);
      setCommandState("error");
      addToolLog("app_alias", "failed", message);
      addLine("jarvis", `Alias delete failed: ${message}`);
      return false;
    } finally {
      setAliasBusyKey("");
    }
  }

  async function focusBrowserTab(item) {
    if (!item?.id) return false;
    setCommandState("focus_tab");
    setError("");
    try {
      const response = await apiFetch("/api/jarvis/browser-tabs/focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not focus browser tab.");
      }
      addToolLog("browser_tab", "focused", payload.message);
      addLine("jarvis", payload.message);
      setCommandState("done");
      refreshBrowserTabs();
      refreshAudit();
      refreshStatus();
      return true;
    } catch (tabError) {
      const message = tabError instanceof Error ? tabError.message : "Could not focus browser tab.";
      setError(message);
      setCommandState("error");
      addToolLog("browser_tab", "failed", message);
      addLine("jarvis", `Browser tab focus failed: ${message}`);
      return false;
    }
  }

  async function requestBrowserTabClose(item) {
    if (!item?.id) return false;
    setCommandState("close_tab_request");
    setError("");
    try {
      const response = await apiFetch("/api/jarvis/browser-tabs/close-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, command: `close browser tab ${item.id}` })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not prepare browser-tab close request.");
      }
      addToolLog("browser_tab", "gated", payload.message);
      addLine("jarvis", payload.message);
      setActivePendingAction(payload.pending_action || null);
      setCommandState("blocked");
      refreshPendingActions();
      refreshAudit();
      refreshStatus();
      return true;
    } catch (tabError) {
      const message = tabError instanceof Error ? tabError.message : "Could not prepare browser-tab close request.";
      setError(message);
      setCommandState("error");
      addToolLog("browser_tab", "failed", message);
      addLine("jarvis", `Browser tab close request failed: ${message}`);
      return false;
    }
  }

  async function sendTextPrompt(event) {
    event.preventDefault();
    const text = draft.trim();
    const sent = isLive ? sendRealtimeText(text) : await executeLocalCommand(text);
    if (sent) setDraft("");
  }

  async function sendMission() {
    const text = `Jervis, treat this as the active mission: ${mission}`;
    if (!sendRealtimeText(text)) {
      await executeLocalCommand(text);
    }
  }

  async function resolvePendingAction(actionId, decision, options = {}) {
    const endpoint = decision === "confirm" ? "confirm" : "cancel";
    setCommandState(decision === "confirm" ? "confirming" : "cancelling");

    try {
      const response = await apiFetch(`/api/jarvis/pending-actions/${actionId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Pending action update failed.");
      }

      addToolLog("pending_action", payload.pending_action.status, payload.message);
      addLine("jarvis", payload.message);
      setActivePendingAction(null);
      setCommandState("done");
      refreshPendingActions();
      refreshAudit();
      refreshStatus();
      refreshCleanupReview();
      refreshSchedule();
      refreshAlerts();
      refreshBrowserTabs();
      refreshWhatsappDrafts();
      return true;
    } catch (pendingError) {
      const message = pendingError instanceof Error ? pendingError.message : "Pending action update failed.";
      setError(message);
      setCommandState("error");
      addToolLog("pending_action", "failed", message);
      return false;
    }
  }

  function pendingBadge(statusText) {
    if (statusText === "awaiting_confirmation") return "Awaiting";
    if (statusText === "approved") return "Approved";
    if (statusText === "cancelled") return "Cancelled";
    return statusText;
  }

  function alertBadge(kind) {
    if (kind === "morning_brief") return "Morning brief";
    if (kind === "due_item") return "Due item";
    return kind;
  }

  function canResolveAlertDone(item) {
    return item.kind === "due_item" && item.source === "reminder";
  }

  function canAdjustAlertTime(item) {
    return item.kind === "due_item";
  }

  async function acknowledgeAlert(alertId) {
    setCommandState("acknowledging");
    try {
      const response = await apiFetch(`/api/jarvis/alerts/${alertId}/ack`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Alert acknowledgement failed.");
      }

      addToolLog("alert", "acknowledged", payload.message);
      addLine("jarvis", payload.message);
      setCommandState("done");
      refreshAlerts();
      refreshAudit();
      refreshStatus();
      return true;
    } catch (alertError) {
      const message = alertError instanceof Error ? alertError.message : "Alert acknowledgement failed.";
      setError(message);
      setCommandState("error");
      addToolLog("alert", "failed", message);
      return false;
    }
  }

  async function runAlertAction(item, action, body = {}) {
    setAlertBusyId(item.id);
    setCommandState(action);
    try {
      const response = await apiFetch(`/api/jarvis/alerts/${item.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Object.keys(body).length ? JSON.stringify(body) : undefined
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Alert action failed.");
      }

      addToolLog("alert", action, payload.message);
      addLine("jarvis", payload.message);
      setCommandState("done");
      setEditingAlertId("");
      setAlertRescheduleText("");
      refreshAlerts();
      refreshSchedule();
      refreshAudit();
      refreshStatus();
      return true;
    } catch (alertError) {
      const message = alertError instanceof Error ? alertError.message : "Alert action failed.";
      setError(message);
      setCommandState("error");
      addToolLog("alert", "failed", message);
      addLine("jarvis", `Alert action failed: ${message}`);
      return false;
    } finally {
      setAlertBusyId("");
    }
  }

  function cardStatus(title) {
    if (!systemStatus) return "checking";
    if (title === "Voice") return systemStatus.realtime?.status || "unknown";
    if (title === "Urgent") return `${systemStatus.alerts?.active ?? 0} active`;
    if (title === "Mission") return systemStatus.server?.status || "unknown";
    if (title === "Memory") return systemStatus.obsidian?.status || "unknown";
    if (title === "Graphify") return systemStatus.graphify?.status || "unknown";
    if (title === "Risk gates") return "armed";
    return "unknown";
  }

  function toggleCoreMode() {
    const nextMode = coreMode === "3d" ? "lite" : "3d";
    setCoreMode(writeCoreMode(nextMode));
    setCoreModeAuto(false);
    addToolLog("visual_core", "done", nextMode === "3d" ? "3D core enabled." : "Lite core enabled. Three.js skipped.");
  }

  return (
    <>
    <button className="mobile-orb-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Open JERVIS assistant">
      <Sparkles size={19} />
      <span>{visualLabel}</span>
    </button>
    <main className={`app-shell state-${visualState} voice-${voiceState} ${mobileOpen ? "mobile-open" : ""}`}>
      <section className="stage" aria-label="JERVIS voice operations console">
        <button className="mobile-close" type="button" onClick={() => setMobileOpen(false)} aria-label="Close mobile assistant">
          <ChevronDown size={20} />
        </button>
        <div className="topbar">
          <div className="brand-lockup">
            <span className="brand-mark"><Cpu size={19} /></span>
            <div>
              <p className="eyebrow">Cyber Mystic Dragon Operator Console</p>
              <h1>JERVIS</h1>
            </div>
          </div>
          <div className={`state-pill ${status} visual-${visualState}`}>
            <Activity size={16} />
            <span>{visualLabel}</span>
            <span className="state-meter" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>

        {!JARVIS_ENV_TOKEN ? (
          <div className={`access-gate ${accessTokenReady ? "is-ready" : "is-missing"}`}>
            <div>
              <span>Access Gate</span>
              <strong>{accessTokenReady ? "Browser key armed" : "JARVIS key required"}</strong>
              <p>{accessTokenReady ? "Key is stored only in this browser." : "Enter JARVIS_TOKEN to unlock protected API calls."}</p>
            </div>
            <div className="access-gate-actions">
              <input
                type="password"
                value={accessTokenDraft}
                onChange={(event) => setAccessTokenDraft(event.target.value)}
                placeholder="JARVIS_TOKEN"
                aria-label="JARVIS access key"
              />
              <button type="button" onClick={saveAccessToken} disabled={!accessTokenDraft.trim() && !accessTokenReady}>Save</button>
              {accessTokenReady ? <button type="button" onClick={clearAccessToken}>Clear</button> : null}
            </div>
          </div>
        ) : null}

        <div className="room-core">
          <div className={`orb dragon-core ${coreMode === "3d" ? "has-3d" : "is-lite"} ${isLive || isVoiceActive ? "is-live" : ""}`} aria-hidden="true">
            {coreMode === "3d" ? (
              <Suspense fallback={<div className="dragon-3d-canvas is-loading" />}>
                <JervisDragonCore state={visualState} volume={voiceVolume} speakingLevel={voiceSpeakingLevel} />
              </Suspense>
            ) : null}
            <div className="smoke-field" />
            <div className="particle-field">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="orb-ring" />
            <div className="audio-ring ring-a" />
            <div className="audio-ring ring-b" />
            <div className="audio-ring ring-c" />
            <div className="energy-trail" />
            <div className="dragon-head">
              <svg className="dragon-sigil" viewBox="0 0 220 220" focusable="false" role="presentation">
                <defs>
                  <linearGradient id="dragonSigilBody" x1="32" x2="188" y1="22" y2="198" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#5be7ff" />
                    <stop offset="0.28" stopColor="#ffe18a" />
                    <stop offset="0.58" stopColor="#ff8f3f" />
                    <stop offset="1" stopColor="#d33128" />
                  </linearGradient>
                  <linearGradient id="dragonSigilShadow" x1="74" x2="146" y1="34" y2="188" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#16060a" stopOpacity="0.18" />
                    <stop offset="1" stopColor="#060203" stopOpacity="0.92" />
                  </linearGradient>
                  <filter id="dragonSigilGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="3.6" result="blur" />
                    <feColorMatrix
                      in="blur"
                      type="matrix"
                      values="1 0 0 0 0.96 0 1 0 0 0.58 0 0 1 0 0.18 0 0 0 0.72 0"
                    />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <path
                  className="sigil-neck"
                  d="M109 62C96 84 83 99 63 112c24 1 44 7 58 22 12 13 15 30 6 51 25-12 44-30 49-56 5-27-7-51-31-66-10-6-23-8-36-1Z"
                />
                <path
                  className="sigil-head-plate"
                  d="M121 35c-10 3-20 11-28 24-7 12-11 27-11 43 12-6 25-11 41-12 14-1 27 1 39 7-5-16-13-31-25-43l20-23-31 13-5-9Z"
                />
                <path
                  className="sigil-jaw"
                  d="M84 104c15 3 32 3 53-2l-18 26c-11 16-27 19-45 8 15-3 20-13 10-32Z"
                />
                <path
                  className="sigil-horn sigil-horn-left"
                  d="M94 63 55 36l14 49"
                />
                <path
                  className="sigil-horn sigil-horn-right"
                  d="M139 54 184 24l-26 55"
                />
                <path
                  className="sigil-crest"
                  d="M117 33c2 14 1 29-5 45M135 45c-2 13-7 25-16 36M97 59c-12 4-22 11-31 22"
                />
                <path
                  className="sigil-eye"
                  d="M103 91c14 7 29 8 44 1"
                />
                <path
                  className="sigil-whisker"
                  d="M93 118c-21 5-39 17-53 36M124 121c-7 25-24 44-51 57M137 111c24 5 40 17 50 36"
                />
                <path
                  className="sigil-energy"
                  d="M64 154c30 6 60-1 90-22 21-15 35-34 43-58"
                />
              </svg>
              <span className="horn horn-left" />
              <span className="horn horn-right" />
              <span className="dragon-eye eye-left" />
              <span className="dragon-eye eye-right" />
              <span className="dragon-snout" />
            </div>
            <div className="terminal-lines">
              <span className="terminal-line" />
              <span className="terminal-line" />
              <span className="terminal-line" />
            </div>
            <div className="hud-reticle">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="hud-neural-links">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="hud-status-runes">
              <span>{visualLabel}</span>
              <span>{signal}</span>
              <span>{awaitingCount ? `${awaitingCount} gates` : "clear"}</span>
            </div>
          </div>

          <div className="room-copy">
            <p className="room-kicker">Presence {"->"} recall {"->"} risk check {"->"} draft {"->"} confirm {"->"} execute {"->"} log.</p>
            <h2>{roomTone}</h2>
            <p>
              Good morning, sir. Standing by. I found {alerts.length} urgent items,
              {pendingActions.length} gated actions, and {scheduleView.next_actions.length} next moves.
            </p>
          </div>

          <div className={`voice-readout voice-${voiceState}`} aria-live="polite">
            <div>
              <span>VOICE V1</span>
              <strong>{voiceState === "standbyListeningForWake" ? "Wake armed" : voiceState}</strong>
            </div>
            <p>
              {voiceError ||
                voiceResponse ||
                voiceCommandTranscript ||
                voiceWakeTranscript ||
                (systemStatus?.elevenlabs?.configured
                  ? "ElevenLabs voice ready. Press Test ElevenLabs or Start JERVIS."
                  : "Say Hey JERVIS. Manual command mode remains available.")}
            </p>
          </div>

          <div className="mission-strip">
            <input value={mission} onChange={(event) => setMission(event.target.value)} aria-label="Active mission" />
            <button onClick={sendMission} disabled={!mission.trim()}>
              <Send size={17} />
              <span>Send mission</span>
            </button>
          </div>

          <div className="controls" aria-label="Session controls">
            {!isLive && !isVoiceActive && status !== "connecting" && status !== "requesting" && status !== "reconnecting" ? (
              <button className="primary-action" onClick={startVoiceOperator}>
                <Mic size={20} />
                <span>Start JERVIS</span>
              </button>
            ) : (
              <button className="danger-action" onClick={isVoiceActive ? stopVoiceOperator : stopSession}>
                <CircleStop size={20} />
                <span>End</span>
              </button>
            )}
            <button
              className="core-mode-toggle"
              type="button"
              onClick={playElevenLabsVoiceTest}
              disabled={elevenLabsBusy || !systemStatus?.elevenlabs?.configured}
              title={systemStatus?.elevenlabs?.configured ? "Play ElevenLabs voice test" : "ElevenLabs is not configured"}
            >
              <Volume2 size={17} />
              <span>{elevenLabsBusy ? "Generating" : "Test ElevenLabs"}</span>
            </button>
            <button className="icon-action" onClick={toggleMic} disabled={!isLive} title={micEnabled ? "Mute microphone" : "Unmute microphone"}>
              {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button
              className="icon-action"
              onClick={isVoiceActive ? startVoiceOperator : () => startSession({ recovering: true })}
              disabled={status === "connecting" || status === "requesting"}
              title={isVoiceActive ? "Restart voice wake" : "Reconnect realtime"}
            >
              <RefreshCcw size={20} />
            </button>
            <button
              className={`core-mode-toggle ${coreMode === "lite" ? "is-lite" : "is-3d"}`}
              type="button"
              onClick={toggleCoreMode}
              title={coreMode === "3d" ? "Switch to Lite Core" : "Switch to 3D Core"}
              aria-pressed={coreMode === "3d"}
            >
              <Cpu size={17} />
              <span>{coreMode === "3d" ? "3D Core" : "Lite Core"}{coreModeAuto ? " Auto" : ""}</span>
            </button>
          </div>
        </div>

        <div className="status-grid">
          <StatusTile icon={<Activity size={18} />} label="Status" value={visualLabel} />
          <StatusTile
            icon={<Volume2 size={18} />}
            label="Voice"
            value={isVoiceActive || voiceState === "unavailable" ? voiceState : systemStatus?.elevenlabs?.configured ? "ElevenLabs" : config.voice}
          />
          <StatusTile icon={<BrainCircuit size={18} />} label="Model" value={config.model} />
          <StatusTile icon={<Unplug size={18} />} label="Signal" value={signal} />
          <StatusTile icon={<TerminalSquare size={18} />} label="Command" value={commandState} />
          <StatusTile icon={<Clock3 size={18} />} label="Due Today" value={String(systemStatus?.scheduler?.today ?? 0)} />
          <StatusTile icon={<CircleAlert size={18} />} label="Alerts" value={String(systemStatus?.alerts?.active ?? 0)} />
          <StatusTile icon={<Sparkles size={18} />} label="Notify" value={notificationPermission} />
          <StatusTile icon={<Mic size={18} />} label="Mic" value={microphonePermission} />
          <StatusTile icon={<Cpu size={18} />} label="Core" value={`${coreMode === "3d" ? "3D" : "Lite"}${coreModeAuto ? " auto" : ""}`} />
          <StatusTile icon={<Cpu size={18} />} label="Local ctrl" value={systemStatus?.local_control?.status || "checking"} />
          <StatusTile icon={<Volume2 size={18} />} label="ElevenLabs" value={systemStatus?.elevenlabs?.status || "checking"} />
        </div>

        <div className="operator-band">
          <strong>Max Operator</strong>
          <span>Local host only. Obsidian + Graphify are mandatory subsystems. Safe tools execute directly; external, destructive, financial, account, install, or sensitive-data steps require a gate.</span>
        </div>

        {alerts.length ? (
          <div className="alert-band">
            <strong>{alerts.length} live alerts</strong>
            <span>{alerts[0].message}</span>
          </div>
        ) : null}

        {error ? <p className="error-line">{error}</p> : null}
      </section>

      <aside className="ops-panel" aria-label="JERVIS operations panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Operations</p>
            <h2>Command Panels</h2>
          </div>
          <span className={config.hasServerKey ? "key-ok" : "key-missing"}>
            {config.hasServerKey ? "Key ready" : "No server key"}
          </span>
        </div>

        {latestTool ? (
          <article className={`latest-tool-bubble tone-${statusTone(latestTool.status)}`}>
            <div>
              <span>Latest tool</span>
              <strong>{latestTool.name}</strong>
            </div>
            <p>{latestTool.detail}</p>
            <em>{latestTool.status}</em>
          </article>
        ) : null}

        <div className="capability-toolbar" aria-label="Command shortcuts">
          {capabilityCards.map((card) => (
            <button
              className={`capability-chip tone-${statusTone(cardStatus(card.title))}`}
              key={card.title}
              type="button"
              onClick={() => executeLocalCommand(card.command, { echo: false })}
              title={`${card.title}: ${card.text}. Status: ${cardStatus(card.title)}`}
              aria-label={`${card.title}. ${card.text}. Status: ${cardStatus(card.title)}`}
            >
              {card.icon}
              <span className="visually-hidden">{card.title}</span>
              <em aria-hidden="true">{cardStatus(card.title)}</em>
            </button>
          ))}
        </div>

        <div className="ops-tabs" role="tablist" aria-label="Operations groups">
          {[
            ["tools", "Tools"],
            ["gates", "Gates"],
            ["mission", "Mission"],
            ["memory", "Memory"]
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeOpsTab === id}
              className={activeOpsTab === id ? "is-active" : ""}
              onClick={() => setActiveOpsTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`ops-tab-panel ${activeOpsTab === "tools" ? "is-active" : ""}`} role="tabpanel">
        <PanelSection title="Tool Bridge" defaultOpen>
          <div className="panel-actions">
            <button type="button" onClick={refreshStatus}>Refresh status</button>
            <button type="button" onClick={() => executeLocalCommand("status", { echo: false })}>Run status</button>
          </div>
          <div className="tool-list">
            {toolLog.map((item) => (
              <article className="tool-row" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                </div>
                <em>{item.status}</em>
              </article>
            ))}
          </div>
        </PanelSection>

        <PanelSection title="Local control" defaultOpen>
          <div className="panel-actions">
            <button type="button" onClick={refreshLocalApps}>Refresh apps</button>
            <button type="button" onClick={refreshBrowserTabs}>Refresh tabs</button>
            <button type="button" onClick={() => executeLocalCommand("list browser tabs", { echo: true })}>List tabs</button>
            <button type="button" onClick={() => executeLocalCommand("list apps", { echo: true })}>List apps</button>
            <button type="button" onClick={() => beginAliasEdit()}>Teach alias</button>
            <button type="button" onClick={() => executeLocalCommand("open localhost:5173", { echo: true })}>Open localhost</button>
            <button type="button" onClick={() => executeLocalCommand("open obsidian", { echo: true })}>Open Obsidian</button>
            <button type="button" onClick={() => executeLocalCommand("open obsidian note JARVIS Index", { echo: true })}>Open JARVIS note</button>
          </div>
          <p className="empty-state">
            Safe local executor only: supported apps, http(s) pages, and Obsidian notes. No shell. No arbitrary files.
          </p>
          {browserTabsBlocked ? (
            <div className="inline-editor">
              <strong>Browser automation blocked</strong>
              <p className="empty-state">
                {browserTabs.error || "JARVIS cannot inspect Safari or Google Chrome yet."}
              </p>
              <p className="empty-state">
                Grant path: macOS System Settings {"->"} Privacy &amp; Security {"->"} Automation.
              </p>
              <p className="empty-state">
                Allow the shell host running JARVIS, such as Terminal, iTerm, or Codex, to control Safari or Google Chrome. Then retry tab refresh.
              </p>
            </div>
          ) : null}
          <div className="inline-editor">
            <strong>Find browser tab</strong>
            <label>
              <span>Tab title, URL, or tab id</span>
              <input
                value={browserTabQuery}
                onChange={(event) => setBrowserTabQueryValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitBrowserTabSearch();
                }}
                placeholder="localhost, JERVIS, chrome:1:1"
              />
            </label>
            <div className="panel-actions">
              <button type="button" onClick={submitBrowserTabSearch}>Search tabs</button>
              <button type="button" onClick={clearBrowserTabSearch} disabled={!browserTabQuery && !browserTabs.query}>Clear filter</button>
              {prioritizedBrowserTabs.length < (browserTabs.match_count || 0) ? (
                <button type="button" onClick={showMoreBrowserTabs}>Show more</button>
              ) : null}
            </div>
            <p className="empty-state">
              {browserTabs.query
                ? `Showing ${prioritizedBrowserTabs.length} of ${browserTabs.match_count} matching tabs.`
                : `Showing ${prioritizedBrowserTabs.length} of ${browserTabs.tab_count} open tabs.`}
            </p>
          </div>
          <div className="brief-grid">
            <article className="brief-stat">
              <span>Apps</span>
              <strong>{localApps.app_count}</strong>
            </article>
            <article className="brief-stat">
              <span>Aliases</span>
              <strong>{localApps.alias_count}</strong>
            </article>
            <article className="brief-stat">
              <span>Browsers</span>
              <strong>{browserTabs.browser_count}</strong>
            </article>
            <article className="brief-stat">
              <span>Tabs</span>
              <strong>{browserTabs.tab_count}</strong>
            </article>
          </div>
          {editingAliasId ? (
            <div className="inline-editor">
              <strong>{editingAliasId === "new" ? "Teach alias" : "Replace alias"}</strong>
              <label>
                <span>Alias</span>
                <input value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} placeholder="dragon" />
              </label>
              <label>
                <span>App name</span>
                <input value={aliasAppDraft} onChange={(event) => setAliasAppDraft(event.target.value)} placeholder="Obsidian" />
              </label>
              {aliasConflict?.conflict ? (
                <p className="empty-state">
                  Conflict: {aliasConflict.conflict.alias} currently opens {aliasConflict.conflict.app_name}. Replace only if that is intended.
                </p>
              ) : null}
              <div className="panel-actions">
                <button type="button" onClick={() => saveAlias()} disabled={Boolean(aliasBusyKey)}>
                  Save alias
                </button>
                {aliasConflict?.conflict ? (
                  <button type="button" onClick={() => saveAlias({ forceReplace: true })} disabled={Boolean(aliasBusyKey)}>
                    Replace alias
                  </button>
                ) : null}
                <button type="button" onClick={resetAliasEditor} disabled={Boolean(aliasBusyKey)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {localApps.aliases.length ? (
            <div className="pending-list">
              {localApps.aliases.slice(0, 6).map((item) => (
                <article className="pending-row static" key={item.id || `${item.alias}-${item.app_name}`}>
                  <div>
                    <strong>{item.alias}</strong>
                    <span>{item.app_name}</span>
                  </div>
                  <div className="row-actions">
                    {aliasDeleteConfirmId === item.id ? (
                      <>
                        <button type="button" onClick={() => setAliasDeleteConfirmId("")} disabled={aliasBusyKey === item.id}>Cancel</button>
                        <button type="button" onClick={() => deleteAlias(item)} disabled={aliasBusyKey === item.id}>Remove now</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => executeLocalCommand(`open ${item.alias}`, { echo: true })}>Open</button>
                        <button type="button" onClick={() => beginAliasEdit(item)}>Replace</button>
                        <button type="button" onClick={() => setAliasDeleteConfirmId(item.id)}>Remove</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No learned app aliases yet. Example: remember app alias dragon for Obsidian.</p>
          )}
          {localApps.apps.length ? (
            <div className="pending-list">
              {localApps.apps.slice(0, 6).map((item) => (
                <article className="pending-row static" key={item.path}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.path}</span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => beginAliasEdit(null, item.name)}>Alias</button>
                    <button type="button" onClick={() => executeLocalCommand(`open ${item.name}`, { echo: true })}>Open</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No local app catalog loaded yet.</p>
          )}
          {prioritizedBrowserTabs.length ? (
            <div className="pending-list">
              {prioritizedBrowserTabs.slice(0, 6).map((item) => (
                <article className="pending-row static" key={item.id}>
                  <div>
                    <strong>{item.title || item.url || item.id}</strong>
                    <span>{item.browser} - {item.url || item.id}</span>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => focusBrowserTab(item)}>Focus</button>
                    <button type="button" onClick={() => requestBrowserTabClose(item)}>Close</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              {browserTabsBlocked
                ? "Retry after granting Automation permission in macOS."
                : browserTabs.query
                  ? `No browser tabs match: ${browserTabs.query}`
                  : "No supported browser tabs are open in Safari or Google Chrome."}
            </p>
          )}
        </PanelSection>
        </div>

        <div className={`ops-tab-panel ${activeOpsTab === "gates" ? "is-active" : ""}`} role="tabpanel">
        <PanelSection title="Risk Gates" defaultOpen>
          <div className="panel-actions">
            <button type="button" onClick={refreshPendingActions}>Refresh pending</button>
          </div>
          {pendingActions.length ? (
            <div className="pending-list">
              {pendingActions.map((item) => (
                <button className="pending-row" key={item.id} type="button" onClick={() => setActivePendingAction(item)}>
                  <div>
                    <strong>{item.family}</strong>
                    <span>{item.command}</span>
                  </div>
                  <em className={item.status}>{pendingBadge(item.status)}</em>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state">No pending actions. Risk-gated commands will appear here for explicit review.</p>
          )}
        </PanelSection>

        <PanelSection title="Urgente">
          <div className="panel-actions">
            <button type="button" onClick={refreshAlerts}>Refresh alerts</button>
            <button
              type="button"
              onClick={requestBrowserNotifications}
              disabled={notificationPermission === "granted" || notificationPermission === "unsupported" || notificationPermission === "denied"}
            >
              Enable browser alerts
            </button>
            <button
              type="button"
              onClick={testBrowserNotification}
              disabled={notificationPermission !== "granted"}
            >
              Test browser alert
            </button>
            <button
              type="button"
              onClick={testMicrophoneAccess}
              disabled={microphonePermission === "denied" || microphonePermission === "unsupported"}
            >
              Test microphone
            </button>
          </div>
          <p className="notification-note">
            Browser alerts: {notificationPermission}. Mic: {microphonePermission}. {(notificationPermission === "denied" || microphonePermission === "denied") ? "Reset site permissions in the browser, then retest." : "UI alerts stay active as fallback."}
          </p>

          {alerts.length ? (
            <div className="alert-list">
              {alerts.map((item) => (
                <article className="alert-row" key={item.id}>
                  <div className="alert-copy">
                    <strong>{alertBadge(item.kind)}</strong>
                    <p>{item.message}</p>
                    {editingAlertId === item.id ? (
                      <div className="alert-editor">
                        <input
                          value={alertRescheduleText}
                          onChange={(event) => setAlertRescheduleText(event.target.value)}
                          placeholder="ex: maine la 10"
                        />
                        <div className="alert-editor-actions">
                          <button
                            type="button"
                            className="alert-ack"
                            disabled={!alertRescheduleText.trim() || alertBusyId === item.id}
                            onClick={() => runAlertAction(item, "reschedule", { when_text: alertRescheduleText })}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="alert-ack"
                            disabled={alertBusyId === item.id}
                            onClick={() => {
                              setEditingAlertId("");
                              setAlertRescheduleText("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="alert-side">
                    <em className={`alert-badge ${item.severity}`}>{item.severity}</em>
                    <div className="alert-actions">
                      {canResolveAlertDone(item) ? (
                        <button
                          type="button"
                          className="alert-ack"
                          disabled={alertBusyId === item.id}
                          onClick={() => runAlertAction(item, "done")}
                        >
                          Done
                        </button>
                      ) : null}
                      {canAdjustAlertTime(item) ? (
                        <>
                          <button
                            type="button"
                            className="alert-ack"
                            disabled={alertBusyId === item.id}
                            onClick={() => runAlertAction(item, "snooze", { minutes: 15 })}
                          >
                            Snooze 15m
                          </button>
                          <button
                            type="button"
                            className="alert-ack"
                            disabled={alertBusyId === item.id}
                            onClick={() => {
                              setEditingAlertId(item.id);
                              setAlertRescheduleText(item.original_time || "");
                            }}
                          >
                            Reschedule
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="alert-ack"
                        disabled={alertBusyId === item.id}
                        onClick={() => acknowledgeAlert(item.id)}
                      >
                        Acknowledge
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No active alerts. The local scheduler will surface due work and the morning brief here.</p>
          )}
        </PanelSection>
        </div>

        <div className={`ops-tab-panel ${activeOpsTab === "mission" ? "is-active" : ""}`} role="tabpanel">
        <PanelSection title="Misiune" defaultOpen>
          <div className="panel-actions">
            <button type="button" onClick={refreshSchedule}>Refresh queue</button>
            <button type="button" onClick={() => executeLocalCommand("what do I have today?", { echo: false })}>Run daily brief</button>
            <button type="button" onClick={() => executeLocalCommand("export calendar upcoming", { echo: true })}>Export .ics</button>
            <button type="button" onClick={() => executeLocalCommand("open latest calendar export", { echo: true })}>Open .ics</button>
          </div>

          {scheduleView.summary ? (
            <div className="brief-stack">
              <div className="brief-grid">
                <article className="brief-stat">
                  <span>Overdue</span>
                  <strong>{scheduleView.summary.overdue ?? 0}</strong>
                </article>
                <article className="brief-stat">
                  <span>Today</span>
                  <strong>{scheduleView.summary.today ?? 0}</strong>
                </article>
                <article className="brief-stat">
                  <span>Tomorrow</span>
                  <strong>{scheduleView.summary.tomorrow ?? 0}</strong>
                </article>
                <article className="brief-stat">
                  <span>Needs time</span>
                  <strong>{scheduleView.summary.unscheduled ?? 0}</strong>
                </article>
              </div>

              {scheduleView.next_actions.length ? (
                <div className="brief-list">
                  {scheduleView.next_actions.map((item) => (
                    <article className="memory-row" key={item}>
                      <span>queue</span>
                      <p>{item}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">No queue summary loaded yet.</p>
          )}

          {scheduleView.items.length ? (
            <div className="queue-list">
              {scheduleView.items.map((item) => (
                <article className="queue-row" key={item.id}>
                  <div>
                    <strong>{item.source === "approved_action" ? "approved action" : "reminder"}</strong>
                    <span>{item.title}</span>
                  </div>
                  <div className="queue-meta">
                    <em className={`queue-badge ${item.bucket}`}>{item.bucket}</em>
                    <span>{item.due_label || item.original_time}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No scheduled items yet. Create reminders or approve actions to build the queue.</p>
          )}
        </PanelSection>

        <PanelSection title="Comenzi" defaultOpen>
          <div className="panel-actions">
            {quickCommands.map((item) => (
              <button key={item.command} type="button" onClick={() => executeLocalCommand(item.command, { echo: true })} title={item.command}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="tool-list">
            {toolLog.slice(0, 4).map((item) => (
              <article className="tool-row" key={`command-${item.id}`}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                </div>
                <em>{item.status}</em>
              </article>
            ))}
          </div>
          <div className="panel-actions panel-actions-spaced">
            <button type="button" onClick={refreshCleanupReview}>Refresh cleanup</button>
          </div>
          {cleanupReview.candidates.length ? (
            <div className="pending-list">
              {cleanupReview.candidates.map((item) => (
                <article className="pending-row static" key={item.id || item.path || item.label}>
                  <div>
                    <strong>{item.kind}</strong>
                    <span>{item.label}</span>
                  </div>
                  <em>{item.reason}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No cleanup candidates detected.</p>
          )}
        </PanelSection>

        <PanelSection title="Contact allowlist">
          <form className="inline-editor" onSubmit={saveContact}>
            <strong>Contacts {contacts.allowed}/{contacts.count} allowed</strong>
            <label>
              <span>Name</span>
              <input
                value={contactDraft.name}
                onChange={(event) => updateContactDraft("name", event.target.value)}
                placeholder="Andrei"
              />
            </label>
            <label>
              <span>Phone with country code</span>
              <input
                value={contactDraft.phone_e164}
                onChange={(event) => updateContactDraft("phone_e164", event.target.value)}
                placeholder="+40700000000"
              />
            </label>
            <label>
              <span>Aliases</span>
              <input
                value={contactDraft.aliases}
                onChange={(event) => updateContactDraft("aliases", event.target.value)}
                placeholder="andi, client"
              />
            </label>
            <label>
              <span>Notes</span>
              <input
                value={contactDraft.notes}
                onChange={(event) => updateContactDraft("notes", event.target.value)}
                placeholder="WhatsApp approved context"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={contactDraft.whatsapp_allowed}
                onChange={(event) => updateContactDraft("whatsapp_allowed", event.target.checked)}
              />
              <span>Allow real WhatsApp sends to this contact</span>
            </label>
            <div className="panel-actions">
              <button
                type="submit"
                disabled={!contactDraft.name.trim() || (contactDraft.whatsapp_allowed && !contactDraft.phone_e164.trim()) || contactBusyId === "new"}
              >
                Save contact
              </button>
              <button type="button" onClick={() => setContactDraft(emptyContactDraft)} disabled={contactBusyId === "new"}>
                Reset
              </button>
            </div>
          </form>

          {contacts.contacts.length ? (
            <div className="pending-list">
              {contacts.contacts.map((item) => (
                <article className="pending-row static" key={item.id}>
                  <div>
                    <strong>{item.name || item.label}</strong>
                    <span>
                      {item.whatsapp_status} · {item.has_phone ? `phone ending ${item.phone_last4}` : "missing phone"}
                    </span>
                  </div>
                  <div className="row-actions">
                    {item.whatsapp_allowed ? (
                      <button type="button" onClick={() => updateContactAllowlist(item, false)} disabled={contactBusyId === item.id}>
                        Revoke
                      </button>
                    ) : (
                      <button type="button" onClick={() => updateContactAllowlist(item, true)} disabled={!item.has_phone || contactBusyId === item.id}>
                        Allow
                      </button>
                    )}
                    {contactDeleteConfirmId === item.id ? (
                      <>
                        <button type="button" onClick={() => setContactDeleteConfirmId("")} disabled={contactBusyId === item.id}>Cancel</button>
                        <button type="button" onClick={() => deleteContact(item)} disabled={contactBusyId === item.id}>Remove now</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setContactDeleteConfirmId(item.id)} disabled={contactBusyId === item.id}>
                        Remove
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No contacts saved. Live WhatsApp stays blocked until a contact is allowlisted.</p>
          )}
        </PanelSection>

        <PanelSection title="WhatsApp drafts">
          <div className="panel-actions">
            <button type="button" onClick={refreshWhatsappDrafts}>Refresh drafts</button>
            <button type="button" onClick={() => executeLocalCommand("draft whatsapp Andrei: Revin cu detalii.", { echo: true })}>Create sample draft</button>
            <button type="button" onClick={() => executeLocalCommand("send latest whatsapp draft", { echo: true })}>
              {whatsappExecutor?.dry_run === false ? "Send guarded" : "Dry-run send"}
            </button>
            <button type="button" onClick={() => executeLocalCommand("open latest whatsapp draft", { echo: true })}>Open latest draft</button>
          </div>
          {whatsappExecutor ? (
            <p className="empty-state">
              WhatsApp executor: {whatsappExecutor.mode}. Live send requires contact allowlist.
              Webhook: {systemStatus?.whatsapp?.webhook?.verify_token_configured ? "verify token ready" : "verify token missing"}.
            </p>
          ) : null}
          <div className="brief-grid">
            <article className="brief-stat">
              <span>Config</span>
              <strong>{systemStatus?.whatsapp?.configured ? "ready" : "missing"}</strong>
            </article>
            <article className="brief-stat">
              <span>Webhook</span>
              <strong>{systemStatus?.whatsapp?.webhook?.verify_token_configured ? "ready" : "missing"}</strong>
            </article>
            <article className="brief-stat">
              <span>Send mode</span>
              <strong>{whatsappExecutor?.dry_run === false ? "live gated" : "dry-run"}</strong>
            </article>
            <article className="brief-stat">
              <span>Failed sends</span>
              <strong>{failedWhatsappSends}</strong>
            </article>
          </div>
          <div className="brief-stack">
            <p className="empty-state">
              Last inbound: {lastWhatsappInbound?.body || lastWhatsappInbound?.message || "none"}.
            </p>
            <p className="empty-state">
              Last outbound: {lastWhatsappOutbound?.body || lastWhatsappOutbound?.message || "none"}.
            </p>
          </div>
          <div className="inline-editor">
            <strong>Live mode control</strong>
            <p className="empty-state">
              Config: {whatsappExecutor?.configured ? "ready" : "missing"}. Allowed contacts: {contacts.allowed}.
            </p>
            <label>
              <span>Live confirmation phrase</span>
              <input
                value={whatsappLivePhrase}
                onChange={(event) => setWhatsappLivePhrase(event.target.value)}
                placeholder="LIVE WHATSAPP"
              />
            </label>
            <div className="panel-actions">
              <button type="button" onClick={() => setWhatsappMode(true)} disabled={whatsappModeBusy || whatsappExecutor?.dry_run === true}>
                Force dry-run
              </button>
              <button
                type="button"
                onClick={() => setWhatsappMode(false)}
                disabled={
                  whatsappModeBusy ||
                  whatsappExecutor?.dry_run === false ||
                  !whatsappExecutor?.configured ||
                  contacts.allowed < 1 ||
                  whatsappLivePhrase !== "LIVE WHATSAPP"
                }
              >
                Enable live
              </button>
            </div>
          </div>
          {whatsappDrafts.length ? (
            <div className="pending-list">
              {whatsappDrafts.map((item) => (
                <article className="pending-row static" key={item.id}>
                  <div>
                    <strong>{item.recipient}</strong>
                    <span>{item.contact_status || "contact_not_checked"} · {item.message}</span>
                  </div>
                  <em>{item.dry_run ? `${item.status} dry-run` : item.status}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No WhatsApp drafts yet. Drafts are local only and never sent.</p>
          )}
        </PanelSection>

        <PanelSection title="ElevenLabs voice">
          <div className="inline-editor">
            <strong>Text-to-speech bridge</strong>
            <p className="empty-state">
              Status: {systemStatus?.elevenlabs?.status || "checking"}. Provider: ElevenLabs. Voice: {systemStatus?.elevenlabs?.voice_id || "default"}.
              JARVIS replies use ElevenLabs when ready, browser voice as fallback.
            </p>
            <label>
              <span>Preview text</span>
              <input
                value={elevenLabsText}
                onChange={(event) => setElevenLabsText(event.target.value)}
                maxLength={1000}
                placeholder="Type a short JERVIS line"
              />
            </label>
            <div className="panel-actions">
              <button type="button" onClick={playElevenLabsPreview} disabled={elevenLabsBusy || !elevenLabsText.trim()}>
                {elevenLabsBusy ? "Generating" : "Play preview"}
              </button>
              <button
                type="button"
                onClick={() => setElevenLabsText("Good morning, sir. Standing by. Risk gates are armed.")}
                disabled={elevenLabsBusy}
              >
                Reset line
              </button>
            </div>
            {!systemStatus?.elevenlabs?.configured ? (
              <p className="empty-state">Requires setup: add ELEVENLABS_API_KEY to .env and restart JERVIS.</p>
            ) : null}
          </div>
        </PanelSection>
        </div>

        <div className={`ops-tab-panel ${activeOpsTab === "memory" ? "is-active" : ""}`} role="tabpanel">
        <PanelSection title="Memorie" defaultOpen>
          <div className="panel-actions">
            <button type="button" onClick={() => executeLocalCommand("where did we leave off?", { echo: false })}>Recall</button>
          </div>
          {memory.length ? (
            <div className="memory-list">
              {memory.map((item) => (
                <article className="memory-row" key={item.id}>
                  <span>{item.category}</span>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No local notes yet. Type “remember this...” or start voice and say “Jervis, remember that...”.</p>
          )}
        </PanelSection>

        <PanelSection title="Learning loop">
          <div className="panel-actions">
            <button type="button" onClick={refreshLearning}>Refresh learning</button>
            <button type="button" onClick={() => executeLocalCommand("how can I improve operations today?", { echo: false })}>Review advice</button>
          </div>

          {learning.brief ? (
            <div className="brief-stack">
              <div className="brief-grid">
                <article className="brief-stat">
                  <span>Awaiting</span>
                  <strong>{learning.brief.snapshot?.awaiting_confirmation ?? 0}</strong>
                </article>
                <article className="brief-stat">
                  <span>Approved</span>
                  <strong>{learning.brief.snapshot?.approved_waiting_execution ?? 0}</strong>
                </article>
                <article className="brief-stat">
                  <span>Reminders</span>
                  <strong>{learning.brief.snapshot?.reminders ?? 0}</strong>
                </article>
                <article className="brief-stat">
                  <span>Signals</span>
                  <strong>{learning.brief.snapshot?.learning_signals ?? 0}</strong>
                </article>
              </div>

              {learning.brief.recommendations?.length ? (
                <div className="brief-list">
                  {learning.brief.recommendations.map((item) => (
                    <article className="memory-row" key={item}>
                      <span>advice</span>
                      <p>{item}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">No operational brief loaded yet. Ask JERVIS how to improve operations.</p>
          )}

          {learning.signals.length ? (
            <div className="memory-list">
              {learning.signals.map((item) => (
                <article className="memory-row" key={item.id}>
                  <span>{item.kind}</span>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No learning signals yet. Teach a preference, correction, friction, priority, or win.</p>
          )}
        </PanelSection>

        <PanelSection title="Audit">
          {audit.length ? (
            <div className="tool-list">
              {audit.map((item) => (
                <article className="tool-row" key={item.id}>
                  <div>
                    <strong>{item.intent || item.source}</strong>
                    <span>{item.detail || item.command || "Logged event"}</span>
                  </div>
                  <em>{item.status}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No audit events yet. Commands and tool calls will appear here.</p>
          )}
        </PanelSection>
        </div>
      </aside>

      <aside className="transcript-panel" aria-label="Transcript">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Conversation</p>
            <h2>Response Console</h2>
          </div>
          <span className="tool-count">{config.tools?.length || 0} tools</span>
        </div>

        <article className={`response-bubble tone-${activePendingAction || awaitingCount ? "warning" : statusTone(latestTool?.status)}`}>
          <div className="response-bubble-head">
            <span>{visualLabel}</span>
            <em>{nowStamp()}</em>
          </div>
          <div className="response-grid">
            <div>
              <span>Intent</span>
              <p>{responseBrief.intent}</p>
            </div>
            <div>
              <span>Action</span>
              <p>{responseBrief.action}</p>
            </div>
            <div>
              <span>Confirm</span>
              <p>{responseBrief.confirmation}</p>
            </div>
            <div>
              <span>Log</span>
              <p>{responseBrief.log}</p>
            </div>
          </div>
        </article>

        <section className={`transcript-drawer ${transcriptOpen ? "is-open" : ""}`}>
          <button className="transcript-toggle" type="button" onClick={() => setTranscriptOpen((value) => !value)} aria-expanded={transcriptOpen}>
            <span>Voice log</span>
            <em>{transcript.length} entries</em>
          </button>
          {transcriptOpen ? (
            <div className="transcript-list">
              {transcript.map((item) => (
                <article className={`line ${item.role}`} key={item.id}>
                  <div className="line-meta">
                    <span>{item.role === "you" ? "You" : "JERVIS"}</span>
                    <time>{item.time}</time>
                  </div>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <div className="quick-command-grid" aria-label="Quick commands">
          {quickCommands.map((item) => (
            <button
              key={item.command}
              type="button"
              onClick={() => executeLocalCommand(item.command, { echo: true })}
              title={item.command}
              aria-label={item.command}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <form className="text-prompt" onSubmit={sendTextPrompt}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type command"
          />
          <button type="submit" disabled={!draft.trim()} title="Send text command">
            <Send size={18} />
          </button>
        </form>
      </aside>

      {activePendingAction ? (
        <PendingActionModal
          action={activePendingAction}
          onClose={() => setActivePendingAction(null)}
          onConfirm={(options) => resolvePendingAction(activePendingAction.id, "confirm", options)}
          onCancel={() => resolvePendingAction(activePendingAction.id, "cancel")}
        />
      ) : null}

      <JervisBridgePanel />
    </main>
    </>
  );
}

function PanelSection({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`panel-section ${isOpen ? "is-open" : "is-closed"}`}>
      <button className="section-title" type="button" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}>
        {isOpen ? <ChevronDown size={16} /> : <CheckCircle2 size={16} />}
        <h3>{title}</h3>
      </button>
      {isOpen ? <div className="section-body">{children}</div> : null}
    </section>
  );
}

function StatusTile({ icon, label, value }) {
  return (
    <div className="status-tile">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PendingActionModal({ action, onClose, onConfirm, onCancel }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const items = action.draft?.draft?.items || [];
  const isAwaiting = action.status === "awaiting_confirmation";
  const isHighRisk = action.risk === "high_risk_confirmation";
  const canConfirm = isAwaiting && acknowledged && (!isHighRisk || confirmationPhrase === "CONFIRM");

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="confirm-modal" aria-modal="true" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Pending action</p>
            <h2>{action.family}</h2>
          </div>
          <button className="modal-close" type="button" onClick={onClose} title="Close pending action">
            <CircleStop size={18} />
          </button>
        </div>

        <div className="modal-command">
          <CircleAlert size={18} />
          <p>{action.command}</p>
        </div>

        <div className="modal-meta">
          <div className="modal-meta-item">
            <span>Status</span>
            <strong>{action.status}</strong>
          </div>
          <div className="modal-meta-item">
            <span>Risk</span>
            <strong>{action.risk}</strong>
          </div>
          <div className="modal-meta-item">
            <span>Execution</span>
            <strong>{action.execution_state}</strong>
          </div>
        </div>

        {items.length ? (
          <div className="modal-draft">
            <h3>{action.draft?.draft?.title || "Draft action"}</h3>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="modal-note">{action.resolution_note}</p>

        {isAwaiting ? (
          <div className="confirm-gate">
            <label>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                {action.executor_attached
                  ? "I reviewed the draft and understand this will run the attached executor."
                  : "I reviewed the draft and understand no executor is attached yet."}
              </span>
            </label>
            {isHighRisk ? (
              <label>
                <span>Type CONFIRM for high-risk approval</span>
                <input
                  value={confirmationPhrase}
                  onChange={(event) => setConfirmationPhrase(event.target.value)}
                  placeholder="CONFIRM"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="icon-action" type="button" onClick={onClose}>Close</button>
          {isAwaiting ? (
            <>
              <button className="danger-action" type="button" onClick={onCancel}>Cancel</button>
              <button
                className="primary-action"
                type="button"
                disabled={!canConfirm}
                onClick={() => onConfirm({ confirmation_phrase: confirmationPhrase })}
              >
                Confirm
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: "" };
  }

  static getDerivedStateFromError(error) {
    return { error: error?.message || "JERVIS UI crashed." };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-shell">
          <section className="stage">
            <p className="eyebrow">Runtime guard</p>
            <h1>JERVIS</h1>
            <p className="error-line">{this.state.error}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const container = document.getElementById("root");
const root = window.__JARVIS_ROOT__ || createRoot(container);
window.__JARVIS_ROOT__ = root;
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
