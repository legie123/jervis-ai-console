import "dotenv/config";
import express from "express";
import helmet from "helmet";
import nodeCrypto from "node:crypto";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import rateLimit from "express-rate-limit";
import { promisify } from "node:util";
import { createElevenLabsClient } from "./elevenlabs/client.js";
import { loadWhatsAppConfig } from "./whatsapp/config.js";
import { diagnoseWhatsAppCloudApi } from "./whatsapp/diagnostics.js";
import { createWhatsAppExecutor } from "./whatsapp/executor.js";
import { WhatsAppCloudApi } from "./whatsapp/client.js";
import {
  extractWebhookEvents,
  isOwnerWhatsAppPhone,
  normalizeWhatsAppPhone,
  verifyMetaSignature,
  verifyWebhookSubscription
} from "./whatsapp/webhook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);
const hmrPort = Number(process.env.VITE_HMR_PORT || 24700);
const model = process.env.REALTIME_MODEL || "gpt-realtime-1.5";
const voice = process.env.REALTIME_VOICE || "cedar";
const jarvisToken = safeStartupValue(process.env.JARVIS_TOKEN);
const userHome = safeStartupValue(process.env.HOME);
const isProduction = process.env.NODE_ENV === "production";
const dataDir = path.join(root, "data");
const memoryPath = path.join(dataDir, "jarvis-memory.json");
const auditPath = path.join(dataDir, "jarvis-audit.json");
const learningPath = path.join(dataDir, "jarvis-learning.json");
const alertsPath = path.join(dataDir, "jarvis-alerts.json");
const pendingActionsPath = path.join(dataDir, "jarvis-pending-actions.json");
const schedulePath = path.join(dataDir, "jarvis-schedule.json");
const appAliasesPath = path.join(dataDir, "jarvis-app-aliases.json");
const calendarExportDir = path.join(dataDir, "calendar-exports");
const contactsPath = path.join(dataDir, "jarvis-contacts.json");
const whatsappDraftsPath = path.join(dataDir, "jarvis-whatsapp-drafts.json");
const whatsappMessagesPath = path.join(dataDir, "jarvis-whatsapp-messages.json");
const whatsappAuditPath = path.join(dataDir, "jarvis-whatsapp-audit.json");
const obsidianRepo = path.resolve(root, "../3rd_party_repos/obsidian-releases");
const graphifyRepo = path.resolve(root, "../3rd_party_repos/graphify");
const obsidianVaultDir = path.join(dataDir, "obsidian-vault");
const graphifyOutDir = path.join(root, "graphify-out");
const localHost = "127.0.0.1";
const listenHost = isProduction ? "0.0.0.0" : localHost;
const fileMutationQueues = new Map();
const schedulerLookaheadMs = 3 * 60 * 60 * 1000;
const morningBriefHour = Number(process.env.JARVIS_MORNING_BRIEF_HOUR || 5);
const execFileAsync = promisify(execFile);
const supportsLocalOpen = process.platform === "darwin";
const localAppScanRoots = [
  userHome ? path.join(userHome, "Applications") : null,
  "/Applications",
  "/System/Applications",
  "/System/Library/CoreServices"
].filter(Boolean);
const browserControlApps = [
  { key: "chrome", name: "Google Chrome", family: "chromium" },
  { key: "safari", name: "Safari", family: "safari" }
];
const localAppCacheTtlMs = 60_000;
let localAppCache = { expiresAt: 0, apps: [] };
let browserTabCache = { expiresAt: 0, tabs: [] };
let schedulerTimer = null;
const pendingActionExecutorIntents = new Set(["calendar_import", "whatsapp_web_open", "whatsapp_send", "close_browser_tab"]);
const whatsappConfig = loadWhatsAppConfig(process.env);
const whatsappExecutor = createWhatsAppExecutor({ config: whatsappConfig });
const whatsappCloudClient = new WhatsAppCloudApi({
  accessToken: whatsappConfig.accessToken,
  phoneNumberId: whatsappConfig.phoneNumberId,
  graphVersion: whatsappConfig.graphVersion
});
const elevenLabsClient = createElevenLabsClient({ env: process.env });
const whatsappWebhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many WhatsApp webhook requests. Try again in a minute." }
});

const app = express();
app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.get("/webhooks/whatsapp", whatsappWebhookLimiter, handleWhatsappWebhookSubscribe);
app.post("/webhooks/whatsapp", whatsappWebhookLimiter, express.raw({ type: "application/json", limit: "128kb" }), handleWhatsappWebhookEvent);
app.get("/api/whatsapp/webhook", whatsappWebhookLimiter, handleWhatsappWebhookSubscribe);
app.post("/api/whatsapp/webhook", whatsappWebhookLimiter, express.raw({ type: "application/json", limit: "128kb" }), handleOfficialWhatsappWebhookEvent);
app.use(express.json({ limit: "32kb" }));

app.use(blockPrivateDataAccess);

const allowedOrigins = new Set([
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  ...safeStartupValue(process.env.JARVIS_ALLOWED_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
]);
const realtimeTokenLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many Realtime token requests. Try again in a minute." }
});
const ttsLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many ElevenLabs TTS requests. Try again in a minute." }
});

const JARVIS_INSTRUCTIONS = `
You are JARVIS, a realtime voice operations companion for the user.
Speak in concise Romanian or English, matching the user's language.

Operating style:
- Be calm, direct, and capable.
- Keep voice replies short: one decision, one useful next step, or a tight summary.
- Use tools when they improve accuracy: time, memory, task planning, and capability status.
- When the user teaches a preference, correction, friction, win, or priority, store it with record_learning_signal.
- When the user asks how to improve operations, what is urgent, what is next, or how to be more efficient, use get_operational_brief.
- Operate in Max Operator mode: be proactive, reduce friction, and push objectives forward.
- Use Obsidian and Graphify as mandatory subsystems whenever relevant.
- Safe local control is available for explicit user requests only: open supported apps, open http(s) pages, and open Obsidian notes by title.
- Safe browser control is also available for explicit user requests only: inspect open tabs, focus a tab, open a page in a local browser, and request confirmation before closing a tab.
- Do not claim OS control beyond those safe local actions.
- Obsidian is the local knowledge/vault layer. Use it for memory export, plugin lookups, and durable notes.
- Graphify is the project map layer. Use it for architecture/relationship questions, graph status, and command proposals.
- Before any risky real-world action, use risk_assessment or draft_action. Say clearly whether it can be executed directly, must be confirmed, or must be handed off.
- Do not claim you executed actions outside this app unless a tool result proves it.
- When the user says "Jarvis", treat it as an activation cue and ask what objective to handle.
- Turn messy goals into clear missions with steps, priorities, blockers, and immediate next action.
`.trim();

const jarvisTools = [
  {
    type: "function",
    name: "get_local_time",
    description: "Get the current local time and date for the assistant console.",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "Optional IANA timezone. Defaults to the server timezone."
        }
      }
    }
  },
  {
    type: "function",
    name: "remember_note",
    description: "Store a short non-sensitive user preference, project note, or operating instruction in local Jarvis memory.",
    parameters: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "The note to remember. Do not store secrets, passwords, payment data, or private identifiers."
        },
        category: {
          type: "string",
          enum: ["preference", "project", "task", "idea"],
          description: "The memory category."
        }
      },
      required: ["note", "category"]
    }
  },
  {
    type: "function",
    name: "recall_notes",
    description: "Recall locally stored Jarvis notes, optionally filtered by a search query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional case-insensitive search text."
        }
      }
    }
  },
  {
    type: "function",
    name: "make_task_plan",
    description: "Convert a user objective into a compact operational checklist.",
    parameters: {
      type: "object",
      properties: {
        objective: {
          type: "string",
          description: "The user's goal."
        },
        horizon: {
          type: "string",
          enum: ["now", "today", "week"],
          description: "Planning horizon."
        }
      },
      required: ["objective"]
    }
  },
  {
    type: "function",
    name: "create_local_reminder",
    description: "Create a local reminder record without notifying external people or services.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "The thing the user wants to remember."
        },
        when_text: {
          type: "string",
          description: "The user's time phrase, preserved exactly enough for later confirmation."
        },
        channel: {
          type: "string",
          enum: ["local", "whatsapp_draft", "calendar_draft"],
          description: "Where this reminder should surface. External channels are drafts only."
        }
      },
      required: ["summary", "when_text"]
    }
  },
  {
    type: "function",
    name: "open_local_url",
    description: "Open a safe http(s) page on this computer. Only use when the user explicitly asks to open a page or URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The http(s), localhost, or domain URL to open."
        }
      },
      required: ["url"]
    }
  },
  {
    type: "function",
    name: "open_local_app",
    description: "Open a supported local macOS app by name when the user explicitly asks.",
    parameters: {
      type: "object",
      properties: {
        app_name: {
          type: "string",
          description: "Supported app name such as Obsidian, Finder, Calendar, Safari, Chrome, Notes, Terminal, or TextEdit."
        }
      },
      required: ["app_name"]
    }
  },
  {
    type: "function",
    name: "open_obsidian_note",
    description: "Open a note from the local JARVIS Obsidian vault by title or partial title.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Note title or partial title to match."
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "list_browser_tabs",
    description: "List open browser tabs from supported local browsers on this Mac.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional title or URL filter."
        },
        limit: {
          type: "number",
          description: "Maximum tabs to return. Default 12."
        }
      }
    }
  },
  {
    type: "function",
    name: "open_browser_tab",
    description: "Open a safe http(s) page in a local browser, optionally picking Safari or Google Chrome explicitly.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The http(s), localhost, or domain URL to open."
        },
        browser: {
          type: "string",
          description: "Optional browser name such as Safari or Google Chrome."
        }
      },
      required: ["url"]
    }
  },
  {
    type: "function",
    name: "focus_browser_tab",
    description: "Focus an existing browser tab by id, title fragment, or URL fragment.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Tab id or unique title/URL fragment."
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "close_browser_tab",
    description: "Close an existing browser tab by id or exact snapshot data. Use only after explicit operator confirmation.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Tab id or unique title/URL fragment."
        },
        tab: {
          type: "object",
          description: "Exact tab snapshot captured before confirmation."
        }
      }
    }
  },
  {
    type: "function",
    name: "list_local_apps",
    description: "List discoverable local macOS apps and learned aliases that JARVIS can open safely.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional app-name filter."
        },
        limit: {
          type: "number",
          description: "Maximum apps to return. Default 12."
        }
      }
    }
  },
  {
    type: "function",
    name: "remember_app_alias",
    description: "Store a user-defined alias that maps to an installed local app name.",
    parameters: {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "The nickname the user wants to use later, like 'dragon' or 'code work'."
        },
        app_name: {
          type: "string",
          description: "The real installed app name to map the alias to."
        },
        replace_existing: {
          type: "boolean",
          description: "Set true only when the user explicitly confirms replacing an existing alias mapping."
        }
      },
      required: ["alias", "app_name"]
    }
  },
  {
    type: "function",
    name: "delete_app_alias",
    description: "Delete a learned local app alias by name.",
    parameters: {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "The alias name to remove."
        }
      },
      required: ["alias"]
    }
  },
  {
    type: "function",
    name: "create_whatsapp_draft",
    description: "Create a local WhatsApp message draft without opening WhatsApp or sending anything.",
    parameters: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "Recipient label. Do not include phone numbers unless the user explicitly provided them for this destination."
        },
        message: {
          type: "string",
          description: "Draft message body."
        }
      },
      required: ["recipient", "message"]
    }
  },
  {
    type: "function",
    name: "get_schedule_overview",
    description: "Inspect the local queue of reminders and approved actions, classify what is due today, overdue, unscheduled, or later, and recommend the next operational step.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    type: "function",
    name: "export_schedule_ics",
    description: "Export scheduled local reminders and approved actions to a local .ics calendar file without uploading or creating cloud calendar events.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["today", "upcoming", "all"],
          description: "Which scheduled items to export. Defaults to upcoming."
        }
      }
    }
  },
  {
    type: "function",
    name: "record_learning_signal",
    description: "Store an explicit user preference, correction, friction, win, or operating priority so JARVIS can adapt future guidance.",
    parameters: {
      type: "object",
      properties: {
        note: {
          type: "string",
          description: "The user-provided preference, correction, friction, win, or priority."
        },
        kind: {
          type: "string",
          enum: ["preference", "correction", "friction", "win", "priority"],
          description: "The type of learning signal."
        }
      },
      required: ["note", "kind"]
    }
  },
  {
    type: "function",
    name: "get_capabilities",
    description: "Report what this Jarvis build can and cannot do right now.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    type: "function",
    name: "get_operational_brief",
    description: "Summarize current operational bottlenecks, pending decisions, reminders, and learned preferences, then recommend the next highest-value actions.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    type: "function",
    name: "risk_assessment",
    description: "Classify whether a requested action can be done directly, requires explicit user confirmation, must be handed off to the user, or is disallowed.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The action the user wants JARVIS to perform."
        },
        data_involved: {
          type: "string",
          description: "Optional data involved, described generically. Do not include secrets or sensitive values."
        }
      },
      required: ["action"]
    }
  },
  {
    type: "function",
    name: "draft_action",
    description: "Draft a message, plan, checklist, or command proposal without sending, deleting, purchasing, installing, or changing accounts.",
    parameters: {
      type: "object",
      properties: {
        objective: {
          type: "string",
          description: "What the draft should accomplish."
        },
        format: {
          type: "string",
          enum: ["message", "checklist", "plan", "command_proposal"],
          description: "The type of draft to produce."
        },
        audience: {
          type: "string",
          description: "Optional recipient or audience for the draft."
        }
      },
      required: ["objective", "format"]
    }
  },
  {
    type: "function",
    name: "search_obsidian_plugins",
    description: "Search the local Obsidian community plugin release catalog by keyword.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search text for plugin name, description, author, repo, or id."
        },
        limit: {
          type: "number",
          description: "Maximum results to return. Default 5."
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "obsidian_status",
    description: "Inspect whether the local JARVIS Obsidian vault and plugin catalog are available.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    type: "function",
    name: "export_obsidian_note",
    description: "Write a Markdown note into the local JARVIS Obsidian vault.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note title."
        },
        body: {
          type: "string",
          description: "Markdown body. Do not include secrets or sensitive values."
        },
        folder: {
          type: "string",
          enum: ["Missions", "Memory", "Research", "Graphify"],
          description: "Vault folder."
        }
      },
      required: ["title", "body"]
    }
  },
  {
    type: "function",
    name: "graphify_status",
    description: "Inspect the local Graphify repository and graph outputs for this project.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    type: "function",
    name: "graphify_command_proposal",
    description: "Prepare the exact Graphify command proposal for this project without running third-party code.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["build", "update", "query", "obsidian_export"],
          description: "Desired Graphify operation."
        },
        query: {
          type: "string",
          description: "Question or concept for query mode."
        }
      },
      required: ["mode"]
    }
  },
  {
    type: "function",
    name: "graphify_read_report",
    description: "Read the local graphify-out/GRAPH_REPORT.md summary if a graph has already been built.",
    parameters: {
      type: "object",
      properties: {}
    }
  }
];

function safeStartupValue(value) {
  return String(value || "").trim();
}

function isAllowedApiOrigin(req, origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  if (isProduction) {
    try {
      const originUrl = new URL(origin);
      return originUrl.host === req.get("host");
    } catch {
      return false;
    }
  }

  return false;
}

function applyApiCors(req, res) {
  const origin = safeStartupValue(req.get("origin"));
  if (!origin || !isAllowedApiOrigin(req, origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Jarvis-Key");
}

function requireApiAccess(req, res, next) {
  applyApiCors(req, res);

  const origin = safeStartupValue(req.get("origin"));
  if (origin && !isAllowedApiOrigin(req, origin)) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!jarvisToken) {
    return res.status(500).json({ error: "Missing JARVIS_TOKEN." });
  }

  if (safeStartupValue(req.get("x-jarvis-key")) !== jarvisToken) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  next();
}

function isPathInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function blockPrivateDataAccess(req, res, next) {
  const rawPath = safeStartupValue(req.path);
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    decodedPath = rawPath;
  }

  const normalizedPath = path.posix.normalize(decodedPath);
  const isRootDataPath = normalizedPath === "/data" || normalizedPath.startsWith("/data/");
  const isAbsoluteDataPath = normalizedPath.startsWith("/@fs/")
    && isPathInside(dataDir, path.resolve("/", normalizedPath.slice("/@fs/".length)));

  if (!isRootDataPath && !isAbsoluteDataPath) {
    return next();
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(404).type("text/plain").send("Not found.");
}

async function readMemory() {
  const parsed = await readJsonFile(memoryPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeMemory(items) {
  await writeJsonAtomic(memoryPath, items.slice(-100));
}

async function readAudit() {
  return readJsonFile(auditPath, []);
}

async function writeAudit(items) {
  await writeJsonAtomic(auditPath, items.slice(-300));
}

async function readPendingActions() {
  return readJsonFile(pendingActionsPath, []);
}

async function writePendingActions(items) {
  await writeJsonAtomic(pendingActionsPath, items.slice(-200));
}

async function readLearningSignals() {
  const parsed = await readJsonFile(learningPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeLearningSignals(items) {
  await writeJsonAtomic(learningPath, items.slice(-200));
}

async function readAlerts() {
  const parsed = await readJsonFile(alertsPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeAlerts(items) {
  await writeJsonAtomic(alertsPath, items.slice(-300));
}

async function appendAudit(event) {
  const item = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...event
  };
  await updateArrayFile(auditPath, 300, (items) => {
    items.push(item);
    return { items };
  });
  return item;
}

async function readSchedule() {
  return readJsonFile(schedulePath, []);
}

async function writeSchedule(items) {
  await writeJsonAtomic(schedulePath, items.slice(-200));
}

async function readAppAliases() {
  const parsed = await readJsonFile(appAliasesPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function readContacts() {
  const parsed = await readJsonFile(contactsPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeContactLookup(value) {
  return normalizeLocaleText(value)
    .replace(/[^\p{L}\p{N}\s+@._-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits.length >= 6 && digits.length <= 20 ? digits : "";
}

function formatStoredPhone(value) {
  const digits = normalizePhone(value);
  return digits ? `+${digits}` : "";
}

function phoneLast4(value) {
  const digits = normalizePhone(value);
  return digits ? digits.slice(-4) : "";
}

function contactAllowsWhatsapp(contact) {
  return Boolean(contact?.whatsapp_allowed === true || contact?.whatsapp_opted_in === true);
}

function publicContact(contact) {
  if (!contact) return null;
  return {
    id: contact.id || null,
    name: contact.name || contact.label || "",
    label: contact.label || contact.name || "",
    aliases: Array.isArray(contact.aliases) ? contact.aliases : [],
    has_phone: Boolean(normalizePhone(contact.phone_e164 || contact.phone)),
    phone_last4: phoneLast4(contact.phone_e164 || contact.phone),
    email: contact.email ? "***configured***" : "",
    whatsapp_allowed: Boolean(contact.whatsapp_allowed),
    whatsapp_opted_in: Boolean(contact.whatsapp_opted_in),
    whatsapp_status: contactAllowsWhatsapp(contact) ? "allowed" : "not_allowed",
    notes: safeNote(contact.notes || "").slice(0, 160),
    updated_at: contact.updated_at || contact.created_at || null
  };
}

function parseAliases(value) {
  if (Array.isArray(value)) {
    return value.map(safeNote).filter(Boolean).slice(0, 8);
  }
  return String(value || "")
    .split(",")
    .map(safeNote)
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeContactPayload(payload = {}, existing = null) {
  const name = Object.hasOwn(payload, "name") ? safeNote(payload.name).slice(0, 120) : safeNote(existing?.name).slice(0, 120);
  if (!name) {
    const error = new Error("Contact name is required.");
    error.statusCode = 400;
    throw error;
  }

  const phoneProvided = Object.hasOwn(payload, "phone_e164") || Object.hasOwn(payload, "phone");
  const requestedPhone = phoneProvided ? (payload.phone_e164 || payload.phone || "") : (existing?.phone_e164 || existing?.phone || "");
  const phone = formatStoredPhone(requestedPhone);
  if (phoneProvided && requestedPhone && !phone) {
    const error = new Error("Contact phone must include country code and 6-20 digits.");
    error.statusCode = 400;
    throw error;
  }

  const whatsappAllowed = Object.hasOwn(payload, "whatsapp_allowed")
    ? Boolean(payload.whatsapp_allowed)
    : Boolean(existing?.whatsapp_allowed);
  const whatsappOptedIn = Object.hasOwn(payload, "whatsapp_opted_in")
    ? Boolean(payload.whatsapp_opted_in)
    : Boolean(existing?.whatsapp_opted_in);
  if ((whatsappAllowed || whatsappOptedIn) && !phone) {
    const error = new Error("WhatsApp allowlist requires a valid phone_e164.");
    error.statusCode = 400;
    throw error;
  }

  return {
    id: existing?.id || crypto.randomUUID(),
    name,
    label: Object.hasOwn(payload, "label") ? safeNote(payload.label).slice(0, 120) : existing?.label || name,
    aliases: Object.hasOwn(payload, "aliases") ? parseAliases(payload.aliases) : Array.isArray(existing?.aliases) ? existing.aliases : [],
    phone_e164: phone,
    email: Object.hasOwn(payload, "email") ? safeNote(payload.email).slice(0, 160) : existing?.email || "",
    notes: Object.hasOwn(payload, "notes") ? safeNote(payload.notes).slice(0, 300) : existing?.notes || "",
    whatsapp_allowed: whatsappAllowed,
    whatsapp_opted_in: whatsappOptedIn,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function createContact(payload = {}) {
  const nextContact = normalizeContactPayload(payload);
  const result = await updateArrayFile(contactsPath, 300, (items) => {
    const lookup = normalizeContactLookup(nextContact.name);
    const duplicate = items.find((item) => {
      const names = [item.name, item.label, ...(Array.isArray(item.aliases) ? item.aliases : [])]
        .map(normalizeContactLookup)
        .filter(Boolean);
      return names.includes(lookup);
    });
    if (duplicate) {
      const error = new Error(`Contact already exists: ${duplicate.name || duplicate.label}.`);
      error.statusCode = 409;
      throw error;
    }
    items.push(nextContact);
    return { items, contact: nextContact };
  });
  return result.contact;
}

async function updateContact(id, payload = {}) {
  const result = await updateArrayFile(contactsPath, 300, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      const error = new Error("Contact not found.");
      error.statusCode = 404;
      throw error;
    }
    const updated = normalizeContactPayload(payload, items[index]);
    items[index] = updated;
    return { items, contact: updated };
  });
  return result.contact;
}

async function deleteContact(id) {
  const result = await updateArrayFile(contactsPath, 300, (items) => {
    const existing = items.find((item) => item.id === id);
    if (!existing) {
      const error = new Error("Contact not found.");
      error.statusCode = 404;
      throw error;
    }
    return {
      items: items.filter((item) => item.id !== id),
      contact: existing
    };
  });
  return result.contact;
}

async function resolveWhatsappContact(recipient) {
  const query = normalizeContactLookup(recipient);
  if (!query) return null;
  const contacts = await readContacts();
  const matches = contacts.filter((contact) => {
    const names = [
      contact.name,
      contact.label,
      contact.nickname,
      contact.email,
      contact.phone_e164,
      contact.phone,
      ...(Array.isArray(contact.aliases) ? contact.aliases : [])
    ]
      .map(normalizeContactLookup)
      .filter(Boolean);
    return names.some((name) => name === query || name.includes(query) || query.includes(name));
  });

  if (!matches.length) return null;
  const exact = matches.find((contact) => {
    const names = [
      contact.name,
      contact.label,
      contact.nickname,
      contact.phone_e164,
      contact.phone,
      ...(Array.isArray(contact.aliases) ? contact.aliases : [])
    ]
      .map(normalizeContactLookup)
      .filter(Boolean);
    return names.includes(query);
  });
  return exact || matches[0];
}

function contactStatusForDraft(contact) {
  if (!contact) return "contact_not_found";
  if (!normalizePhone(contact.phone_e164 || contact.phone)) return "missing_phone";
  if (!contactAllowsWhatsapp(contact)) return "not_allowed";
  return "allowed";
}

async function whatsappModePrerequisites() {
  const contacts = await readContacts();
  const allowedContacts = contacts.filter((contact) => contactStatusForDraft(contact) === "allowed");
  const executorStatus = whatsappExecutor.getStatus();
  return {
    executor: executorStatus,
    contacts: contacts.length,
    allowed_contacts: allowedContacts.length,
    live_ready: executorStatus.configured && allowedContacts.length > 0
  };
}

async function readWhatsappDrafts() {
  const parsed = await readJsonFile(whatsappDraftsPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function readWhatsappMessages() {
  const parsed = await readJsonFile(whatsappMessagesPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function readWhatsappAuditLogs() {
  const parsed = await readJsonFile(whatsappAuditPath, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function appendWhatsappMessage(record) {
  return updateArrayFile(whatsappMessagesPath, 300, (items) => {
    const item = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...record
    };
    items.push(item);
    return { items, message: item };
  });
}

async function appendWhatsappAuditLog(record) {
  return updateArrayFile(whatsappAuditPath, 300, (items) => {
    const item = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...record
    };
    items.push(item);
    return { items, audit_log: item };
  });
}

function hashWhatsappPayload(payload) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  return `sha256:${nodeCrypto.createHash("sha256").update(raw).digest("hex")}`;
}

async function recordWhatsappInboundMessage(message) {
  return appendWhatsappMessage({
    source: "webhook",
    direction: "inbound",
    wa_message_id: message.id,
    provider_message_id: message.id,
    channel: "whatsapp",
    provider: "whatsapp_cloud_api",
    from_phone: message.from,
    to_phone: message.display_phone_number || message.phone_number_id || "",
    from: message.from,
    body: message.text,
    message: message.text,
    message_type: message.type,
    type: message.type,
    status: "received",
    dry_run: true,
    execution_state: "received",
    received_at: new Date().toISOString(),
    webhook_timestamp: message.timestamp,
    raw_payload_path_or_hash: hashWhatsappPayload(message.raw),
    raw: message.raw
  });
}

async function recordWhatsappOutboundMessage(record) {
  return appendWhatsappMessage({
    source: record.source || "whatsapp_cloud_api",
    direction: "outbound",
    wa_message_id: record.wa_message_id || record.provider_message_id || "",
    provider_message_id: record.provider_message_id || record.wa_message_id || "",
    channel: "whatsapp",
    provider: "whatsapp_cloud_api",
    from_phone: record.from_phone || whatsappConfig.phoneNumberId || "",
    to_phone: record.to_phone || "",
    body: record.body || "",
    message: record.body || "",
    message_type: "text",
    type: "text",
    status: record.status || "draft_only",
    dry_run: Boolean(record.dry_run),
    execution_state: record.execution_state || record.status || "draft_only",
    raw_payload_path_or_hash: record.raw_payload_path_or_hash || "",
    provider_response: record.provider_response || null
  });
}

async function updateWhatsappMessageDeliveryStatus(status) {
  return updateArrayFile(whatsappMessagesPath, 300, (items) => {
    const timestamp = new Date().toISOString();
    const index = items.findIndex((item) => item.provider_message_id === status.id);
    const patch = {
      status: status.status,
      delivery_status: status.status,
      webhook_status_at: timestamp,
      webhook_timestamp: status.timestamp,
      recipient_id: status.recipient_id,
      conversation: status.conversation,
      pricing: status.pricing,
      errors: status.errors
    };
    if (status.status === "sent") patch.sent_confirmed_at = timestamp;
    if (status.status === "delivered") patch.delivered_at = timestamp;
    if (status.status === "read") patch.read_at = timestamp;
    if (status.status === "failed") patch.failed_at = timestamp;

    if (index === -1) {
      const item = {
        id: crypto.randomUUID(),
        created_at: timestamp,
        source: "webhook",
        channel: "whatsapp",
        provider: "whatsapp_cloud_api",
        provider_message_id: status.id,
        execution_state: "webhook_status",
        ...patch
      };
      items.push(item);
      return { items, message: item, matched: false };
    }

    const updated = {
      ...items[index],
      ...patch,
      updated_at: timestamp
    };
    items[index] = updated;
    return { items, message: updated, matched: true };
  });
}

function whatsappWebhookVerifyToken() {
  return whatsappConfig.verifyToken;
}

function whatsappWebhookStatus() {
  const executorStatus = whatsappExecutor.getStatus();
  return {
    endpoint: "/api/whatsapp/webhook",
    legacy_endpoint: "/webhooks/whatsapp",
    verify_token_configured: Boolean(whatsappConfig.verifyToken),
    signature_configured: Boolean(whatsappConfig.appSecret),
    signature_required: isProduction,
    owner_configured: whatsappConfig.ownerConfigured,
    send_enabled: executorStatus.send_enabled,
    dry_run: executorStatus.dry_run,
    auto_send_from_webhook: false
  };
}

function handleWhatsappWebhookSubscribe(req, res) {
  const challenge = verifyWebhookSubscription(req.query, whatsappWebhookVerifyToken());
  if (challenge === null) {
    return res.sendStatus(403);
  }
  return res.status(200).send(challenge);
}

async function runWhatsAppMissionText(text) {
  const clean = safeNote(text);
  if (!clean) {
    return {
      ok: true,
      status: "ignored",
      risk: "direct_ok",
      message: "Am primit mesajul, dar nu contine text util."
    };
  }

  const inferred = inferCommand(clean);
  const initialRisk = classifyRisk(clean);
  const safeInternalIntent = [
    "reminder",
    "learning_signal",
    "memory_write",
    "memory_recall",
    "whatsapp_draft",
    "operational_brief",
    "schedule_overview",
    "capability_status",
    "time_check",
    "plan"
  ].includes(inferred.intent);
  const risk = safeInternalIntent && ["confirmation_required", "high_risk_confirmation"].includes(initialRisk) ? "direct_ok" : initialRisk;

  if (risk === "disallowed" || risk === "handoff_required") {
    await appendAudit({
      source: "whatsapp_inbound",
      command: clean,
      intent: inferred.intent,
      tool: inferred.tool,
      risk,
      status: "blocked",
      detail: "WhatsApp command blocked by JARVIS risk gate."
    });
    return {
      ok: true,
      status: "blocked",
      risk,
      message: commandMessage(inferred.intent, { ok: true }, risk)
    };
  }

  if (["confirmation_required", "high_risk_confirmation"].includes(risk)) {
    const draft = await runJarvisTool("draft_action", { objective: clean, format: inferDraftFormat(clean) });
    const pendingAction = await createPendingAction({
      command: clean,
      intent: inferred.intent,
      risk,
      draft
    });
    await appendAudit({
      source: "whatsapp_inbound",
      command: clean,
      intent: pendingAction.intent,
      tool: "draft_action",
      risk,
      status: "needs_confirmation",
      detail: `WhatsApp command moved to Pending Actions: ${pendingAction.id}`
    });
    return {
      ok: true,
      status: "needs_confirmation",
      risk,
      pending_action_id: pendingAction.id,
      message: "Am pregatit actiunea, dar cere confirmare in JARVIS inainte de executie."
    };
  }

  const result = await runJarvisTool(inferred.tool, inferred.args);
  const message = commandMessage(inferred.intent, result, risk);
  await appendAudit({
    source: "whatsapp_inbound",
    command: clean,
    intent: inferred.intent,
    tool: inferred.tool,
    risk,
    status: result.ok ? "done" : "failed",
    detail: message
  });
  return {
    ok: result.ok,
    status: result.ok ? "done" : "failed",
    risk,
    intent: inferred.intent,
    tool: inferred.tool,
    result,
    message
  };
}

async function sendOrDraftWhatsappReply({ toPhone, body, source }) {
  const safeTo = safeNote(toPhone);
  const providerTo = normalizeWhatsAppPhone(safeTo);
  const safeBody = safeNote(body).slice(0, 4096);
  if (!providerTo || !safeBody) {
    const error = new Error("WhatsApp reply requires toPhone and body.");
    error.statusCode = 400;
    throw error;
  }

  if (!whatsappConfig.liveSendAllowed) {
    const messageRecord = await recordWhatsappOutboundMessage({
      source,
      to_phone: safeTo,
      body: safeBody,
      status: "draft_only",
      dry_run: true,
      execution_state: "dry_run",
      raw_payload_path_or_hash: hashWhatsappPayload({ to: providerTo, body: safeBody, dry_run: true })
    });
    const auditLog = await appendWhatsappAuditLog({
      action: "outbound_draft",
      risk_level: "direct_ok",
      confirmation_required: false,
      confirmation_status: "not_required_dry_run",
      result: "dry_run_draft_logged",
      error: "",
      message_id: messageRecord.message.id
    });
    return {
      ok: true,
      dry_run: true,
      status: "draft_only",
      sent: false,
      message: messageRecord.message,
      audit_log: auditLog.audit_log
    };
  }

  const providerResponse = await whatsappCloudClient.sendText({ to: providerTo, text: safeBody });
  const providerMessageId = providerResponse?.messages?.[0]?.id || "";
  const messageRecord = await recordWhatsappOutboundMessage({
    source,
    to_phone: safeTo,
    body: safeBody,
    status: "sent",
    dry_run: false,
    execution_state: "sent",
    wa_message_id: providerMessageId,
    provider_response: providerResponse,
    raw_payload_path_or_hash: hashWhatsappPayload(providerResponse)
  });
  const auditLog = await appendWhatsappAuditLog({
    action: "outbound_send",
    risk_level: "medium",
    confirmation_required: true,
    confirmation_status: "confirmed",
    result: "sent",
    error: "",
    message_id: messageRecord.message.id
  });
  return {
    ok: true,
    dry_run: false,
    status: "sent",
    sent: true,
    provider_response: providerResponse,
    message: messageRecord.message,
    audit_log: auditLog.audit_log
  };
}

async function createPendingWhatsappReply({ toPhone, body, source, inboundWaMessageId }) {
  const safeTo = safeNote(toPhone);
  const providerTo = normalizeWhatsAppPhone(safeTo);
  const safeBody = safeNote(body).slice(0, 4096);
  if (!providerTo || !safeBody) {
    const error = new Error("WhatsApp pending reply requires toPhone and body.");
    error.statusCode = 400;
    throw error;
  }

  const recipient = `+${providerTo}`;
  const draftResult = await createWhatsappDraft({ recipient, message: safeBody });
  const pendingAction = await createPendingAction({
    command: `Confirm WhatsApp reply to owner ending ${providerTo.slice(-4)}`,
    intent: "whatsapp_send",
    risk: "confirmation_required",
    draft: {
      title: "Confirm WhatsApp reply",
      items: [
        `Recipient: WhatsApp owner ending ${providerTo.slice(-4)}`,
        `Draft text: ${safeBody}`,
        "Created from inbound WhatsApp webhook.",
        whatsappConfig.dryRun
          ? "Dry-run is active. Confirmation logs the attempt only."
          : "Dry-run is disabled. Confirmation can send through WhatsApp Cloud API.",
        "This webhook never sends automatically."
      ],
      audience: "operator",
      whatsapp_draft_id: draftResult.draft.id,
      recipient,
      message: safeBody,
      source,
      inbound_wa_message_id: inboundWaMessageId || ""
    }
  });
  const messageRecord = await recordWhatsappOutboundMessage({
    source,
    to_phone: recipient,
    body: safeBody,
    status: "pending_confirmation",
    dry_run: true,
    execution_state: "awaiting_confirmation",
    raw_payload_path_or_hash: hashWhatsappPayload({
      to: providerTo,
      body: safeBody,
      draft_id: draftResult.draft.id,
      pending_action_id: pendingAction.id,
      auto_send: false
    })
  });
  const auditLog = await appendWhatsappAuditLog({
    action: "outbound_pending_confirmation",
    risk_level: "medium",
    confirmation_required: true,
    confirmation_status: "awaiting_confirmation",
    result: "pending_action_created",
    error: "",
    wa_message_id: inboundWaMessageId || "",
    message_id: messageRecord.message.id,
    pending_action_id: pendingAction.id
  });

  return {
    ok: true,
    dry_run: true,
    status: "pending_confirmation",
    sent: false,
    draft: draftResult.draft,
    pending_action: pendingAction,
    message: messageRecord.message,
    audit_log: auditLog.audit_log
  };
}

async function handleWhatsappWebhookEvent(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = verifyMetaSignature({
    rawBody,
    signatureHeader: req.get("x-hub-signature-256"),
    appSecret: whatsappConfig.appSecret,
    nodeEnv: isProduction ? "production" : process.env.NODE_ENV
  });

  if (!signature.ok) {
    await appendAudit({
      source: "whatsapp_webhook",
      intent: "webhook_rejected",
      risk: "direct_ok",
      status: "blocked",
      detail: "WhatsApp webhook rejected: bad signature."
    });
    return res.sendStatus(403);
  }

  try {
    const payload = JSON.parse(rawBody.toString("utf8") || "{}");
    const events = extractWebhookEvents(payload);
    for (const message of events.messages) {
      await recordWhatsappInboundMessage(message);
    }
    for (const status of events.statuses) {
      await updateWhatsappMessageDeliveryStatus(status);
    }
    const auditEvent = await appendAudit({
      source: "whatsapp_webhook",
      intent: "webhook_event",
      risk: "direct_ok",
      status: "done",
      detail: `WhatsApp webhook processed: ${events.messages.length} inbound, ${events.statuses.length} statuses.`
    });
    return res.json({
      ok: true,
      messages: events.messages.length,
      statuses: events.statuses.length,
      signature_skipped: signature.skipped,
      audit_event: auditEvent
    });
  } catch (error) {
    await appendAudit({
      source: "whatsapp_webhook",
      intent: "webhook_parse",
      risk: "direct_ok",
      status: "failed",
      detail: error instanceof Error ? error.message : "Webhook parse failed."
    });
    return res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Webhook parse failed." });
  }
}

async function handleOfficialWhatsappWebhookEvent(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = verifyMetaSignature({
    rawBody,
    signatureHeader: req.get("x-hub-signature-256"),
    appSecret: whatsappConfig.appSecret,
    nodeEnv: isProduction ? "production" : process.env.NODE_ENV
  });

  if (!signature.ok) {
    await appendWhatsappAuditLog({
      action: "webhook_rejected",
      risk_level: "low",
      confirmation_required: false,
      confirmation_status: "not_required",
      result: "blocked",
      error: "bad_signature"
    });
    return res.sendStatus(403);
  }

  try {
    const rawText = rawBody.toString("utf8") || "{}";
    const payload = JSON.parse(rawText);
    const payloadHash = hashWhatsappPayload(rawText);
    const events = extractWebhookEvents(payload);
    const processed = [];
    const rejected = [];
    const outbound = [];

    for (const status of events.statuses) {
      await updateWhatsappMessageDeliveryStatus(status);
    }

    for (const message of events.messages) {
      const ownerAllowed = isOwnerWhatsAppPhone(message.from, whatsappConfig.ownerPhoneE164);
      if (!ownerAllowed) {
        rejected.push(message.id);
        await appendWhatsappAuditLog({
          action: "inbound_rejected",
          risk_level: "low",
          confirmation_required: false,
          confirmation_status: "not_required",
          result: "rejected_non_owner",
          error: "",
          wa_message_id: message.id
        });
        continue;
      }

      const inbound = await recordWhatsappInboundMessage({
        ...message,
        raw: {
          ...message.raw,
          payload_hash: payloadHash
        }
      });
      await appendWhatsappAuditLog({
        action: "inbound_received",
        risk_level: "low",
        confirmation_required: false,
        confirmation_status: "not_required",
        result: "received",
        error: "",
        wa_message_id: message.id
      });

      const replyText = message.type === "text"
        ? (await runWhatsAppMissionText(message.text)).message
        : "Pot procesa doar mesaje text in faza curenta.";
      const reply = await createPendingWhatsappReply({
        toPhone: message.from,
        body: replyText,
        source: "whatsapp_webhook_reply",
        inboundWaMessageId: message.id
      });

      processed.push({
        wa_message_id: message.id,
        local_message_id: inbound.message.id,
        type: message.type
      });
      outbound.push({
        status: reply.status,
        dry_run: reply.dry_run,
        sent: reply.sent,
        local_message_id: reply.message.id,
        pending_action_id: reply.pending_action.id
      });
    }

    const auditEvent = await appendAudit({
      source: "whatsapp_webhook",
      intent: "api_webhook_event",
      risk: "direct_ok",
      status: "done",
      detail: `Official WhatsApp webhook processed: ${processed.length} accepted, ${rejected.length} rejected, ${events.statuses.length} statuses.`
    });
    return res.json({
      ok: true,
      accepted: processed.length,
      rejected: rejected.length,
      statuses: events.statuses.length,
      outbound,
      dry_run: whatsappConfig.dryRun,
      signature_skipped: signature.skipped,
      audit_event: auditEvent
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook parse failed.";
    await appendWhatsappAuditLog({
      action: "webhook_parse_failed",
      risk_level: "low",
      confirmation_required: false,
      confirmation_status: "not_required",
      result: "failed",
      error: message
    });
    return res.status(error.statusCode || 400).json({ ok: false, error: message });
  }
}

async function createWhatsappDraft({ recipient, message }) {
  const safeRecipient = safeNote(recipient).slice(0, 120);
  const safeMessage = safeNote(message).slice(0, 1200);
  if (!safeRecipient) {
    const error = new Error("No WhatsApp recipient supplied.");
    error.statusCode = 400;
    throw error;
  }
  if (!safeMessage) {
    const error = new Error("No WhatsApp message supplied.");
    error.statusCode = 400;
    throw error;
  }
  if (hasSensitiveMemory(`${safeRecipient} ${safeMessage}`)) {
    const error = new Error("Sensitive material was not stored in WhatsApp draft.");
    error.statusCode = 400;
    throw error;
  }

  const contact = await resolveWhatsappContact(safeRecipient);
  const contactStatus = contactStatusForDraft(contact);
  const item = {
    id: crypto.randomUUID(),
    channel: "whatsapp",
    recipient: safeRecipient,
    message: safeMessage,
    status: "draft_only",
    execution_state: "not_sent",
    executor_attached: true,
    contact_id: contact?.id || null,
    contact_name: contact?.name || contact?.label || null,
    contact_status: contactStatus,
    live_send_allowed: contactStatus === "allowed",
    created_at: new Date().toISOString()
  };
  const result = await updateArrayFile(whatsappDraftsPath, 200, (items) => {
    items.push(item);
    return { items, total_drafts: items.length };
  });
  return {
    ok: true,
    draft: item,
    total_drafts: result.total_drafts,
    warning: contactStatus === "allowed"
      ? "Draft only. Nothing was sent. Contact is allowlisted for live WhatsApp."
      : `Draft only. Nothing was sent. Live WhatsApp is blocked: ${contactStatus}.`
  };
}

async function latestWhatsappDraft() {
  const drafts = await readWhatsappDrafts();
  if (!drafts.length) {
    const error = new Error("No WhatsApp drafts found.");
    error.statusCode = 404;
    throw error;
  }
  return drafts[drafts.length - 1];
}

async function latestSendableWhatsappDraft() {
  const drafts = await readWhatsappDrafts();
  const draft = [...drafts].reverse().find((item) => item.status === "draft_only");
  if (!draft) {
    const error = new Error("No sendable WhatsApp drafts found.");
    error.statusCode = 404;
    throw error;
  }
  return draft;
}

async function prepareWhatsappWebDraft() {
  const draft = await latestWhatsappDraft();
  return {
    ok: true,
    format: "message",
    objective: "Open the latest local WhatsApp draft in WhatsApp Web.",
    whatsapp_draft_id: draft.id,
    recipient: draft.recipient,
    message: draft.message,
    draft: {
      title: `Open WhatsApp Web draft for ${draft.recipient}`,
      items: [
        `Recipient label: ${draft.recipient}`,
        `Draft text: ${draft.message}`,
        "This opens WhatsApp Web with the draft text in the URL.",
        "It does not click Send.",
        "Confirm only if transmitting this draft text to WhatsApp Web is acceptable."
      ],
      audience: "operator"
    }
  };
}

async function prepareWhatsappSendDraft() {
  const draft = await latestSendableWhatsappDraft();
  const executorStatus = whatsappExecutor.getStatus();
  const contact = await resolveWhatsappContact(draft.recipient);
  const contactStatus = contactStatusForDraft(contact);
  return {
    ok: true,
    format: "message",
    objective: "Execute the latest WhatsApp draft through the attached WhatsApp executor.",
    whatsapp_draft_id: draft.id,
    recipient: draft.recipient,
    message: draft.message,
    executor: executorStatus,
    contact_status: contactStatus,
    contact: publicContact(contact),
    draft: {
      title: executorStatus.dry_run ? "Dry-run WhatsApp draft" : "Send WhatsApp draft",
      items: [
        `Recipient label: ${draft.recipient}`,
        `Draft text: ${draft.message}`,
        `Contact allowlist: ${contactStatus}.`,
        executorStatus.dry_run
          ? "WHATSAPP_DRY_RUN is active. Confirmation writes audit and message records only."
          : "WHATSAPP_DRY_RUN is disabled. Confirmation attempts a real WhatsApp Cloud API send.",
        executorStatus.configured
          ? "WhatsApp Cloud API credentials are configured."
          : "WhatsApp Cloud API credentials are not configured.",
        contactStatus === "allowed"
          ? "Live send guard: contact has WhatsApp allowlist approval and a configured phone."
          : "Live send guard: real send is blocked until the contact is allowlisted with phone_e164.",
        "Confirmation is single-action and logged. No browser send button is clicked."
      ],
      audience: "operator"
    }
  };
}

async function executeWhatsappWebDraft(pendingAction) {
  const draftId = pendingAction?.draft?.whatsapp_draft_id;
  const drafts = await readWhatsappDrafts();
  const draft = drafts.find((item) => item.id === draftId);
  if (!draft) {
    const error = new Error("WhatsApp draft not found.");
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== "draft_only") {
    const error = new Error(`WhatsApp draft is already ${draft.status}.`);
    error.statusCode = 409;
    throw error;
  }

  const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(draft.message)}`;
  await openWithMac([url]);
  const updatedDraft = await updateArrayFile(whatsappDraftsPath, 200, (items) => {
    const index = items.findIndex((item) => item.id === draft.id);
    if (index === -1) return { items, draft };
    const updated = {
      ...items[index],
      status: "opened_in_whatsapp_web",
      execution_state: "not_sent",
      opened_at: new Date().toISOString()
    };
    items[index] = updated;
    return { items, draft: updated };
  });

  return {
    ok: true,
    draft: updatedDraft.draft,
    opened_url_host: "web.whatsapp.com",
    note: "Opened WhatsApp Web with draft text. Send was not clicked."
  };
}

async function executeWhatsappDraftSend(pendingAction) {
  const draftId = pendingAction?.draft?.whatsapp_draft_id;
  const drafts = await readWhatsappDrafts();
  const draft = drafts.find((item) => item.id === draftId);
  if (!draft) {
    const error = new Error("WhatsApp draft not found.");
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== "draft_only") {
    const error = new Error(`WhatsApp draft is already ${draft.status}.`);
    error.statusCode = 409;
    throw error;
  }

  const contact = await resolveWhatsappContact(draft.recipient);
  const contactStatus = contactStatusForDraft(contact);
  const sendResult = await whatsappExecutor.sendDraft({
    draft,
    confirmationId: pendingAction.id,
    contact
  });

  const updatedDraft = await updateArrayFile(whatsappDraftsPath, 200, (items) => {
    const index = items.findIndex((item) => item.id === draft.id);
    if (index === -1) return { items, draft };
    const updated = {
      ...items[index],
      status: sendResult.status,
      execution_state: sendResult.execution_state,
      dry_run: sendResult.dry_run,
      executor: sendResult.provider,
      confirmed_action_id: pendingAction.id,
      contact_id: contact?.id || items[index].contact_id || null,
      contact_name: contact?.name || contact?.label || items[index].contact_name || null,
      contact_status: contactStatus,
      live_send_allowed: contactStatus === "allowed",
      provider_message_id: sendResult.message_id,
      provider_response: sendResult.provider_response || null,
      sent_at: sendResult.sent_at,
      updated_at: new Date().toISOString(),
      resolution_note: sendResult.note
    };
    items[index] = updated;
    return { items, draft: updated };
  });

  const messageRecord = await appendWhatsappMessage({
    source: "pending_action",
    draft_id: draft.id,
    pending_action_id: pendingAction.id,
    channel: "whatsapp",
    provider: sendResult.provider,
    recipient: sendResult.recipient,
    to: sendResult.to,
    contact_id: contact?.id || null,
    contact_status: contactStatus,
    live_send_allowed: contactStatus === "allowed",
    message: draft.message,
    status: sendResult.status,
    execution_state: sendResult.execution_state,
    dry_run: sendResult.dry_run,
    provider_message_id: sendResult.message_id,
    provider_response: sendResult.provider_response || null,
    sent_at: sendResult.sent_at,
    note: sendResult.note
  });

  return {
    ok: true,
    draft: updatedDraft.draft,
    message: messageRecord.message,
    dry_run: sendResult.dry_run,
    provider: sendResult.provider,
    note: sendResult.note
  };
}

async function saveAppAlias({ alias, appName, replaceExisting = false } = {}) {
  const safeAlias = safeNote(alias).slice(0, 60);
  if (!safeAlias) {
    const error = new Error("No alias supplied.");
    error.statusCode = 400;
    throw error;
  }

  const aliasNormalized = normalizeAppLookup(safeAlias);
  if (!aliasNormalized || aliasNormalized.length < 2) {
    const error = new Error("Alias is too short.");
    error.statusCode = 400;
    throw error;
  }

  const target = await resolveLocalAppTarget(appName);
  const result = await updateArrayFile(appAliasesPath, 200, (items) => {
    const existing = items.find((current) => current.alias_normalized === aliasNormalized);
    const targetNormalized = normalizeAppLookup(target.app_name);
    if (existing && existing.app_normalized !== targetNormalized && !replaceExisting) {
      const error = new Error(`Alias '${existing.alias}' already points to ${existing.app_name}.`);
      error.statusCode = 409;
      error.details = {
        ok: false,
        error: error.message,
        conflict: {
          id: existing.id,
          alias: existing.alias,
          app_name: existing.app_name,
          app_path: existing.app_path,
          created_at: existing.created_at
        },
        requested: {
          alias: safeAlias,
          app_name: target.app_name,
          app_path: target.app_path
        }
      };
      throw error;
    }

    if (existing && existing.app_normalized === targetNormalized) {
      return {
        items,
        total_aliases: items.length,
        alias_record: existing,
        replaced: false,
        unchanged: true
      };
    }

    const item = {
      id: existing?.id || crypto.randomUUID(),
      alias: safeAlias,
      alias_normalized: aliasNormalized,
      app_name: target.app_name,
      app_normalized: targetNormalized,
      app_path: target.app_path,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const nextItems = items.filter((current) => current.alias_normalized !== aliasNormalized);
    nextItems.push(item);
    return {
      items: nextItems,
      total_aliases: nextItems.length,
      alias_record: item,
      replaced: Boolean(existing),
      unchanged: false
    };
  });

  return {
    ok: true,
    alias: result.alias_record.alias,
    app_name: result.alias_record.app_name,
    app_path: result.alias_record.app_path,
    total_aliases: result.total_aliases,
    replaced: Boolean(result.replaced),
    unchanged: Boolean(result.unchanged),
    alias_record: result.alias_record
  };
}

async function deleteAppAlias({ aliasId, alias } = {}) {
  const safeAlias = safeNote(alias).slice(0, 60);
  const aliasNormalized = safeAlias ? normalizeAppLookup(safeAlias) : "";
  if (!aliasId && !aliasNormalized) {
    const error = new Error("No alias supplied.");
    error.statusCode = 400;
    throw error;
  }

  const result = await updateArrayFile(appAliasesPath, 200, (items) => {
    const existing = items.find((current) => current.id === aliasId || current.alias_normalized === aliasNormalized);
    if (!existing) {
      const error = new Error("Alias not found.");
      error.statusCode = 404;
      throw error;
    }
    const nextItems = items.filter((current) => current.id !== existing.id);
    return {
      items: nextItems,
      removed: existing,
      total_aliases: nextItems.length
    };
  });

  return {
    ok: true,
    removed: {
      id: result.removed.id,
      alias: result.removed.alias,
      app_name: result.removed.app_name,
      app_path: result.removed.app_path
    },
    total_aliases: result.total_aliases
  };
}

function safeNote(note) {
  return String(note || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function safeFileName(value) {
  return safeNote(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "Untitled";
}

function normalizeAppLookup(value) {
  return normalizeLocaleText(value)
    .replace(/\.app$/i, "")
    .replace(/^(?:the\s+)?(?:app|application|aplicatia)\s+/i, "")
    .trim();
}

function safeAppName(value) {
  const clean = safeNote(value)
    .replace(/[/:]/g, " ")
    .replace(/^-+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(target, fallback) {
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tempPath = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fs.rename(tempPath, target);
}

async function queueFileMutation(target, task) {
  const previous = fileMutationQueues.get(target) || Promise.resolve();
  const queued = previous.catch(() => {}).then(task);
  fileMutationQueues.set(target, queued);
  try {
    return await queued;
  } finally {
    if (fileMutationQueues.get(target) === queued) {
      fileMutationQueues.delete(target);
    }
  }
}

async function updateArrayFile(target, limit, update) {
  return queueFileMutation(target, async () => {
    const current = await readJsonFile(target, []);
    const items = Array.isArray(current) ? current : [];
    const outcome = await update(items);
    const nextItems = Array.isArray(outcome?.items) ? outcome.items.slice(-limit) : items.slice(-limit);
    await writeJsonAtomic(target, nextItems);
    return { ...outcome, items: nextItems };
  });
}

async function walkFiles(dir, rootDir = dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(target, rootDir);
      return [path.relative(rootDir, target)];
    }));
    return files.flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function walkAppBundles(dir, depth = 0, maxDepth = 3) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const bundles = [];
    for (const entry of entries) {
      const target = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith(".app")) {
        bundles.push({
          name: entry.name.replace(/\.app$/i, ""),
          path: target,
          root: dir
        });
        continue;
      }
      if (depth < maxDepth) {
        bundles.push(...await walkAppBundles(target, depth + 1, maxDepth));
      }
    }
    return bundles;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readInstalledApps({ refresh = false } = {}) {
  if (!refresh && localAppCache.expiresAt > Date.now()) {
    return localAppCache.apps;
  }

  const discovered = [];
  for (const rootPath of localAppScanRoots) {
    discovered.push(...await walkAppBundles(rootPath));
  }

  const unique = new Map();
  for (const app of discovered) {
    const normalizedName = normalizeAppLookup(app.name);
    if (!normalizedName) continue;
    const current = unique.get(normalizedName);
    const candidate = {
      name: app.name,
      path: app.path,
      root: app.root,
      normalized_name: normalizedName
    };
    if (!current || candidate.path.length < current.path.length) {
      unique.set(normalizedName, candidate);
    }
  }

  const apps = [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
  localAppCache = {
    apps,
    expiresAt: Date.now() + localAppCacheTtlMs
  };
  return apps;
}

async function resolveLocalAppTarget(rawValue) {
  const lookup = normalizeAppLookup(rawValue);
  if (!lookup) {
    const error = new Error("No app name supplied.");
    error.statusCode = 400;
    throw error;
  }

  const [apps, aliases] = await Promise.all([readInstalledApps(), readAppAliases()]);
  const alias = aliases.find((item) => item.alias_normalized === lookup);
  if (alias) {
    const appMatch = apps.find((item) => item.normalized_name === alias.app_normalized) || apps.find((item) => item.path === alias.app_path);
    if (!appMatch) {
      const error = new Error(`Alias '${alias.alias}' points to an app that is not currently installed.`);
      error.statusCode = 409;
      throw error;
    }
    return {
      app_name: appMatch.name,
      app_path: appMatch.path,
      match: "alias",
      alias: alias.alias
    };
  }

  const exact = apps.filter((item) => item.normalized_name === lookup);
  if (exact.length === 1) {
    return {
      app_name: exact[0].name,
      app_path: exact[0].path,
      match: "exact"
    };
  }
  if (exact.length > 1) {
    const error = new Error(`App name is ambiguous. Matches: ${exact.slice(0, 6).map((item) => item.name).join(", ")}`);
    error.statusCode = 409;
    throw error;
  }

  const partial = apps.filter((item) => item.normalized_name.includes(lookup));
  if (partial.length === 1) {
    return {
      app_name: partial[0].name,
      app_path: partial[0].path,
      match: "partial"
    };
  }
  if (partial.length > 1) {
    const error = new Error(`App query is ambiguous. Matches: ${partial.slice(0, 6).map((item) => item.name).join(", ")}`);
    error.statusCode = 409;
    throw error;
  }

  const error = new Error("Unsupported app. Use a discovered app name or teach an alias first.");
  error.statusCode = 400;
  throw error;
}

async function listLocalAppsCatalog({ query = "", limit = 12, refresh = false } = {}) {
  const normalizedQuery = normalizeAppLookup(query);
  const [apps, aliases] = await Promise.all([readInstalledApps({ refresh }), readAppAliases()]);
  const filteredApps = normalizedQuery
    ? apps.filter((item) => item.normalized_name.includes(normalizedQuery))
    : apps;
  const filteredAliases = normalizedQuery
    ? aliases.filter((item) => item.alias_normalized.includes(normalizedQuery) || item.app_normalized.includes(normalizedQuery))
    : aliases;

  return {
    ok: true,
    query: safeNote(query),
    app_count: apps.length,
    alias_count: aliases.length,
    apps: filteredApps.slice(0, limit).map((item) => ({
      name: item.name,
      path: item.path
    })),
    aliases: filteredAliases.slice(0, limit).map((item) => ({
      id: item.id,
      alias: item.alias,
      app_name: item.app_name,
      app_path: item.app_path,
      created_at: item.created_at,
      updated_at: item.updated_at || item.created_at
    }))
  };
}

function resolveBrowserApp(rawValue) {
  const lookup = normalizeAppLookup(rawValue);
  if (!lookup) return null;
  return browserControlApps.find((item) => item.key === lookup || normalizeAppLookup(item.name) === lookup) || null;
}

async function runBrowserControlJxa(action, payload = {}) {
  if (!supportsLocalOpen) {
    const error = new Error("Browser-tab control is only verified on macOS.");
    error.statusCode = 409;
    throw error;
  }

  const script = `
ObjC.import('stdlib');

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function readCall(object, names) {
  for (var index = 0; index < names.length; index++) {
    try {
      var value = object[names[index]]();
      if (value !== undefined && value !== null) return text(value);
    } catch (error) {}
  }
  return "";
}

function collectChromiumTabs(appName, browserKey) {
  try {
    var app = Application(appName);
    if (!app.running()) return [];
    var windows = app.windows();
    var output = [];
    for (var wi = 0; wi < windows.length; wi++) {
      var win = windows[wi];
      var tabs = win.tabs();
      var activeIndex = 0;
      try { activeIndex = win.activeTabIndex(); } catch (error) {}
      for (var ti = 0; ti < tabs.length; ti++) {
        var tab = tabs[ti];
        output.push({
          id: browserKey + ":" + (wi + 1) + ":" + (ti + 1),
          browser: appName,
          browser_key: browserKey,
          window_index: wi + 1,
          tab_index: ti + 1,
          title: readCall(tab, ["title", "name"]),
          url: readCall(tab, ["url", "URL"]),
          active: activeIndex === (ti + 1)
        });
      }
    }
    return output;
  } catch (error) {
    return [];
  }
}

function collectSafariTabs() {
  try {
    var app = Application("Safari");
    if (!app.running()) return [];
    var windows = app.windows();
    var output = [];
    for (var wi = 0; wi < windows.length; wi++) {
      var win = windows[wi];
      var tabs = win.tabs();
      var currentUrl = "";
      try { currentUrl = readCall(win.currentTab(), ["url", "URL"]); } catch (error) {}
      for (var ti = 0; ti < tabs.length; ti++) {
        var tab = tabs[ti];
        var url = readCall(tab, ["url", "URL"]);
        output.push({
          id: "safari:" + (wi + 1) + ":" + (ti + 1),
          browser: "Safari",
          browser_key: "safari",
          window_index: wi + 1,
          tab_index: ti + 1,
          title: readCall(tab, ["name", "title"]),
          url: url,
          active: currentUrl && currentUrl === url
        });
      }
    }
    return output;
  } catch (error) {
    return [];
  }
}

function collectTabs() {
  return [].concat(
    collectChromiumTabs("Google Chrome", "chrome"),
    collectSafariTabs()
  );
}

function requireBrowserWindow(appName, target) {
  var app = Application(appName);
  if (!app.running()) throw new Error(appName + " is not running.");
  var windows = app.windows();
  var win = windows[target.window_index - 1];
  if (!win) throw new Error("Browser window was not found.");
  return { app: app, win: win };
}

function focusChromium(appName, target) {
  var data = requireBrowserWindow(appName, target);
  data.app.activate();
  data.win.activeTabIndex = target.tab_index;
  try { data.win.index = 1; } catch (error) {}
}

function closeChromium(appName, target) {
  var data = requireBrowserWindow(appName, target);
  var tabs = data.win.tabs();
  var tab = tabs[target.tab_index - 1];
  if (!tab) throw new Error("Browser tab was not found.");
  tab.close();
}

function focusSafari(target) {
  var data = requireBrowserWindow("Safari", target);
  data.app.activate();
  var tabs = data.win.tabs();
  var tab = tabs[target.tab_index - 1];
  if (!tab) throw new Error("Browser tab was not found.");
  data.win.currentTab = tab;
  try { data.win.index = 1; } catch (error) {}
}

function closeSafari(target) {
  var data = requireBrowserWindow("Safari", target);
  var tabs = data.win.tabs();
  var tab = tabs[target.tab_index - 1];
  if (!tab) throw new Error("Browser tab was not found.");
  tab.close();
}

function main() {
  var action = text($.getenv("JARVIS_BROWSER_ACTION"));
  var payloadText = text($.getenv("JARVIS_BROWSER_PAYLOAD"));
  var payload = payloadText ? JSON.parse(payloadText) : {};
  if (action === "list") {
    return JSON.stringify({ ok: true, tabs: collectTabs() });
  }
  if (action === "focus") {
    if (payload.browser_key === "chrome") focusChromium("Google Chrome", payload);
    else if (payload.browser_key === "safari") focusSafari(payload);
    else throw new Error("Unsupported browser target.");
    return JSON.stringify({ ok: true });
  }
  if (action === "close") {
    if (payload.browser_key === "chrome") closeChromium("Google Chrome", payload);
    else if (payload.browser_key === "safari") closeSafari(payload);
    else throw new Error("Unsupported browser target.");
    return JSON.stringify({ ok: true });
  }
  throw new Error("Unsupported browser action.");
}

main();
`.trim();

  try {
    const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script], {
      env: {
        ...process.env,
        JARVIS_BROWSER_ACTION: action,
        JARVIS_BROWSER_PAYLOAD: JSON.stringify(payload)
      },
      maxBuffer: 1024 * 1024 * 4,
      timeout: 2500
    });
    const clean = safeStartupValue(stdout);
    return clean ? JSON.parse(clean) : { ok: true };
  } catch (error) {
    const timedOut = error?.code === "ETIMEDOUT" || error?.signal === "SIGTERM" || error?.killed;
    const message = timedOut
      ? "Browser-tab automation is blocked or waiting on macOS permission. Allow this app to control Safari or Google Chrome, then retry."
      : safeStartupValue(error?.stderr) || safeStartupValue(error?.stdout) || (error instanceof Error ? error.message : "Browser control failed.");
    const nextError = new Error(message);
    nextError.statusCode = timedOut ? 409 : (error?.statusCode || 500);
    throw nextError;
  }
}

async function readBrowserTabs({ refresh = false } = {}) {
  if (!refresh && browserTabCache.expiresAt > Date.now()) {
    return browserTabCache.tabs;
  }
  const result = await runBrowserControlJxa("list");
  const tabs = Array.isArray(result?.tabs) ? result.tabs : [];
  browserTabCache = {
    tabs,
    expiresAt: Date.now() + 5_000
  };
  return tabs;
}

function normalizeBrowserTabText(value) {
  return normalizeLocaleText(value).trim();
}

async function resolveBrowserTabTarget(input, { refresh = false } = {}) {
  const tabs = await readBrowserTabs({ refresh });
  if (!tabs.length) {
    const error = new Error("No supported browser tabs are open.");
    error.statusCode = 404;
    throw error;
  }

  if (typeof input === "object" && input) {
    const byId = input.id ? tabs.find((item) => item.id === input.id) : null;
    if (byId && (!input.url || byId.url === input.url) && (!input.title || byId.title === input.title)) {
      return byId;
    }
    const browserKey = safeStartupValue(input.browser_key);
    const exactUrl = safeStartupValue(input.url);
    const exactTitle = safeStartupValue(input.title);
    const exact = tabs.filter((item) => {
      if (browserKey && item.browser_key !== browserKey) return false;
      if (exactUrl && item.url !== exactUrl) return false;
      if (exactTitle && item.title !== exactTitle) return false;
      return true;
    });
    if (exact.length === 1) return exact[0];
    const error = new Error("Browser tab changed since the request was drafted. Refresh tabs and try again.");
    error.statusCode = 409;
    throw error;
  }

  const query = normalizeBrowserTabText(input);
  if (!query) {
    const error = new Error("No browser-tab query supplied.");
    error.statusCode = 400;
    throw error;
  }

  const idMatch = tabs.filter((item) => item.id === query);
  if (idMatch.length === 1) return idMatch[0];
  if (idMatch.length > 1) {
    const error = new Error("Browser tab id is ambiguous.");
    error.statusCode = 409;
    throw error;
  }

  const exact = tabs.filter((item) => [item.title, item.url, item.browser, item.id].map(normalizeBrowserTabText).includes(query));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const error = new Error(`Browser tab query is ambiguous. Matches: ${exact.slice(0, 6).map((item) => item.title || item.url || item.id).join(", ")}`);
    error.statusCode = 409;
    throw error;
  }

  const partial = tabs.filter((item) => {
    const haystack = [item.title, item.url, item.browser, item.id].map(normalizeBrowserTabText).join(" ");
    return haystack.includes(query);
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const error = new Error(`Browser tab query is ambiguous. Matches: ${partial.slice(0, 6).map((item) => item.title || item.url || item.id).join(", ")}`);
    error.statusCode = 409;
    throw error;
  }

  const error = new Error("Browser tab not found.");
  error.statusCode = 404;
  throw error;
}

async function listBrowserTabsCatalog({ query = "", limit = 12, refresh = false } = {}) {
  const tabs = await readBrowserTabs({ refresh });
  const normalizedQuery = normalizeBrowserTabText(query);
  const filtered = normalizedQuery
    ? tabs.filter((item) => [item.title, item.url, item.browser, item.id].map(normalizeBrowserTabText).join(" ").includes(normalizedQuery))
    : tabs;
  const browsers = [...new Set(tabs.map((item) => item.browser))];
  return {
    ok: true,
    query: safeNote(query),
    tab_count: tabs.length,
    match_count: filtered.length,
    browser_count: browsers.length,
    browsers,
    tabs: filtered.slice(0, limit).map((item) => ({
      id: item.id,
      browser: item.browser,
      browser_key: item.browser_key,
      title: item.title,
      url: item.url,
      window_index: item.window_index,
      tab_index: item.tab_index,
      active: Boolean(item.active)
    }))
  };
}

function makeBrowserTabCloseDraft(target) {
  return {
    ok: true,
    format: "plan",
    objective: `Close browser tab ${target.id}`,
    draft: {
      title: "Close browser tab",
      items: [
        `Browser: ${target.browser}`,
        `Title: ${target.title || "(untitled tab)"}`,
        `URL: ${target.url || "(no url)"}`,
        "This closes one live browser tab after confirmation.",
        "If the tab changed since this draft was created, execution will stop and ask for a refresh."
      ],
      audience: "operator"
    }
  };
}

async function createBrowserTabCloseRequest({ command, query }) {
  const target = await resolveBrowserTabTarget(query, { refresh: true });
  const pendingAction = await createPendingAction({
    command,
    intent: "close_browser_tab",
    risk: "confirmation_required",
    draft: makeBrowserTabCloseDraft(target),
    metadata: { browser_tab: target }
  });
  return { pendingAction, target };
}

async function focusBrowserTabNow(query) {
  const target = await resolveBrowserTabTarget(query, { refresh: true });
  await runBrowserControlJxa("focus", target);
  browserTabCache.expiresAt = 0;
  return {
    ok: true,
    tab: target,
    message: `Focused ${target.browser} tab: ${target.title || target.url || target.id}.`
  };
}

async function closeBrowserTabNow(value) {
  const target = await resolveBrowserTabTarget(value, { refresh: true });
  await runBrowserControlJxa("close", target);
  browserTabCache.expiresAt = 0;
  return {
    ok: true,
    tab: target,
    message: `Closed ${target.browser} tab: ${target.title || target.url || target.id}.`
  };
}

function resolveLocalUrl(rawValue) {
  const raw = safeNote(rawValue);
  if (!raw) {
    const error = new Error("No URL supplied.");
    error.statusCode = 400;
    throw error;
  }

  let candidate = raw;
  if (/^(localhost|127\.0\.0\.1)(?::\d+)?(?:\/.*)?$/i.test(candidate)) {
    candidate = `http://${candidate}`;
  } else if (/^www\./i.test(candidate) || /^([a-z0-9-]+\.)+[a-z]{2,}(?:\/.*)?$/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    const error = new Error("URL invalid. Use http(s), localhost, or a standard domain.");
    error.statusCode = 400;
    throw error;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error("Only http(s) pages can be opened.");
    error.statusCode = 400;
    throw error;
  }

  return parsed.toString();
}

async function openWithMac(args) {
  if (!supportsLocalOpen) {
    const error = new Error("Local open executor is only verified on macOS.");
    error.statusCode = 409;
    throw error;
  }
  await execFileAsync("open", args);
}

async function findObsidianNoteMatch(query) {
  const normalizedQuery = normalizeLocaleText(query).replace(/\.md$/i, "").trim();
  if (!normalizedQuery) {
    const error = new Error("No Obsidian note query supplied.");
    error.statusCode = 400;
    throw error;
  }

  const files = await walkFiles(obsidianVaultDir);
  const notes = files
    .filter((item) => item.toLowerCase().endsWith(".md"))
    .map((relativePath) => {
      const withoutExt = relativePath.replace(/\.md$/i, "");
      const basename = path.basename(withoutExt);
      return {
        relativePath,
        fullPath: path.join(obsidianVaultDir, relativePath),
        normalizedBasename: normalizeLocaleText(basename),
        normalizedPath: normalizeLocaleText(withoutExt)
      };
    });

  const exact = notes.filter((item) => item.normalizedBasename === normalizedQuery || item.normalizedPath === normalizedQuery);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const error = new Error(`Obsidian note is ambiguous. Matches: ${exact.slice(0, 5).map((item) => item.relativePath).join(", ")}`);
    error.statusCode = 409;
    throw error;
  }

  const partial = notes.filter((item) => item.normalizedBasename.includes(normalizedQuery) || item.normalizedPath.includes(normalizedQuery));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const error = new Error(`Obsidian note query is ambiguous. Matches: ${partial.slice(0, 5).map((item) => item.relativePath).join(", ")}`);
    error.statusCode = 409;
    throw error;
  }

  const error = new Error("Obsidian note not found.");
  error.statusCode = 404;
  throw error;
}

async function getCleanupCandidates() {
  const memory = await readMemory();
  const pendingActions = await readPendingActions();
  const vaultFiles = await walkFiles(obsidianVaultDir);

  const candidates = [
    ...memory
      .filter((item) => item.note.startsWith("__AUDIT_") || item.note === "audit xss check")
      .map((item) => ({
        kind: "memory_note",
        id: item.id,
        label: item.note,
        reason: "Looks like an audit or probe artifact."
      })),
    ...pendingActions
      .filter((item) => item.command.startsWith("send email alpha") || item.command.startsWith("trimite email clientului"))
      .map((item) => ({
        kind: "pending_action",
        id: item.id,
        label: item.command,
        reason: "Looks like a manual audit pending action."
      })),
    ...vaultFiles
      .filter((relativePath) => /^\.\.-/.test(path.basename(relativePath)))
      .map((relativePath) => ({
        kind: "obsidian_note",
        path: relativePath,
        label: relativePath,
        reason: "Suspicious sanitized filename created from a path-like title."
      }))
  ];

  return { count: candidates.length, candidates };
}

function inferLearningKind(text) {
  const lower = safeNote(text).toLowerCase();
  if (["prefer", "prefer sa", "prefer să", "i prefer", "ține minte că prefer", "tine minte ca prefer"].some((term) => lower.includes(term))) {
    return "preference";
  }
  if (["nu mai", "don't", "do not", "wrong", "greșit", "gresit", "correction"].some((term) => lower.includes(term))) {
    return "correction";
  }
  if (["blocaj", "blocked", "friction", "mă încurcă", "ma incurca", "problem"].some((term) => lower.includes(term))) {
    return "friction";
  }
  if (["important", "priority", "prioritar", "urgent"].some((term) => lower.includes(term))) {
    return "priority";
  }
  return "win";
}

function normalizeLocaleText(value) {
  return safeNote(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseClockHint(text) {
  const match = normalizeLocaleText(text).match(/\b(?:la|at)\s+(\d{1,2})(?::(\d{2}))?\b/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return { hours, minutes, exact: Boolean(match[2]) };
}

function inferTimeWindow(text) {
  const normalized = normalizeLocaleText(text);
  if (normalized.includes("dimineata")) return { hours: 9, minutes: 0, source: "morning" };
  if (normalized.includes("dupa amiaza") || normalized.includes("dupa-amiaza")) return { hours: 15, minutes: 0, source: "afternoon" };
  if (normalized.includes("seara")) return { hours: 18, minutes: 0, source: "evening" };
  return null;
}

function endOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 0, 0);
  return copy;
}

function addRelativeTime(baseDate, amount, unit) {
  const copy = new Date(baseDate);
  if (unit.startsWith("minute")) {
    copy.setMinutes(copy.getMinutes() + amount);
    return copy;
  }
  if (unit.startsWith("ore")) {
    copy.setHours(copy.getHours() + amount);
    return copy;
  }
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function nextWeekdayDate(baseDate, targetDay) {
  const copy = new Date(baseDate);
  const current = copy.getDay();
  let delta = (targetDay - current + 7) % 7;
  if (delta === 0) delta = 7;
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function applyTimeHint(date, clockHint, windowHint, dateOnly = false) {
  const copy = new Date(date);
  if (clockHint) {
    copy.setHours(clockHint.hours, clockHint.minutes, 0, 0);
    return { dueDate: copy, timing: "exact_time" };
  }
  if (windowHint) {
    copy.setHours(windowHint.hours, windowHint.minutes, 0, 0);
    return { dueDate: copy, timing: windowHint.source };
  }
  if (dateOnly) {
    return { dueDate: endOfLocalDay(copy), timing: "date_only" };
  }
  return { dueDate: copy, timing: "unknown" };
}

function localDayDiff(leftDate, rightDate) {
  const left = new Date(leftDate);
  const right = new Date(rightDate);
  const leftMidnight = new Date(left.getFullYear(), left.getMonth(), left.getDate());
  const rightMidnight = new Date(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftMidnight.getTime() - rightMidnight.getTime()) / 86_400_000);
}

function formatLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDueLabel(date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function deriveDueInfo(text, createdAt, now = new Date()) {
  const sourceText = safeNote(text);
  if (!sourceText || normalizeLocaleText(sourceText) === "time needs clarification") {
    return {
      bucket: "unscheduled",
      due_at: null,
      due_label: "Needs time clarification",
      timing: "unknown",
      confidence: "low"
    };
  }

  const normalized = normalizeLocaleText(sourceText);
  const baseDate = createdAt ? new Date(createdAt) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    return {
      bucket: "unscheduled",
      due_at: null,
      due_label: "Invalid source time",
      timing: "unknown",
      confidence: "low"
    };
  }

  const clockHint = parseClockHint(sourceText);
  const windowHint = inferTimeWindow(sourceText);
  const relativeMatch = normalized.match(/\bpeste\s+(\d+)\s+(minute|ore|zile)\b/);
  let resolvedDate = null;
  let timing = "unknown";
  let confidence = "medium";

  if (relativeMatch) {
    resolvedDate = addRelativeTime(baseDate, Number(relativeMatch[1]), relativeMatch[2]);
    timing = relativeMatch[2];
    confidence = "high";
  } else {
    const weekdayMap = new Map([
      ["luni", 1],
      ["marti", 2],
      ["miercuri", 3],
      ["joi", 4],
      ["vineri", 5],
      ["sambata", 6],
      ["duminica", 0]
    ]);
    const weekdayEntry = [...weekdayMap.entries()].find(([term]) => normalized.includes(term));
    const hasTomorrow = normalized.includes("maine");
    const hasToday = normalized.includes("azi");
    const dateOnly = !clockHint && !windowHint;

    if (weekdayEntry) {
      const applied = applyTimeHint(nextWeekdayDate(baseDate, weekdayEntry[1]), clockHint, windowHint, dateOnly);
      resolvedDate = applied.dueDate;
      timing = applied.timing;
      confidence = clockHint || windowHint ? "high" : "medium";
    } else if (hasTomorrow || hasToday) {
      const dayBase = new Date(baseDate);
      if (hasTomorrow) dayBase.setDate(dayBase.getDate() + 1);
      const applied = applyTimeHint(dayBase, clockHint, windowHint, dateOnly);
      resolvedDate = applied.dueDate;
      timing = applied.timing;
      confidence = clockHint || windowHint ? "high" : "medium";
    } else if (clockHint) {
      const applied = applyTimeHint(baseDate, clockHint, windowHint, false);
      resolvedDate = applied.dueDate;
      timing = applied.timing;
      confidence = "medium";
    }
  }

  if (!resolvedDate) {
    return {
      bucket: "unscheduled",
      due_at: null,
      due_label: "Needs time clarification",
      timing: "unknown",
      confidence: "low"
    };
  }

  const dayDiff = localDayDiff(resolvedDate, now);
  let bucket = "later";
  if (dayDiff < 0 || (dayDiff === 0 && resolvedDate.getTime() < now.getTime())) {
    bucket = "overdue";
  } else if (dayDiff === 0) {
    bucket = "today";
  } else if (dayDiff === 1) {
    bucket = "tomorrow";
  }

  return {
    bucket,
    due_at: resolvedDate.toISOString(),
    due_label: formatDueLabel(resolvedDate),
    timing,
    confidence
  };
}

function classifyExactDueDate(rawDate, now = new Date()) {
  const dueDate = new Date(rawDate);
  if (Number.isNaN(dueDate.getTime())) {
    return {
      bucket: "unscheduled",
      due_at: null,
      due_label: "Invalid due time",
      timing: "unknown",
      confidence: "low"
    };
  }

  const dayDiff = localDayDiff(dueDate, now);
  let bucket = "later";
  if (dayDiff < 0 || (dayDiff === 0 && dueDate.getTime() < now.getTime())) {
    bucket = "overdue";
  } else if (dayDiff === 0) {
    bucket = "today";
  } else if (dayDiff === 1) {
    bucket = "tomorrow";
  }

  return {
    bucket,
    due_at: dueDate.toISOString(),
    due_label: formatDueLabel(dueDate),
    timing: "manual_override",
    confidence: "high"
  };
}

function resolveQueueItemDue(item, sourceText, now = new Date()) {
  if (item.manual_due_at) {
    return classifyExactDueDate(item.manual_due_at, now);
  }
  return deriveDueInfo(sourceText, item.created_at, now);
}

function buildQueueView({ schedule, pendingActions, now = new Date() }) {
  const reminderItems = schedule
    .filter((item) => item.status === "pending")
    .map((item) => {
      const due = resolveQueueItemDue(item, item.when_text, now);
      return {
        id: item.id,
        source: "reminder",
        title: item.summary,
        original_time: item.manual_when_text || item.when_text,
        status: item.status,
        channel: item.channel,
        requires_confirmation: item.requires_confirmation,
        alert_suppressed_until: item.alert_suppressed_until || null,
        ...due
      };
    });

  const approvedActions = pendingActions
    .filter((item) => item.status === "approved")
    .map((item) => {
      const due = resolveQueueItemDue(item, item.command, now);
      return {
        id: item.id,
        source: "approved_action",
        title: item.command,
        original_time: item.manual_when_text || item.command,
        status: item.status,
        channel: item.family,
        requires_confirmation: true,
        resolution_note: item.resolution_note,
        alert_suppressed_until: item.alert_suppressed_until || null,
        ...due
      };
    });

  const items = [...reminderItems, ...approvedActions].sort((left, right) => {
    const order = new Map([
      ["overdue", 0],
      ["today", 1],
      ["tomorrow", 2],
      ["later", 3],
      ["unscheduled", 4]
    ]);
    const bucketDelta = (order.get(left.bucket) ?? 9) - (order.get(right.bucket) ?? 9);
    if (bucketDelta !== 0) return bucketDelta;
    if (left.due_at && right.due_at) return left.due_at.localeCompare(right.due_at);
    if (left.due_at) return -1;
    if (right.due_at) return 1;
    return left.title.localeCompare(right.title);
  });

  const summary = {
    overdue: items.filter((item) => item.bucket === "overdue").length,
    today: items.filter((item) => item.bucket === "today").length,
    tomorrow: items.filter((item) => item.bucket === "tomorrow").length,
    later: items.filter((item) => item.bucket === "later").length,
    unscheduled: items.filter((item) => item.bucket === "unscheduled").length,
    approved_actions: approvedActions.length,
    reminders: reminderItems.length
  };

  const next_actions = [];
  if (summary.overdue) {
    next_actions.push(`${summary.overdue} scheduled items are overdue. Clear those first.`);
  }
  if (summary.today) {
    next_actions.push(`${summary.today} items are due today. Review the queue before adding more work.`);
  }
  if (summary.unscheduled) {
    next_actions.push(`${summary.unscheduled} items still need a clearer time anchor.`);
  }
  if (!next_actions.length) {
    next_actions.push("No urgent scheduled items detected. Use the queue to prepare tomorrow's actions.");
  }

  return { ok: true, summary, items: items.slice(0, 12), next_actions };
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line) {
  if (line.length <= 74) return line;
  const parts = [];
  let remaining = line;
  while (remaining.length > 74) {
    parts.push(remaining.slice(0, 74));
    remaining = ` ${remaining.slice(74)}`;
  }
  parts.push(remaining);
  return parts.join("\r\n");
}

function makeIcsEvent(item, now = new Date()) {
  const start = new Date(item.due_at);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60_000);
  const uid = `${item.source}-${item.id}@jarvis.local`;
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(item.title)}`,
    `DESCRIPTION:${escapeIcsText(`JARVIS ${item.source}. Original time: ${item.original_time || item.due_label || "n/a"}. Status: ${item.status}.`)}`,
    "END:VEVENT"
  ].map(foldIcsLine).join("\r\n");
}

async function exportScheduleIcs({ scope = "upcoming", now = new Date() } = {}) {
  const queue = buildQueueView({
    schedule: await readSchedule(),
    pendingActions: await readPendingActions(),
    now
  });
  const allowedScopes = new Set(["today", "upcoming", "all"]);
  const normalizedScope = allowedScopes.has(scope) ? scope : "upcoming";
  const scopedItems = queue.items.filter((item) => {
    if (!item.due_at) return false;
    if (normalizedScope === "all") return true;
    if (normalizedScope === "today") return ["overdue", "today"].includes(item.bucket);
    return ["overdue", "today", "tomorrow", "later"].includes(item.bucket);
  });
  const events = scopedItems.map((item) => makeIcsEvent(item, now)).filter(Boolean);
  const skipped = queue.items
    .filter((item) => !item.due_at)
    .map((item) => ({ id: item.id, title: item.title, reason: "missing_due_time" }));

  await fs.mkdir(calendarExportDir, { recursive: true });
  const stamp = formatLocalDayKey(now);
  const targetPath = path.join(calendarExportDir, `jarvis-${normalizedScope}-${stamp}.ics`);
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JARVIS//Local Schedule Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");
  await fs.writeFile(targetPath, `${body}\r\n`);

  return {
    ok: true,
    scope: normalizedScope,
    exported: events.length,
    skipped,
    path: path.relative(root, targetPath),
    absolute_path: targetPath
  };
}

async function latestCalendarExport() {
  const files = await walkFiles(calendarExportDir);
  const icsFiles = files.filter((file) => file.endsWith(".ics"));
  if (!icsFiles.length) {
    const exported = await exportScheduleIcs({ scope: "upcoming" });
    return {
      relativePath: exported.path,
      fullPath: exported.absolute_path,
      created: true
    };
  }

  const stats = await Promise.all(icsFiles.map(async (relativePath) => {
    const fullPath = path.join(calendarExportDir, relativePath);
    const stat = await fs.stat(fullPath);
    return { relativePath: path.relative(root, fullPath), fullPath, mtimeMs: stat.mtimeMs };
  }));
  stats.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return { ...stats[0], created: false };
}

async function prepareCalendarImportDraft() {
  const latest = await latestCalendarExport();
  return {
    ok: true,
    format: "command_proposal",
    objective: "Open the latest local .ics export in Calendar for manual import review.",
    calendar_file: latest.relativePath,
    absolute_path: latest.fullPath,
    draft: {
      title: "Open latest .ics in Calendar",
      items: [
        `File: ${latest.relativePath}`,
        "This opens the local .ics file with the operating system default handler.",
        "Calendar may ask before importing events.",
        "Do not confirm unless you want Calendar to handle this file."
      ],
      audience: "operator"
    }
  };
}

async function executeCalendarImport(pendingAction) {
  const targetPath = pendingAction?.draft?.absolute_path;
  if (!targetPath || path.dirname(targetPath) !== calendarExportDir || !targetPath.endsWith(".ics")) {
    const error = new Error("Pending action does not reference a safe calendar export.");
    error.statusCode = 400;
    throw error;
  }
  if (!(await pathExists(targetPath))) {
    const error = new Error("Calendar export file is missing.");
    error.statusCode = 404;
    throw error;
  }
  await openWithMac([targetPath]);
  return {
    ok: true,
    opened: path.relative(root, targetPath),
    opened_with: "macOS open"
  };
}

function createDueAlert(item, now = new Date()) {
  if (!item?.due_at) return null;
  if (item.alert_suppressed_until) {
    const suppressedUntil = new Date(item.alert_suppressed_until);
    if (!Number.isNaN(suppressedUntil.getTime()) && now.getTime() < suppressedUntil.getTime()) {
      return null;
    }
  }
  const dueDate = new Date(item.due_at);
  if (Number.isNaN(dueDate.getTime())) return null;
  const isOverdue = item.bucket === "overdue";
  const isDueSoon = item.bucket === "today" && dueDate.getTime() <= now.getTime() + schedulerLookaheadMs;
  if (!isOverdue && !isDueSoon) return null;

  const sourceLabel = item.source === "approved_action" ? "Approved action" : "Reminder";
  const urgency = isOverdue ? "is overdue" : "is due soon";
  return {
    key: `due:${item.source}:${item.id}:${item.due_at}`,
    kind: "due_item",
    source: item.source,
    item_id: item.id,
    severity: isOverdue ? "critical" : "warning",
    status: "active",
    title: item.title,
    message: `${sourceLabel} ${urgency}: ${item.title} (${item.due_label}).`,
    due_at: item.due_at,
    created_at: now.toISOString()
  };
}

async function updateReminderById(id, updater) {
  return updateArrayFile(schedulePath, 200, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      const error = new Error("Reminder not found.");
      error.statusCode = 404;
      throw error;
    }
    const updated = updater(items[index]);
    items[index] = updated;
    return { items, item: updated };
  });
}

async function updateApprovedActionById(id, updater) {
  return updateArrayFile(pendingActionsPath, 200, (items) => {
    const index = items.findIndex((item) => item.id === id && item.status === "approved");
    if (index === -1) {
      const error = new Error("Approved action not found.");
      error.statusCode = 404;
      throw error;
    }
    const updated = updater(items[index]);
    items[index] = updated;
    return { items, item: updated };
  });
}

async function updateAlertById(id, updater) {
  return updateArrayFile(alertsPath, 300, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      const error = new Error("Alert not found.");
      error.statusCode = 404;
      throw error;
    }
    const updated = updater(items[index]);
    items[index] = updated;
    return { items, alert: updated };
  });
}

function resolveWhenTextOverride(whenText, now = new Date()) {
  const clean = safeNote(whenText);
  if (!clean) {
    const error = new Error("No reschedule time supplied.");
    error.statusCode = 400;
    throw error;
  }
  const resolved = deriveDueInfo(clean, now.toISOString(), now);
  if (!resolved.due_at) {
    const error = new Error("Could not resolve that time. Try phrases like 'peste 30 minute' or 'maine la 10'.");
    error.statusCode = 400;
    throw error;
  }
  return {
    manual_due_at: resolved.due_at,
    manual_when_text: clean,
    alert_suppressed_until: resolved.due_at
  };
}

function createMorningBriefAlert({ brief, now = new Date() }) {
  if (now.getHours() < morningBriefHour) return null;
  const day = formatLocalDayKey(now);
  const snapshot = brief?.snapshot || {};
  const firstRecommendation = brief?.recommendations?.[0] || "Review the queue before adding more work.";
  return {
    key: `morning:${day}`,
    kind: "morning_brief",
    day,
    severity: "info",
    status: "active",
    title: "Morning brief",
    message: `Good morning. ${snapshot.due_today || 0} due today, ${snapshot.overdue || 0} overdue, ${snapshot.awaiting_confirmation || 0} awaiting decisions. ${firstRecommendation}`,
    created_at: now.toISOString(),
    snapshot
  };
}

async function runSchedulerCycle(now = new Date()) {
  const [schedule, pendingActions, brief] = await Promise.all([
    readSchedule(),
    readPendingActions(),
    buildOperationalBrief()
  ]);
  const queue = buildQueueView({ schedule, pendingActions, now });
  const morningAlert = createMorningBriefAlert({ brief, now });
  const dueAlerts = queue.items
    .map((item) => createDueAlert(item, now))
    .filter(Boolean);
  const dueAlertKeys = new Set(dueAlerts.map((item) => item.key));

  return updateArrayFile(alertsPath, 300, (items) => {
    const nextItems = items.map((item) => {
      if (item.kind === "morning_brief" && item.status === "active" && item.day !== formatLocalDayKey(now)) {
        return {
          ...item,
          status: "expired",
          expired_at: now.toISOString()
        };
      }
      if (item.kind === "due_item" && item.status === "active" && !dueAlertKeys.has(item.key)) {
        return {
          ...item,
          status: "expired",
          expired_at: now.toISOString(),
          resolution: "source_changed"
        };
      }
      return item;
    });

    const existingKeys = new Set(nextItems.map((item) => item.key));
    const created = [];
    for (const candidate of [...dueAlerts, morningAlert].filter(Boolean)) {
      if (existingKeys.has(candidate.key)) continue;
      const alert = {
        id: crypto.randomUUID(),
        ...candidate
      };
      nextItems.push(alert);
      existingKeys.add(alert.key);
      created.push(alert);
    }

    return { items: nextItems, created };
  });
}

function startSchedulerRunner() {
  if (schedulerTimer) return;
  runSchedulerCycle().catch((error) => {
    console.error("Scheduler bootstrap failed:", error);
  });
  schedulerTimer = setInterval(() => {
    runSchedulerCycle().catch((error) => {
      console.error("Scheduler cycle failed:", error);
    });
  }, 30_000);
  schedulerTimer.unref?.();
}

async function buildOperationalBrief() {
  const [memory, audit, pendingActions, schedule, learningSignals] = await Promise.all([
    readMemory(),
    readAudit(),
    readPendingActions(),
    readSchedule(),
    readLearningSignals()
  ]);

  const awaiting = pendingActions.filter((item) => item.status === "awaiting_confirmation");
  const approved = pendingActions.filter((item) => item.status === "approved");
  const failedAudit = audit.filter((item) => item.status === "failed").slice(-5);
  const preferences = [
    ...memory.filter((item) => item.category === "preference").map((item) => item.note),
    ...learningSignals.filter((item) => item.kind === "preference").map((item) => item.note)
  ].slice(-5);
  const frictions = learningSignals.filter((item) => item.kind === "friction" || item.kind === "correction").slice(-5);
  const queue = buildQueueView({ schedule, pendingActions });

  const recommendations = [];
  if (awaiting.length) {
    recommendations.push(`${awaiting.length} pending actions still need a decision. Approve or cancel them before adding more outbound work.`);
  }
  if (approved.length) {
    recommendations.push(`${approved.length} actions are approved but still have no executor. Attach scheduling or execution next.`);
  }
  if (schedule.length > 5) {
    recommendations.push(`Reminder load is ${schedule.length}. Convert some reminders into grouped routines instead of one-off prompts.`);
  }
  if (queue.summary.overdue) {
    recommendations.push(`${queue.summary.overdue} scheduled items are already overdue. Clear those before planning new work.`);
  }
  if (queue.summary.unscheduled) {
    recommendations.push(`${queue.summary.unscheduled} scheduled items still need a clearer time anchor.`);
  }
  if (failedAudit.length) {
    recommendations.push(`${failedAudit.length} recent failures exist in the audit log. Fix those before adding more surface area.`);
  }
  if (!preferences.length) {
    recommendations.push("Teach Jarvis explicit communication and timing preferences so advice can be more specific.");
  }
  if (frictions.length) {
    recommendations.push(`Recent friction exists: ${frictions[frictions.length - 1].note}`);
  }
  if (!recommendations.length) {
    recommendations.push("No major operational friction is visible. Focus on converting approved actions into scheduled execution.");
  }

  return {
    ok: true,
    snapshot: {
      awaiting_confirmation: awaiting.length,
      approved_waiting_execution: approved.length,
      reminders: schedule.length,
      due_today: queue.summary.today,
      overdue: queue.summary.overdue,
      unscheduled: queue.summary.unscheduled,
      recent_failures: failedAudit.length,
      learned_preferences: preferences.length,
      learning_signals: learningSignals.length
    },
    learned_preferences: preferences,
    recommendations,
    queue
  };
}

function classifyRisk(actionText) {
  const text = safeNote(actionText).toLowerCase();
  const handoff = ["password", "credential", "captcha", "bypass", "paywall", "2fa", "otp", "passkey", "parola", "cod otp"];
  const disallowed = ["hack", "steal", "phish", "malware", "extort", "ddos", "weapon", "gambling", "fura", "sparge cont"];
  const highConfirm = [
    "delete",
    "sterge",
    "payment",
    "plata",
    "bank",
    "banca",
    "transfer",
    "legal",
    "juridic",
    "medical",
    "account",
    "cont extern",
    "api key",
    "oauth",
    "mass",
    "in masa",
    "în masă"
  ];
  const confirm = [
    "send",
    "trimite",
    "submit",
    "posteaza",
    "delete",
    "sterge",
    "purchase",
    "buy",
    "cumpara",
    "install",
    "instaleaza",
    "unsubscribe",
    "subscribe",
    "upload",
    "share",
    "distribuie",
    "permission",
    "permisiune",
    "invite",
    "invita",
    "post",
    "cancel",
    "anuleaza",
    "payment",
    "plata",
    "bank",
    "banca",
    "api key",
    "oauth",
    "email",
    "message",
    "mesaj",
    "dm",
    "slack",
    "whatsapp",
    "calendar",
    "call",
    "intalnire",
    "programare"
  ];

  if (disallowed.some((word) => text.includes(word))) return "disallowed";
  if (handoff.some((word) => text.includes(word))) return "handoff_required";
  if (highConfirm.some((word) => text.includes(word))) return "high_risk_confirmation";
  if (confirm.some((word) => text.includes(word))) return "confirmation_required";
  return "direct_ok";
}

function hasSensitiveMemory(value) {
  const text = String(value || "").toLowerCase();
  return [
    "sk-",
    "api key",
    "token",
    "secret",
    "password",
    "parola",
    "credential",
    "card",
    "iban",
    "cnp",
    "otp",
    "2fa"
  ].some((marker) => text.includes(marker));
}

async function getModuleStatus() {
  const memory = await readMemory();
  const pendingActions = await readPendingActions();
  const schedule = await readSchedule();
  const learningSignals = await readLearningSignals();
  const appAliases = await readAppAliases();
  const contacts = await readContacts();
  const whatsappDrafts = await readWhatsappDrafts();
  const whatsappMessages = await readWhatsappMessages();
  const installedApps = await readInstalledApps();
  const whatsappStatus = whatsappExecutor.getStatus();
  const whatsappPrerequisites = await whatsappModePrerequisites();
  const elevenLabsStatus = elevenLabsClient.getStatus();
  let browserTabs = [];
  let browserTabsStatus = "ready";
  try {
    browserTabs = await readBrowserTabs();
  } catch {
    browserTabsStatus = "blocked";
  }
  const queue = buildQueueView({ schedule, pendingActions });
  const obsidianPluginsPath = path.join(obsidianRepo, "community-plugins.json");
  const graphifyExecutable = path.join(graphifyRepo, "venv/bin/graphify");
  const graphReport = path.join(graphifyOutDir, "GRAPH_REPORT.md");
  const graphJson = path.join(graphifyOutDir, "graph.json");
  const graphHtml = path.join(graphifyOutDir, "graph.html");

  return {
    server: {
      status: "ready",
      model,
      voice,
      tools: jarvisTools.length,
      has_server_key: Boolean(process.env.OPENAI_API_KEY)
    },
    realtime: {
      status: Boolean(process.env.OPENAI_API_KEY) ? "ready" : "missing_key",
      transport: "WebRTC",
      token_endpoint: "/api/realtime-token",
      client_responsibility: "mic permission, WebRTC peer connection, data-channel events, transcript display",
      server_responsibility: "server-only OPENAI_API_KEY, client secret minting, local tools"
    },
    memory: {
      status: "ready",
      notes: memory.length,
      reminders: schedule.length,
      path: path.relative(root, memoryPath)
    },
    scheduler: {
      status: "ready",
      overdue: queue.summary.overdue,
      today: queue.summary.today,
      unscheduled: queue.summary.unscheduled,
      path: path.relative(root, schedulePath)
    },
    learning: {
      status: "ready",
      signals: learningSignals.length,
      preferences: learningSignals.filter((item) => item.kind === "preference").length,
      frictions: learningSignals.filter((item) => item.kind === "friction" || item.kind === "correction").length,
      path: path.relative(root, learningPath)
    },
    pending_actions: {
      status: "ready",
      total: pendingActions.length,
      awaiting_confirmation: pendingActions.filter((item) => item.status === "awaiting_confirmation").length,
      path: path.relative(root, pendingActionsPath)
    },
    whatsapp: {
      status: whatsappStatus.mode === "dry_run" ? "dry_run_ready" : whatsappStatus.mode === "live_ready" ? "live_ready" : whatsappStatus.mode,
      executor_attached: whatsappStatus.executor_attached,
      dry_run: whatsappStatus.dry_run,
      configured: whatsappStatus.configured,
      owner_configured: whatsappStatus.owner_configured,
      signature_configured: whatsappStatus.app_secret_configured,
      send_enabled: whatsappStatus.send_enabled,
      auto_send_from_webhook: false,
      diagnostics_endpoint: "/api/jarvis/whatsapp-diagnostics",
      contacts: contacts.length,
      contacts_allowed: contacts.filter((contact) => contactStatusForDraft(contact) === "allowed").length,
      live_ready: whatsappPrerequisites.live_ready,
      webhook: whatsappWebhookStatus(),
      drafts: whatsappDrafts.length,
      messages: whatsappMessages.length,
      audit_logs: (await readWhatsappAuditLogs()).length,
      path: path.relative(root, whatsappDraftsPath)
    },
    elevenlabs: {
      status: elevenLabsStatus.status,
      provider: elevenLabsStatus.provider,
      configured: elevenLabsStatus.configured,
      executor_attached: elevenLabsStatus.executor_attached,
      voice_id: elevenLabsStatus.voice_id,
      model: elevenLabsStatus.model,
      output_format: elevenLabsStatus.output_format,
      endpoint: elevenLabsStatus.endpoint
    },
    audit: {
      status: "ready",
      path: path.relative(root, auditPath)
    },
    alerts: {
      status: "ready",
      active: (await readAlerts()).filter((item) => item.status === "active").length,
      path: path.relative(root, alertsPath)
    },
    local_control: {
      status: supportsLocalOpen ? "ready" : "unverified_platform",
      platform: process.platform,
      scopes: ["apps", "urls", "obsidian_notes", "browser_tabs"],
      app_count: installedApps.length,
      alias_count: appAliases.length,
      browser_count: [...new Set(browserTabs.map((item) => item.browser))].length,
      open_tabs: browserTabs.length,
      browser_tabs_status: browserTabsStatus
    },
    obsidian: {
      status: (await pathExists(obsidianVaultDir)) ? "connected" : "missing",
      vault: path.relative(root, obsidianVaultDir),
      plugin_catalog: (await pathExists(obsidianPluginsPath)) ? "connected" : "missing"
    },
    graphify: {
      status: (await pathExists(graphifyExecutable)) ? "available_confirmation_required" : "missing",
      repo: path.relative(root, graphifyRepo),
      executable_present: await pathExists(graphifyExecutable),
      outputs: {
        report: (await pathExists(graphReport)) ? path.relative(root, graphReport) : null,
        graph_json: (await pathExists(graphJson)) ? path.relative(root, graphJson) : null,
        graph_html: (await pathExists(graphHtml)) ? path.relative(root, graphHtml) : null
      }
    }
  };
}

function parseReminderCommand(text) {
  const clean = safeNote(text);
  const lower = clean.toLowerCase();
  const markers = ["amintește-mi", "aminteste-mi", "remind me", "reaminteste-mi", "reamintește-mi"];
  const marker = markers.find((item) => lower.includes(item));
  if (!marker) return null;
  const raw = clean.slice(lower.indexOf(marker) + marker.length).replace(/^[:\s,.-]+/, "");
  const whenMatch = clean.match(/\b((?:m[âa]ine|azi|luni|marți|marti|miercuri|joi|vineri|s[âa]mb[ăa]t[ăa]|duminic[ăa])(?:\s+(?:diminea(?:t|ț)a|dup[ăa]\s*amiaza|seara))?(?:\s+la\s+\d{1,2}(?::\d{2})?)?|peste\s+\d+\s+(?:minute|ore|zile)|la\s+\d{1,2}(?::\d{2})?)\b/i);
  return {
    summary: raw || clean,
    when_text: whenMatch?.[0] || "time needs clarification"
  };
}

function parseWhatsappDraftCommand(text) {
  const clean = safeNote(text);
  const match = clean.match(/^(?:jarvis[, ]*)?(?:draft|creeaza draft|creează draft|pregateste draft|pregătește draft)\s+whatsapp\s+(?:to|for|lui|catre|către)?\s*([^:]+?)(?:\s*[:,-]\s*|\s+(?:that|ca|că)\s+)(.+)$/i);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    recipient: match[1].trim(),
    message: match[2].trim()
  };
}

function isWhatsappSendDraftCommand(text) {
  const lower = safeNote(text).toLowerCase();
  return [
    "send whatsapp draft",
    "send latest whatsapp draft",
    "execute whatsapp draft",
    "execute latest whatsapp draft",
    "dry-run whatsapp draft",
    "dry run whatsapp draft",
    "trimite draft whatsapp",
    "trimite ultimul draft whatsapp",
    "ruleaza draft whatsapp",
    "rulează draft whatsapp"
  ].some((term) => lower.includes(term));
}

function inferActionFamily(text) {
  const lower = safeNote(text).toLowerCase();
  if (["whatsapp", "email", "message", "mesaj", "trimite", "send", "dm"].some((term) => lower.includes(term))) {
    return "message";
  }
  if (["calendar", "call", "intalnire", "programare", "meeting", "invite"].some((term) => lower.includes(term))) {
    return "scheduling";
  }
  if (["delete", "sterge", "remove", "cancel"].some((term) => lower.includes(term))) {
    return "destructive";
  }
  if (["graphify"].some((term) => lower.includes(term))) {
    return "graphify";
  }
  return "external";
}

function inferDraftFormat(text) {
  const family = inferActionFamily(text);
  if (family === "message") return "message";
  if (family === "graphify") return "command_proposal";
  return "plan";
}

function parseLocalControlCommand(text) {
  const clean = safeNote(text);
  const lower = clean.toLowerCase();

  const obsidianNotePatterns = [
    /^(?:jarvis[, ]*)?(?:open|deschide)\s+(?:obsidian\s+)?(?:note|nota)\s+(.+)$/i,
    /^(?:jarvis[, ]*)?(?:open|deschide)\s+(.+?)\s+(?:in\s+obsidian|în\s+obsidian)$/i
  ];
  for (const pattern of obsidianNotePatterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      return {
        tool: "open_obsidian_note",
        args: { query: match[1] },
        intent: "open_obsidian_note"
      };
    }
  }

  const explicitUrlMatch = clean.match(/\b(https?:\/\/[^\s]+|www\.[^\s]+|localhost(?::\d+)?(?:\/[^\s]*)?|127\.0\.0\.1(?::\d+)?(?:\/[^\s]*)?)\b/i);
  if (explicitUrlMatch && /\b(open|deschide|launch|go to|mergi la|du-ma la|du mă la)\b/i.test(lower)) {
    return {
      tool: "open_local_url",
      args: { url: explicitUrlMatch[1] },
      intent: "open_local_url"
    };
  }

  const bareDomainMatch = clean.match(/^(?:jarvis[, ]*)?(?:open|deschide|launch|go to|mergi la)\s+((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)$/i);
  if (bareDomainMatch?.[1]) {
    return {
      tool: "open_local_url",
      args: { url: bareDomainMatch[1] },
      intent: "open_local_url"
    };
  }

  const explicitAppMatch = clean.match(/^(?:jarvis[, ]*)?(?:open|deschide|launch|porneste|pornește)\s+(?:the\s+)?(?:app|application|aplicatia)\s+(.+)$/i);
  if (explicitAppMatch?.[1]) {
    return {
      tool: "open_local_app",
      args: { app_name: explicitAppMatch[1] },
      intent: "open_local_app"
    };
  }

  const appMatch = clean.match(/^(?:jarvis[, ]*)?(?:open|deschide|launch|porneste|pornește)\s+(.+)$/i);
  if (!appMatch?.[1]) return null;

  const rawTarget = appMatch[1].replace(/^(?:the\s+)?(?:app|application|aplicatia)\s+/i, "").trim();
  return {
    tool: "open_local_app",
    args: { app_name: rawTarget },
    intent: "open_local_app"
  };
}

async function createPendingAction({ command, intent, risk, draft, metadata = {} }) {
  const executorAttached = pendingActionExecutorIntents.has(intent);
  const item = {
    id: crypto.randomUUID(),
    command: safeNote(command),
    intent,
    risk,
    family: inferActionFamily(command),
    status: "awaiting_confirmation",
    execution_state: "draft_only",
    executor_attached: executorAttached,
    resolution_note: executorAttached
      ? "Executor attached. Confirmation can execute this action."
      : "No executor is attached. Confirmation is blocked until a real executor is connected.",
    created_at: new Date().toISOString(),
    draft,
    ...metadata
  };
  await updateArrayFile(pendingActionsPath, 200, (items) => {
    items.push(item);
    return { items };
  });
  return item;
}

function inferCommand(text) {
  const clean = safeNote(text);
  const lower = clean.toLowerCase();
  const reminder = parseReminderCommand(clean);
  if (reminder) {
    return { tool: "create_local_reminder", args: { ...reminder, channel: "local" }, intent: "reminder" };
  }
  const whatsappDraft = parseWhatsappDraftCommand(clean);
  if (whatsappDraft) {
    return { tool: "create_whatsapp_draft", args: whatsappDraft, intent: "whatsapp_draft" };
  }
  if (isWhatsappSendDraftCommand(clean)) {
    return { tool: "prepare_whatsapp_send", args: {}, intent: "whatsapp_send" };
  }
  if (
    [
      "open whatsapp draft",
      "open latest whatsapp draft",
      "deschide whatsapp draft",
      "deschide draft whatsapp"
    ].some((term) => lower.includes(term))
  ) {
    return { tool: "prepare_whatsapp_web_draft", args: {}, intent: "whatsapp_web_open" };
  }

  const replaceAliasMatch = clean.match(/^(?:jarvis[, ]*)?(?:replace|update|change)\s+(?:app\s+)?alias\s+(.+?)\s+(?:for|to|with)\s+(.+)$/i);
  if (replaceAliasMatch?.[1] && replaceAliasMatch?.[2]) {
    return {
      tool: "remember_app_alias",
      args: { alias: replaceAliasMatch[1], app_name: replaceAliasMatch[2], replace_existing: true },
      intent: "remember_app_alias"
    };
  }

  const deleteAliasMatch = clean.match(/^(?:jarvis[, ]*)?(?:delete|remove|forget)\s+(?:app\s+)?alias\s+(.+)$/i);
  if (deleteAliasMatch?.[1]) {
    return {
      tool: "delete_app_alias",
      args: { alias: deleteAliasMatch[1] },
      intent: "delete_app_alias"
    };
  }

  const appAliasMatch = clean.match(/^(?:jarvis[, ]*)?(?:remember|set|learn)\s+(?:app\s+)?alias\s+(.+?)\s+(?:for|to|as)\s+(.+)$/i);
  if (appAliasMatch?.[1] && appAliasMatch?.[2]) {
    return {
      tool: "remember_app_alias",
      args: { alias: appAliasMatch[1], app_name: appAliasMatch[2] },
      intent: "remember_app_alias"
    };
  }

  const openBrowserTabMatch = clean.match(/^(?:jarvis[, ]*)?(?:open|deschide)\s+(?:browser\s+)?tab\s+(.+)$/i);
  if (openBrowserTabMatch?.[1]) {
    return {
      tool: "open_browser_tab",
      args: { url: openBrowserTabMatch[1] },
      intent: "open_browser_tab"
    };
  }

  const focusBrowserTabMatch = clean.match(/^(?:jarvis[, ]*)?(?:focus|switch to|go to|goto|show)\s+(?:browser\s+)?tab\s+(.+)$/i);
  if (focusBrowserTabMatch?.[1]) {
    return {
      tool: "focus_browser_tab",
      args: { query: focusBrowserTabMatch[1] },
      intent: "focus_browser_tab"
    };
  }

  const closeBrowserTabMatch = clean.match(/^(?:jarvis[, ]*)?(?:close|inchide|închide)\s+(?:browser\s+)?tab\s+(.+)$/i);
  if (closeBrowserTabMatch?.[1]) {
    return {
      tool: "close_browser_tab",
      args: { query: closeBrowserTabMatch[1] },
      intent: "close_browser_tab"
    };
  }

  if (
    [
      "list browser tabs",
      "show browser tabs",
      "browser tabs",
      "list tabs",
      "show tabs",
      "what tabs are open",
      "ce taburi sunt deschise",
      "ce taburi ai deschise"
    ].some((term) => lower.includes(term))
  ) {
    return {
      tool: "list_browser_tabs",
      args: { limit: 12 },
      intent: "list_browser_tabs"
    };
  }

  if (
    [
      "list apps",
      "show apps",
      "what apps can you open",
      "ce aplicatii poti deschide",
      "ce aplicații poți deschide",
      "local apps",
      "app catalog"
    ].some((term) => lower.includes(term))
  ) {
    return {
      tool: "list_local_apps",
      args: { limit: 12 },
      intent: "list_local_apps"
    };
  }

  if (
    [
      "ce am azi",
      "what do i have today",
      "today queue",
      "daily queue",
      "daily brief",
      "ce urmeaza azi",
      "what is next today"
    ].some((term) => lower.includes(term))
  ) {
    return { tool: "get_schedule_overview", args: {}, intent: "schedule_overview" };
  }

  if (
    [
      "open latest calendar export",
      "open calendar export",
      "open .ics",
      "import ics",
      "import calendar file",
      "deschide calendar export",
      "deschide fisier calendar",
      "deschide fișier calendar",
      "importa ics",
      "importă ics"
    ].some((term) => lower.includes(term))
  ) {
    return { tool: "prepare_calendar_import", args: {}, intent: "calendar_import" };
  }

  if (
    [
      "export calendar",
      "calendar export",
      "export schedule",
      "ics",
      "ical",
      "calendar file",
      "fișier calendar",
      "fisier calendar"
    ].some((term) => lower.includes(term))
  ) {
    const scope = lower.includes("today") || lower.includes("azi") ? "today" : lower.includes("all") || lower.includes("toate") ? "all" : "upcoming";
    return { tool: "export_schedule_ics", args: { scope }, intent: "calendar_export" };
  }

  const localControl = parseLocalControlCommand(clean);
  if (localControl) return localControl;

  if (
    [
      "mai eficient",
      "mai productiv",
      "improve operations",
      "improve my operations",
      "operational brief",
      "ce e urgent",
      "what is urgent",
      "ce recomanzi",
      "what do you recommend",
      "next best action",
      "organizeaza ziua",
      "organizează ziua",
      "status operational",
      "status operațional"
    ].some((term) => lower.includes(term))
  ) {
    return { tool: "get_operational_brief", args: {}, intent: "operational_brief" };
  }

  if (
    [
      "prefer",
      "prefer sa",
      "prefer să",
      "nu mai",
      "greșit",
      "gresit",
      "mă încurcă",
      "ma incurca",
      "friction",
      "prioritar",
      "priority",
      "important pentru mine"
    ].some((term) => lower.includes(term))
  ) {
    const note = clean
      .replace(/^(jarvis[, ]*)?/i, "")
      .replace(/^(ține minte că|tine minte ca|remember this|remember that|remember|learn this|learn that)\s*:?\s*/i, "");
    return {
      tool: "record_learning_signal",
      args: { note, kind: inferLearningKind(clean) },
      intent: "learning_signal"
    };
  }

  if (lower.includes("ține minte") || lower.includes("tine minte") || lower.startsWith("remember")) {
    const note = clean
      .replace(/^(jarvis[, ]*)?/i, "")
      .replace(/^(ține minte|tine minte|remember this|remember that|remember)\s*:?\s*/i, "");
    return { tool: "remember_note", args: { note, category: "idea" }, intent: "memory_write" };
  }

  if (lower.includes("unde am rămas") || lower.includes("unde am ramas") || lower.includes("where did we leave") || lower.includes("recall") || lower.includes("ce știi") || lower.includes("ce stii")) {
    return { tool: "recall_notes", args: { query: "" }, intent: "memory_recall" };
  }

  if (lower.includes("graphify")) {
    if (lower.includes("run") || lower.includes("ruleaza") || lower.includes("rulează")) {
      return { tool: "graphify_command_proposal", args: { mode: "build" }, intent: "graphify_proposal" };
    }
    return { tool: "graphify_status", args: {}, intent: "graphify_status" };
  }

  if (lower.includes("obsidian") && lower.includes("status")) {
    return { tool: "obsidian_status", args: {}, intent: "obsidian_status" };
  }

  if (lower.includes("obsidian")) {
    return { tool: "export_obsidian_note", args: { title: "JARVIS Command Capture", body: clean, folder: "Memory" }, intent: "obsidian_export" };
  }

  if (lower.includes("risc") || lower.includes("risk")) {
    return { tool: "risk_assessment", args: { action: clean }, intent: "risk_check" };
  }

  if (["whatsapp", "trimite", "send", "email", "message", "mesaj", "calendar", "call", "intalnire", "programare", "invite"].some((term) => lower.includes(term))) {
    return { tool: "draft_action", args: { objective: clean, format: inferDraftFormat(clean) }, intent: "external_action" };
  }

  if (lower.includes("status") || lower.includes("capabil") || lower.includes("what can you do") || lower.includes("ce poți") || lower.includes("ce poti")) {
    return { tool: "get_capabilities", args: {}, intent: "capability_status" };
  }

  if (lower.includes("ora") || lower.includes("time") || lower.includes("date")) {
    return { tool: "get_local_time", args: {}, intent: "time_check" };
  }

  return { tool: "make_task_plan", args: { objective: clean, horizon: "now" }, intent: "plan" };
}

function commandMessage(intent, result, risk) {
  if (!result?.ok) return result?.error || "Command failed.";
  if (risk === "confirmation_required") return "Am pregătit evaluarea/draftul. Nu execut acțiunea externă fără confirmarea ta explicită.";
  if (risk === "high_risk_confirmation") return "Acțiune HIGH RISK: am pregătit doar draftul. Execuția cere confirmare explicită și verificare dublă.";
  if (risk === "handoff_required") return "Această acțiune trebuie finalizată de tine. Eu pot pregăti pașii, dar nu pot face pasul sensibil.";
  if (risk === "disallowed") return "Acțiunea este blocată.";
  if (intent === "schedule_overview") return result.next_actions?.[0] ? `Schedule queue ready. ${result.next_actions[0]}` : "Schedule queue ready.";
  if (intent === "learning_signal") return "Learning signal saved. Future advice will adapt.";
  if (intent === "operational_brief") return result.recommendations?.[0] ? `Operational brief ready. ${result.recommendations[0]}` : "Operational brief ready.";
  if (intent === "memory_write") return "Memorie locală salvată.";
  if (intent === "memory_recall") return `Am găsit ${result.count} note locale.`;
  if (intent === "reminder") return "Reminder local creat. Nu am notificat persoane externe.";
  if (intent === "whatsapp_draft") return `WhatsApp draft creat pentru ${result.draft.recipient}. Nu am trimis nimic.`;
  if (intent === "whatsapp_web_open") return result.draft ? "WhatsApp Web draft opened. Send was not clicked." : "WhatsApp Web draft prepared. Confirm before opening.";
  if (intent === "whatsapp_send") {
    if (result.dry_run) return "WhatsApp dry-run executed. No external API call was made.";
    return result.draft ? "WhatsApp message sent through Cloud API." : "WhatsApp send prepared. Confirm before execution.";
  }
  if (intent === "calendar_export") return `Calendar export creat: ${result.path}. ${result.exported} iteme exportate, ${result.skipped?.length || 0} omise.`;
  if (intent === "calendar_import") return result.opened ? `Calendar export opened: ${result.opened}` : "Calendar import prepared. Confirm before opening the .ics file.";
  if (intent === "list_browser_tabs") return `${result.tab_count} browser tabs discovered across ${result.browser_count} supported browsers.`;
  if (intent === "open_browser_tab") return `Opened browser page: ${result.url}`;
  if (intent === "focus_browser_tab") return result.message || "Browser tab focused.";
  if (intent === "close_browser_tab") return result.message || "Browser tab close request prepared.";
  if (intent === "list_local_apps") return `${result.app_count} local apps discovered. ${result.alias_count} learned aliases are ready.`;
  if (intent === "remember_app_alias") {
    if (result.unchanged) return `Alias already points to ${result.app_name}.`;
    if (result.replaced) return `Alias replaced: ${result.alias} -> ${result.app_name}.`;
    return `Learned app alias: ${result.alias} -> ${result.app_name}.`;
  }
  if (intent === "delete_app_alias") return `Alias removed: ${result.removed.alias} -> ${result.removed.app_name}.`;
  if (intent === "open_local_url") return `Opened page: ${result.url}`;
  if (intent === "open_local_app") return `Opened app: ${result.app_name}`;
  if (intent === "open_obsidian_note") return `Opened Obsidian note: ${result.note}`;
  if (intent === "obsidian_export") return `Notă exportată în Obsidian: ${result.note}`;
  if (intent === "obsidian_status") return result.connected ? "Obsidian vault este conectat." : "Obsidian vault lipsește sau este incomplet.";
  if (intent === "graphify_status") return result.executable_present ? "Graphify este disponibil, dar rularea cere confirmare." : "Graphify lipsește sau nu este executabil.";
  if (intent === "graphify_proposal") return "Am pregătit comanda Graphify ca propunere, fără să rulez cod third-party.";
  if (intent === "external_action") return "Acțiunea a fost mutată în Pending Actions pentru confirmare.";
  return "Comanda a fost procesată și logată.";
}

async function runJarvisTool(name, args = {}) {
  if (name === "get_local_time") {
    const timezone = args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      ok: true,
      timezone,
      iso: new Date().toISOString(),
      readable: new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeStyle: "medium",
        timeZone: timezone
      }).format(new Date())
    };
  }

  if (name === "remember_note") {
    const note = safeNote(args.note);
    if (!note) return { ok: false, error: "No note supplied." };
    if (hasSensitiveMemory(note)) {
      return { ok: false, error: "Sensitive material was not stored in memory." };
    }
    const category = ["preference", "project", "task", "idea"].includes(args.category) ? args.category : "idea";
    const item = {
      id: crypto.randomUUID(),
      category,
      note,
      created_at: new Date().toISOString()
    };
    const result = await updateArrayFile(memoryPath, 100, (items) => {
      items.push(item);
      return { items, total_notes: items.length };
    });
    return { ok: true, saved: item, total_notes: result.total_notes };
  }

  if (name === "create_local_reminder") {
    const summary = safeNote(args.summary);
    const whenText = safeNote(args.when_text);
    if (!summary) return { ok: false, error: "No reminder summary supplied." };
    if (!whenText) return { ok: false, error: "No reminder time supplied." };
    if (hasSensitiveMemory(`${summary} ${whenText}`)) {
      return { ok: false, error: "Sensitive material was not stored in reminder data." };
    }
    const channel = ["local", "whatsapp_draft", "calendar_draft"].includes(args.channel) ? args.channel : "local";
    const item = {
      id: crypto.randomUUID(),
      type: "reminder",
      summary,
      when_text: whenText,
      channel,
      status: "pending",
      requires_confirmation: channel !== "local",
      created_at: new Date().toISOString()
    };
    const result = await updateArrayFile(schedulePath, 200, (items) => {
      items.push(item);
      return { items, total_reminders: items.length };
    });
    return { ok: true, reminder: item, total_reminders: result.total_reminders };
  }

  if (name === "open_local_url") {
    const url = resolveLocalUrl(args.url);
    await openWithMac([url]);
    return {
      ok: true,
      url,
      opened_with: "macOS open"
    };
  }

  if (name === "open_local_app") {
    const target = await resolveLocalAppTarget(safeAppName(args.app_name));
    await openWithMac(["-a", target.app_path]);
    return {
      ok: true,
      app_name: target.app_name,
      app_path: target.app_path,
      match: target.match,
      alias: target.alias || null,
      opened_with: "macOS open -a"
    };
  }

  if (name === "open_obsidian_note") {
    const note = await findObsidianNoteMatch(args.query);
    let openedWith = "Obsidian";
    try {
      await openWithMac(["-a", "Obsidian", note.fullPath]);
    } catch {
      await openWithMac([note.fullPath]);
      openedWith = "default_handler";
    }
    return {
      ok: true,
      note: note.relativePath,
      vault: path.relative(root, obsidianVaultDir),
      opened_with: openedWith
    };
  }

  if (name === "list_browser_tabs") {
    const limit = Math.max(1, Math.min(Number(args.limit) || 12, 40));
    return listBrowserTabsCatalog({
      query: args.query || "",
      limit,
      refresh: Boolean(args.refresh)
    });
  }

  if (name === "open_browser_tab") {
    const url = resolveLocalUrl(args.url);
    const browser = safeStartupValue(args.browser);
    const browserMatch = browser ? resolveBrowserApp(browser) : null;
    if (browser && !browserMatch) {
      const error = new Error("Unsupported browser. Use Safari or Google Chrome.");
      error.statusCode = 400;
      throw error;
    }
    if (browserMatch) {
      await openWithMac(["-a", browserMatch.name, url]);
    } else {
      await openWithMac([url]);
    }
    browserTabCache.expiresAt = 0;
    return {
      ok: true,
      url,
      browser: browserMatch?.name || "default_handler",
      opened_with: browserMatch ? "macOS open -a" : "macOS open"
    };
  }

  if (name === "focus_browser_tab") {
    return focusBrowserTabNow(args.query);
  }

  if (name === "close_browser_tab") {
    return closeBrowserTabNow(args.tab || args.query);
  }

  if (name === "list_local_apps") {
    const limit = Math.max(1, Math.min(Number(args.limit) || 12, 40));
    return listLocalAppsCatalog({
      query: args.query || "",
      limit,
      refresh: Boolean(args.refresh)
    });
  }

  if (name === "remember_app_alias") {
    return saveAppAlias({
      alias: args.alias,
      appName: args.app_name,
      replaceExisting: Boolean(args.replace_existing)
    });
  }

  if (name === "delete_app_alias") {
    return deleteAppAlias({ alias: args.alias, aliasId: args.id });
  }

  if (name === "create_whatsapp_draft") {
    return createWhatsappDraft(args);
  }

  if (name === "prepare_whatsapp_web_draft") {
    return prepareWhatsappWebDraft();
  }

  if (name === "prepare_whatsapp_send") {
    return prepareWhatsappSendDraft();
  }

  if (name === "get_schedule_overview") {
    return buildQueueView({
      schedule: await readSchedule(),
      pendingActions: await readPendingActions()
    });
  }

  if (name === "export_schedule_ics") {
    return exportScheduleIcs({ scope: args.scope });
  }

  if (name === "prepare_calendar_import") {
    return prepareCalendarImportDraft();
  }

  if (name === "record_learning_signal") {
    const note = safeNote(args.note);
    if (!note) return { ok: false, error: "No learning signal supplied." };
    if (hasSensitiveMemory(note)) {
      return { ok: false, error: "Sensitive material was not stored in learning." };
    }
    const kind = ["preference", "correction", "friction", "win", "priority"].includes(args.kind) ? args.kind : inferLearningKind(note);
    const item = {
      id: crypto.randomUUID(),
      kind,
      note,
      created_at: new Date().toISOString()
    };
    const result = await updateArrayFile(learningPath, 200, (items) => {
      items.push(item);
      return { items, total_signals: items.length };
    });
    return { ok: true, saved: item, total_signals: result.total_signals };
  }

  if (name === "recall_notes") {
    const query = safeNote(args.query).toLowerCase();
    const memory = await readMemory();
    const notes = query
      ? memory.filter((item) => `${item.category} ${item.note}`.toLowerCase().includes(query))
      : memory.slice(-12);
    return { ok: true, count: notes.length, notes: notes.slice(-12) };
  }

  if (name === "make_task_plan") {
    const objective = safeNote(args.objective);
    if (!objective) return { ok: false, error: "No objective supplied." };
    const horizon = ["now", "today", "week"].includes(args.horizon) ? args.horizon : "now";
    return {
      ok: true,
      objective,
      horizon,
      checklist: [
        "Define the exact outcome in one sentence.",
        "Identify the first blocker or missing input.",
        "Choose the smallest useful next action.",
        "Set a verification signal so progress is visible.",
        horizon === "now" ? "Execute the first action immediately." : "Schedule the first action and review point."
      ]
    };
  }

  if (name === "get_capabilities") {
    return {
      ok: true,
      live_capabilities: [
        "Realtime voice conversation over WebRTC",
        "Audio output with low-latency interruption",
        "Transcript display",
        "Local non-sensitive memory notes",
        "Local reminder records",
        "Daily queue classification for reminders and approved actions",
        "In-app live alerts and automatic morning brief surfaces",
        "Task planning",
        "Offline text command fallback",
        "Persistent audit log",
        "Session and connection recovery status",
        "Low-risk local control for discovered local apps, web pages, and Obsidian notes",
        "Learned aliases for local app opening",
        "Supported browser tab listing, focusing, and confirmation-gated closing",
        "Obsidian plugin catalog lookup",
        "Obsidian vault note export",
        "Graphify project-map status and command proposals"
      ],
      guarded_capabilities: [
        "Sending messages",
        "Deleting data",
        "Purchases or financial actions",
        "Installing software",
        "Account or permission changes",
        "Reading or transmitting sensitive data",
        "Arbitrary shell execution or arbitrary file opening"
      ],
      autonomy_profile: "Max Operator mode: plan and draft aggressively; execute safe local tools directly; require confirmation for external or destructive actions."
    };
  }

  if (name === "get_operational_brief") {
    return buildOperationalBrief();
  }

  if (name === "risk_assessment") {
    const action = safeNote(args.action);
    if (!action) return { ok: false, error: "No action supplied." };
    const classification = classifyRisk(`${action} ${args.data_involved || ""}`);
    const guidance = {
      direct_ok: "Can proceed within this app using available safe tools.",
      confirmation_required: "Prepare the action, then ask the user for explicit confirmation immediately before execution.",
      high_risk_confirmation: "High-risk action. Prepare only a draft and require explicit confirmation, with a second check before execution.",
      handoff_required: "The user must do the final step themselves.",
      disallowed: "Do not assist with this action."
    };
    return {
      ok: true,
      action,
      classification,
      guidance: guidance[classification]
    };
  }

  if (name === "draft_action") {
    const objective = safeNote(args.objective);
    const format = ["message", "checklist", "plan", "command_proposal"].includes(args.format) ? args.format : "plan";
    if (!objective) return { ok: false, error: "No objective supplied." };
    return {
      ok: true,
      format,
      objective,
      draft: {
        title: `Draft: ${objective}`,
        items: [
          "State the intended outcome clearly.",
          "List required inputs or assumptions.",
          "Prepare the next action without executing it.",
          "Run risk_assessment before any external, destructive, financial, account, or sensitive-data step.",
          "Ask for explicit confirmation only when the next click or submit would create real-world effects."
        ],
        audience: safeNote(args.audience) || "operator"
      }
    };
  }

  if (name === "search_obsidian_plugins") {
    const query = safeNote(args.query).toLowerCase();
    if (!query) return { ok: false, error: "No query supplied." };
    const limit = Math.max(1, Math.min(Number(args.limit) || 5, 12));
    const plugins = await readJsonFile(path.join(obsidianRepo, "community-plugins.json"), []);
    const stats = await readJsonFile(path.join(obsidianRepo, "community-plugin-stats.json"), {});
    const results = plugins
      .filter((plugin) => `${plugin.id} ${plugin.name} ${plugin.author} ${plugin.description} ${plugin.repo}`.toLowerCase().includes(query))
      .slice(0, limit)
      .map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        author: plugin.author,
        description: plugin.description,
        repo: plugin.repo,
        downloads: stats?.[plugin.id]?.downloads || stats?.[plugin.id]?.download_count || null
      }));
    return {
      ok: true,
      source: path.relative(root, obsidianRepo),
      query,
      count: results.length,
      results
    };
  }

  if (name === "obsidian_status") {
    const pluginsPath = path.join(obsidianRepo, "community-plugins.json");
    const vaultConnected = await pathExists(obsidianVaultDir);
    const pluginCatalogConnected = await pathExists(pluginsPath);
    return {
      ok: true,
      connected: vaultConnected && pluginCatalogConnected,
      vault: vaultConnected ? path.relative(root, obsidianVaultDir) : null,
      plugin_catalog: pluginCatalogConnected ? path.relative(root, pluginsPath) : null
    };
  }

  if (name === "export_obsidian_note") {
    const title = safeFileName(args.title);
    const body = String(args.body || "").trim().slice(0, 4000);
    if (!body) return { ok: false, error: "No note body supplied." };
    const folder = ["Missions", "Memory", "Research", "Graphify"].includes(args.folder) ? args.folder : "Memory";
    const targetDir = path.join(obsidianVaultDir, folder);
    const targetPath = path.join(targetDir, `${title}.md`);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(
      targetPath,
      [
        "---",
        `title: ${JSON.stringify(title)}`,
        `created: ${new Date().toISOString()}`,
        "source: JARVIS",
        "---",
        "",
        body,
        "",
        "[[JARVIS Index]]"
      ].join("\n")
    );
    await fs.writeFile(
      path.join(obsidianVaultDir, "JARVIS Index.md"),
      [
        "# JARVIS Index",
        "",
        "- [[Missions]]",
        "- [[Memory]]",
        "- [[Research]]",
        "- [[Graphify]]",
        "",
        `Last updated: ${new Date().toISOString()}`
      ].join("\n")
    );
    return {
      ok: true,
      vault: path.relative(root, obsidianVaultDir),
      note: path.relative(root, targetPath)
    };
  }

  if (name === "graphify_status") {
    const executable = path.join(graphifyRepo, "venv/bin/graphify");
    const reportPath = path.join(graphifyOutDir, "GRAPH_REPORT.md");
    const graphPath = path.join(graphifyOutDir, "graph.json");
    const htmlPath = path.join(graphifyOutDir, "graph.html");
    return {
      ok: true,
      repo: path.relative(root, graphifyRepo),
      executable_present: await pathExists(executable),
      graph_outputs: {
        report: await pathExists(reportPath) ? path.relative(root, reportPath) : null,
        graph_json: await pathExists(graphPath) ? path.relative(root, graphPath) : null,
        graph_html: await pathExists(htmlPath) ? path.relative(root, htmlPath) : null
      },
      run_requires_confirmation: true
    };
  }

  if (name === "graphify_command_proposal") {
    const mode = ["build", "update", "query", "obsidian_export"].includes(args.mode) ? args.mode : "build";
    const executable = path.join(graphifyRepo, "venv/bin/graphify");
    const commands = {
      build: `${JSON.stringify(executable)} .`,
      update: `${JSON.stringify(executable)} update .`,
      query: `${JSON.stringify(executable)} query ${JSON.stringify(safeNote(args.query) || "show the architecture")} --graph graphify-out/graph.json`,
      obsidian_export: `${JSON.stringify(executable)} . --obsidian --obsidian-dir ${JSON.stringify(path.join(obsidianVaultDir, "Graphify"))}`
    };
    return {
      ok: true,
      mode,
      command: commands[mode],
      cwd: root,
      note: "This is a proposal only. Running Graphify executes third-party Python code and requires explicit action-time confirmation."
    };
  }

  if (name === "graphify_read_report") {
    const reportPath = path.join(graphifyOutDir, "GRAPH_REPORT.md");
    if (!(await pathExists(reportPath))) {
      return {
        ok: false,
        error: "No Graphify report found yet.",
        next_step: "Use graphify_command_proposal first, then confirm before running Graphify."
      };
    }
    const report = await fs.readFile(reportPath, "utf8");
    return {
      ok: true,
      report_path: path.relative(root, reportPath),
      excerpt: report.slice(0, 3500)
    };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

function buildSession() {
  return {
    session: {
      type: "realtime",
      model,
      instructions: JARVIS_INSTRUCTIONS,
      output_modalities: ["audio"],
      tools: jarvisTools,
      tool_choice: "auto",
      audio: {
        input: {
          noise_reduction: { type: "near_field" },
          transcription: {
            model: "gpt-4o-transcribe",
            prompt: "Jarvis assistant, Romanian and English commands, task planning, local memory, operating status, concise voice control."
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: "medium",
            create_response: true,
            interrupt_response: true
          }
        },
        output: {
          voice,
          speed: 1.06
        }
      }
    }
  };
}

app.use("/api", requireApiAccess);

app.post("/api/whatsapp/draft", async (req, res) => {
  try {
    const to = safeNote(req.body?.to || req.body?.recipient || req.body?.phone);
    const body = safeNote(req.body?.body || req.body?.text || req.body?.message).slice(0, 4096);
    if (!to || !body) {
      return res.status(400).json({ ok: false, error: "to and body are required." });
    }

    const draft = await createWhatsappDraft({ recipient: to, message: body });
    const outbound = await recordWhatsappOutboundMessage({
      source: "api_whatsapp_draft",
      to_phone: to,
      body,
      status: "draft_only",
      dry_run: true,
      execution_state: "draft_only",
      raw_payload_path_or_hash: hashWhatsappPayload({ to, body, draft_id: draft.draft.id })
    });
    const auditLog = await appendWhatsappAuditLog({
      action: "outbound_draft",
      risk_level: "low",
      confirmation_required: false,
      confirmation_status: "not_required",
      result: "draft_created",
      error: "",
      message_id: outbound.message.id
    });

    res.status(201).json({
      ok: true,
      draft: draft.draft,
      message: outbound.message,
      audit_log: auditLog.audit_log,
      warning: "Draft only. Nothing was sent."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create WhatsApp draft.";
    await appendWhatsappAuditLog({
      action: "outbound_draft",
      risk_level: "low",
      confirmation_required: false,
      confirmation_status: "not_required",
      result: "failed",
      error: message
    });
    res.status(error.statusCode || 500).json({ ok: false, error: message });
  }
});

app.post("/api/whatsapp/send", async (req, res) => {
  try {
    const to = safeNote(req.body?.to || req.body?.recipient || req.body?.phone);
    const body = safeNote(req.body?.body || req.body?.text || req.body?.message).slice(0, 4096);
    if (!to || !body) {
      return res.status(400).json({ ok: false, error: "to and body are required." });
    }

    if (!whatsappConfig.dryRun && safeStartupValue(req.body?.confirmation_phrase) !== "SEND WHATSAPP") {
      const auditLog = await appendWhatsappAuditLog({
        action: "outbound_send",
        risk_level: "medium",
        confirmation_required: true,
        confirmation_status: "missing",
        result: "blocked",
        error: "confirmation_phrase SEND WHATSAPP required"
      });
      return res.status(400).json({
        ok: false,
        error: "Live WhatsApp send requires confirmation_phrase SEND WHATSAPP.",
        audit_log: auditLog.audit_log
      });
    }

    const result = await sendOrDraftWhatsappReply({
      toPhone: to,
      body,
      source: "api_whatsapp_send"
    });

    res.status(result.sent ? 200 : 202).json({
      ok: true,
      sent: result.sent,
      dry_run: result.dry_run,
      status: result.status,
      message: result.message,
      audit_log: result.audit_log,
      warning: result.sent ? "" : "Dry-run/draft mode. No WhatsApp API call was made."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send WhatsApp message.";
    const auditLog = await appendWhatsappAuditLog({
      action: "outbound_send",
      risk_level: "medium",
      confirmation_required: true,
      confirmation_status: "failed",
      result: "failed",
      error: message
    });
    res.status(error.statusCode || 500).json({ ok: false, error: message, audit_log: auditLog.audit_log });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({
    model,
    voice,
    hasServerKey: Boolean(process.env.OPENAI_API_KEY),
    tools: jarvisTools.map((tool) => tool.name)
  });
});

app.get("/api/jarvis/status", async (_req, res) => {
  try {
    await runSchedulerCycle();
    res.json(await getModuleStatus());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not inspect JARVIS status." });
  }
});

app.get("/api/jarvis/memory", async (_req, res) => {
  try {
    res.json({ notes: await readMemory() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not read memory." });
  }
});

app.get("/api/jarvis/learning", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    const signals = await readLearningSignals();
    res.json({
      signals: signals.slice(-limit).reverse(),
      brief: await buildOperationalBrief()
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not read learning signals." });
  }
});

app.get("/api/jarvis/alerts", async (req, res) => {
  try {
    await runSchedulerCycle();
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 50));
    const status = safeNote(req.query.status);
    const alerts = await readAlerts();
    const filtered = status ? alerts.filter((item) => item.status === status) : alerts;
    res.json({ alerts: filtered.slice(-limit).reverse() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not inspect alerts." });
  }
});

app.get("/api/jarvis/schedule", async (req, res) => {
  try {
    await runSchedulerCycle();
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 50));
    const queue = buildQueueView({
      schedule: await readSchedule(),
      pendingActions: await readPendingActions()
    });
    res.json({
      ...queue,
      items: queue.items.slice(0, limit)
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not inspect schedule queue." });
  }
});

app.get("/api/jarvis/apps", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 40));
    const refresh = String(req.query.refresh || "") === "1";
    const payload = await listLocalAppsCatalog({
      query: req.query.query || "",
      limit,
      refresh
    });
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error instanceof Error ? error.message : "Could not inspect local apps." });
  }
});

app.get("/api/jarvis/whatsapp-drafts", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 50));
    const drafts = await readWhatsappDrafts();
    const messages = await readWhatsappMessages();
    res.json({
      drafts: drafts.slice(-limit).reverse(),
      count: drafts.length,
      messages_count: messages.length,
      executor: whatsappExecutor.getStatus(),
      path: path.relative(root, whatsappDraftsPath)
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not read WhatsApp drafts." });
  }
});

app.post("/api/jarvis/whatsapp-mode", async (req, res) => {
  try {
    if (typeof req.body?.dry_run !== "boolean") {
      return res.status(400).json({ ok: false, error: "dry_run boolean is required." });
    }

    if (req.body.dry_run === false) {
      if (safeStartupValue(req.body?.confirmation_phrase) !== "LIVE WHATSAPP") {
        return res.status(400).json({ ok: false, error: "Live mode requires typing LIVE WHATSAPP." });
      }

      const prereq = await whatsappModePrerequisites();
      if (!prereq.executor.configured) {
        return res.status(409).json({
          ok: false,
          error: "Live mode blocked: WhatsApp Cloud API credentials are not configured.",
          executor: prereq.executor,
          contacts: prereq.contacts,
          allowed_contacts: prereq.allowed_contacts
        });
      }
      if (prereq.allowed_contacts < 1) {
        return res.status(409).json({
          ok: false,
          error: "Live mode blocked: no allowlisted WhatsApp contacts exist.",
          executor: prereq.executor,
          contacts: prereq.contacts,
          allowed_contacts: prereq.allowed_contacts
        });
      }
    }

    const executor = whatsappExecutor.setDryRun(req.body.dry_run);
    const auditEvent = await appendAudit({
      source: "whatsapp",
      intent: "mode_change",
      risk: executor.dry_run ? "direct_ok" : "high_risk_confirmation",
      status: "done",
      detail: `WhatsApp mode changed to ${executor.mode}.`
    });
    res.json({
      ok: true,
      executor,
      webhook: whatsappWebhookStatus(),
      message: executor.dry_run ? "WhatsApp dry-run mode enabled." : "WhatsApp live mode enabled.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not update WhatsApp mode." });
  }
});

app.get("/api/jarvis/elevenlabs/status", (_req, res) => {
  res.json(elevenLabsClient.getStatus());
});

app.post("/api/jarvis/elevenlabs/tts", ttsLimiter, async (req, res) => {
  try {
    const result = await elevenLabsClient.textToSpeech({
      text: req.body?.text,
      voice_id: req.body?.voice_id,
      model_id: req.body?.model_id
    });
    await appendAudit({
      source: "elevenlabs",
      intent: "text_to_speech",
      risk: "direct_ok",
      status: "done",
      detail: `Generated ElevenLabs audio preview, ${result.character_count} characters.`
    });
    res.setHeader("Content-Type", result.content_type);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Jarvis-Provider", "elevenlabs");
    res.setHeader("X-Jarvis-Voice-Id", result.voice_id);
    res.send(result.audio);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not generate ElevenLabs speech.",
      code: error.code || undefined,
      recovery: error.recovery || undefined,
      provider_status: error.providerStatus || undefined,
      detail: error.detail || undefined,
      status: elevenLabsClient.getStatus()
    });
  }
});

app.get("/api/jarvis/contacts", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
    const query = safeNote(req.query.query);
    const contacts = await readContacts();
    const normalizedQuery = normalizeContactLookup(query);
    const filtered = normalizedQuery
      ? contacts.filter((contact) => {
        const haystack = [
          contact.name,
          contact.label,
          contact.nickname,
          contact.email,
          ...(Array.isArray(contact.aliases) ? contact.aliases : [])
        ].map(normalizeContactLookup).join(" ");
        return haystack.includes(normalizedQuery);
      })
      : contacts;

    res.json({
      contacts: filtered.slice(0, limit).map(publicContact),
      count: contacts.length,
      allowed: contacts.filter((contact) => contactStatusForDraft(contact) === "allowed").length,
      path: path.relative(root, contactsPath)
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not read contacts." });
  }
});

app.post("/api/jarvis/contacts", async (req, res) => {
  try {
    const contact = await createContact(req.body || {});
    const auditEvent = await appendAudit({
      source: "contacts",
      intent: "contact_create",
      risk: contactAllowsWhatsapp(contact) ? "confirmation_required" : "direct_ok",
      status: "done",
      detail: `Contact created: ${contact.name}. WhatsApp allowlist: ${contactAllowsWhatsapp(contact) ? "allowed" : "not_allowed"}.`
    });
    res.status(201).json({
      ok: true,
      contact: publicContact(contact),
      message: "Contact saved.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not save contact." });
  }
});

app.post("/api/jarvis/contacts/:id/update", async (req, res) => {
  try {
    const contact = await updateContact(req.params.id, req.body || {});
    const auditEvent = await appendAudit({
      source: "contacts",
      intent: "contact_update",
      risk: contactAllowsWhatsapp(contact) ? "confirmation_required" : "direct_ok",
      status: "done",
      detail: `Contact updated: ${contact.name}. WhatsApp allowlist: ${contactAllowsWhatsapp(contact) ? "allowed" : "not_allowed"}.`
    });
    res.json({
      ok: true,
      contact: publicContact(contact),
      message: "Contact updated.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not update contact." });
  }
});

app.post("/api/jarvis/contacts/:id/delete", async (req, res) => {
  try {
    const contact = await deleteContact(req.params.id);
    const auditEvent = await appendAudit({
      source: "contacts",
      intent: "contact_delete",
      risk: "confirmation_required",
      status: "done",
      detail: `Contact deleted: ${contact.name || contact.label}.`
    });
    res.json({
      ok: true,
      contact: publicContact(contact),
      message: "Contact deleted.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not delete contact." });
  }
});

app.get("/api/jarvis/whatsapp-messages", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 50));
    const messages = await readWhatsappMessages();
    res.json({
      messages: messages.slice(-limit).reverse(),
      count: messages.length,
      executor: whatsappExecutor.getStatus(),
      path: path.relative(root, whatsappMessagesPath)
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not read WhatsApp messages." });
  }
});

app.get("/api/jarvis/whatsapp-diagnostics", async (_req, res) => {
  try {
    const diagnostics = await diagnoseWhatsAppCloudApi({ config: whatsappConfig });
    res.json({
      ok: true,
      diagnostics,
      message: diagnostics.ready_for_meta_send
        ? "WhatsApp Cloud API assets are reachable."
        : "WhatsApp Cloud API token cannot access the configured phone number or business account."
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not diagnose WhatsApp Cloud API access."
    });
  }
});

app.get("/api/jarvis/browser-tabs", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12, 40));
    const refresh = String(req.query.refresh || "") === "1";
    const payload = await listBrowserTabsCatalog({
      query: req.query.query || "",
      limit,
      refresh
    });
    res.json(payload);
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not inspect browser tabs." });
  }
});

app.post("/api/jarvis/browser-tabs/focus", async (req, res) => {
  try {
    const result = await focusBrowserTabNow(req.body?.id || req.body?.query);
    const auditEvent = await appendAudit({
      source: "browser_tab",
      intent: "focus_browser_tab",
      risk: "direct_ok",
      status: "done",
      detail: result.message
    });
    res.json({
      ...result,
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not focus browser tab." });
  }
});

app.post("/api/jarvis/browser-tabs/close-request", async (req, res) => {
  try {
    const rawCommand = safeNote(req.body?.command) || `close browser tab ${safeNote(req.body?.id || req.body?.query)}`;
    const { pendingAction, target } = await createBrowserTabCloseRequest({
      command: rawCommand,
      query: req.body?.id || req.body?.query
    });
    const auditEvent = await appendAudit({
      source: "browser_tab",
      intent: "close_browser_tab",
      risk: "confirmation_required",
      status: "needs_confirmation",
      detail: `Pending browser-tab close request created: ${pendingAction.id}`
    });
    res.json({
      ok: true,
      pending_action: pendingAction,
      target,
      message: "Browser tab close request is ready. Review it, then confirm or cancel.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not prepare browser-tab close request." });
  }
});

app.post("/api/jarvis/app-aliases", async (req, res) => {
  try {
    const result = await saveAppAlias({
      alias: req.body?.alias,
      appName: req.body?.app_name,
      replaceExisting: Boolean(req.body?.replace_existing)
    });
    const auditEvent = await appendAudit({
      source: "app_alias",
      intent: "remember_app_alias",
      risk: "direct_ok",
      status: result.replaced ? "replaced" : result.unchanged ? "unchanged" : "done",
      detail: result.replaced
        ? `Alias replaced: ${result.alias} -> ${result.app_name}`
        : result.unchanged
          ? `Alias unchanged: ${result.alias} -> ${result.app_name}`
          : `Alias learned: ${result.alias} -> ${result.app_name}`
    });
    res.json({
      ...result,
      message: commandMessage("remember_app_alias", result, "direct_ok"),
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not save app alias.",
      ...(error?.details && typeof error.details === "object" ? error.details : {})
    });
  }
});

app.post("/api/jarvis/app-aliases/:id/delete", async (req, res) => {
  try {
    const result = await deleteAppAlias({ aliasId: req.params.id });
    const auditEvent = await appendAudit({
      source: "app_alias",
      intent: "delete_app_alias",
      risk: "direct_ok",
      status: "done",
      detail: `Alias removed: ${result.removed.alias} -> ${result.removed.app_name}`
    });
    res.json({
      ...result,
      message: commandMessage("delete_app_alias", result, "direct_ok"),
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete app alias."
    });
  }
});

app.post("/api/jarvis/alerts/:id/ack", async (req, res) => {
  try {
    const result = await updateAlertById(req.params.id, (current) => {
      if (current.status !== "active") {
        const error = new Error(`Alert is already ${current.status}.`);
        error.statusCode = 409;
        throw error;
      }

      return {
        ...current,
        status: "acknowledged",
        acknowledged_at: new Date().toISOString()
      };
    });
    const auditEvent = await appendAudit({
      source: "alert",
      intent: result.alert.kind,
      risk: "direct_ok",
      status: "acknowledged",
      detail: `Alert acknowledged: ${result.alert.id}`
    });
    res.json({
      ok: true,
      alert: result.alert,
      message: "Alert acknowledged.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not acknowledge alert." });
  }
});

app.post("/api/jarvis/alerts/:id/done", async (req, res) => {
  try {
    const alerts = await readAlerts();
    const alert = alerts.find((item) => item.id === req.params.id);
    if (!alert) {
      return res.status(404).json({ ok: false, error: "Alert not found." });
    }
    if (alert.status !== "active") {
      return res.status(409).json({ ok: false, error: `Alert is already ${alert.status}.` });
    }
    if (alert.kind !== "due_item") {
      return res.status(409).json({ ok: false, error: "Only due-item alerts can be marked done." });
    }
    if (alert.source !== "reminder") {
      return res.status(409).json({ ok: false, error: "Approved external actions cannot be marked done without executor proof." });
    }

    const timestamp = new Date().toISOString();
    const updatedReminder = await updateReminderById(alert.item_id, (item) => ({
      ...item,
      status: "completed",
      completed_at: timestamp,
      completed_from_alert: alert.id
    }));
    const updatedAlert = await updateAlertById(req.params.id, (current) => ({
      ...current,
      status: "resolved",
      resolved_at: timestamp,
      resolution: "done"
    }));
    const auditEvent = await appendAudit({
      source: "alert",
      intent: "due_item_done",
      risk: "direct_ok",
      status: "resolved",
      detail: `Reminder completed from alert: ${updatedReminder.item.id}`
    });
    res.json({
      ok: true,
      alert: updatedAlert.alert,
      reminder: updatedReminder.item,
      message: "Reminder marked done.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not resolve alert as done." });
  }
});

app.post("/api/jarvis/alerts/:id/snooze", async (req, res) => {
  try {
    const alerts = await readAlerts();
    const alert = alerts.find((item) => item.id === req.params.id);
    if (!alert) {
      return res.status(404).json({ ok: false, error: "Alert not found." });
    }
    if (alert.status !== "active") {
      return res.status(409).json({ ok: false, error: `Alert is already ${alert.status}.` });
    }
    if (alert.kind !== "due_item") {
      return res.status(409).json({ ok: false, error: "Only due-item alerts can be snoozed." });
    }

    const minutes = Math.max(5, Math.min(Number(req.body?.minutes) || 15, 24 * 60));
    const targetDate = new Date(Date.now() + minutes * 60_000);
    const override = {
      manual_due_at: targetDate.toISOString(),
      manual_when_text: `Snoozed ${minutes} min`,
      alert_suppressed_until: targetDate.toISOString()
    };

    let sourceResult;
    if (alert.source === "reminder") {
      sourceResult = await updateReminderById(alert.item_id, (item) => ({
        ...item,
        ...override
      }));
    } else if (alert.source === "approved_action") {
      sourceResult = await updateApprovedActionById(alert.item_id, (item) => ({
        ...item,
        ...override
      }));
    } else {
      return res.status(409).json({ ok: false, error: "Unsupported alert source." });
    }

    const updatedAlert = await updateAlertById(req.params.id, (current) => ({
      ...current,
      status: "snoozed",
      snoozed_until: targetDate.toISOString(),
      snoozed_at: new Date().toISOString(),
      resolution: "snooze"
    }));
    const auditEvent = await appendAudit({
      source: "alert",
      intent: "due_item_snooze",
      risk: "direct_ok",
      status: "snoozed",
      detail: `Alert snoozed ${minutes} minutes: ${alert.id}`
    });
    res.json({
      ok: true,
      alert: updatedAlert.alert,
      target: sourceResult.item,
      message: `Alert snoozed for ${minutes} minutes.`,
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not snooze alert." });
  }
});

app.post("/api/jarvis/alerts/:id/reschedule", async (req, res) => {
  try {
    const alerts = await readAlerts();
    const alert = alerts.find((item) => item.id === req.params.id);
    if (!alert) {
      return res.status(404).json({ ok: false, error: "Alert not found." });
    }
    if (alert.status !== "active") {
      return res.status(409).json({ ok: false, error: `Alert is already ${alert.status}.` });
    }
    if (alert.kind !== "due_item") {
      return res.status(409).json({ ok: false, error: "Only due-item alerts can be rescheduled." });
    }

    const override = resolveWhenTextOverride(req.body?.when_text, new Date());

    let sourceResult;
    if (alert.source === "reminder") {
      sourceResult = await updateReminderById(alert.item_id, (item) => ({
        ...item,
        ...override
      }));
    } else if (alert.source === "approved_action") {
      sourceResult = await updateApprovedActionById(alert.item_id, (item) => ({
        ...item,
        ...override
      }));
    } else {
      return res.status(409).json({ ok: false, error: "Unsupported alert source." });
    }

    const updatedAlert = await updateAlertById(req.params.id, (current) => ({
      ...current,
      status: "rescheduled",
      rescheduled_to: override.manual_due_at,
      rescheduled_at: new Date().toISOString(),
      resolution: "reschedule"
    }));
    const auditEvent = await appendAudit({
      source: "alert",
      intent: "due_item_reschedule",
      risk: "direct_ok",
      status: "rescheduled",
      detail: `Alert rescheduled: ${alert.id} -> ${override.manual_when_text}`
    });
    res.json({
      ok: true,
      alert: updatedAlert.alert,
      target: sourceResult.item,
      message: `Alert rescheduled to ${override.manual_when_text}.`,
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not reschedule alert." });
  }
});

app.get("/api/jarvis/audit", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
    const audit = await readAudit();
    res.json({ events: audit.slice(-limit).reverse() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not read audit log." });
  }
});

app.get("/api/jarvis/pending-actions", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 30, 100));
    const status = safeNote(req.query.status);
    const pendingActions = await readPendingActions();
    const filtered = status ? pendingActions.filter((item) => item.status === status) : pendingActions;
    res.json({ actions: filtered.slice(-limit).reverse() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not read pending actions." });
  }
});

app.get("/api/jarvis/cleanup-candidates", async (_req, res) => {
  try {
    res.json(await getCleanupCandidates());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not inspect cleanup candidates." });
  }
});

app.post("/api/jarvis/tool", async (req, res) => {
  const { name, arguments: args = {} } = req.body || {};
  try {
    const result = await runJarvisTool(name, args);
    await appendAudit({
      source: "tool",
      intent: name,
      risk: name === "graphify_command_proposal" ? "confirmation_required" : "direct_ok",
      status: result.ok ? "done" : "failed",
      detail: result.ok ? "Tool executed locally." : result.error
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Tool failed.",
      ...(error?.details && typeof error.details === "object" ? error.details : {})
    });
  }
});

async function runJarvisCommandRequest(rawText, { source = "command" } = {}) {
  const text = safeNote(rawText);
  if (!text) {
    return {
      statusCode: 400,
      body: { ok: false, error: "No command text supplied." }
    };
  }

  const inferred = inferCommand(text);
  const initialRisk = classifyRisk(text);
  const safeInternalIntent = [
    "reminder",
    "learning_signal",
    "memory_write",
    "memory_recall",
    "whatsapp_draft",
    "operational_brief",
    "schedule_overview",
    "calendar_export",
    "list_browser_tabs",
    "open_browser_tab",
    "focus_browser_tab",
    "list_local_apps",
    "remember_app_alias",
    "delete_app_alias",
    "open_local_url",
    "open_local_app",
    "open_obsidian_note"
  ].includes(inferred.intent);
  let risk = safeInternalIntent && ["confirmation_required", "high_risk_confirmation"].includes(initialRisk) ? "direct_ok" : initialRisk;
  if (inferred.intent === "close_browser_tab") risk = "confirmation_required";

  try {
    if (risk === "disallowed" || risk === "handoff_required") {
      const auditEvent = await appendAudit({
        source,
        command: text,
        intent: inferred.intent,
        tool: inferred.tool,
        risk,
        status: "blocked",
        detail: risk === "disallowed" ? "Command is disallowed." : "Command needs user handoff."
      });
      return {
        statusCode: 200,
        body: {
          ok: true,
          intent: inferred.intent,
          tool: inferred.tool,
          risk,
          status: "blocked",
          requires_confirmation: risk === "handoff_required",
          message: commandMessage(inferred.intent, { ok: true }, risk),
          audit_event: auditEvent
        }
      };
    }

    if (["confirmation_required", "high_risk_confirmation"].includes(risk) && !["risk_check", "graphify_proposal"].includes(inferred.intent)) {
      const closeRequest = inferred.intent === "close_browser_tab"
        ? await createBrowserTabCloseRequest({ command: text, query: inferred.args.query })
        : null;
      const draft = closeRequest?.pendingAction?.draft || (
        inferred.intent === "calendar_import"
          ? await runJarvisTool("prepare_calendar_import", inferred.args)
          : inferred.intent === "whatsapp_web_open"
            ? await runJarvisTool("prepare_whatsapp_web_draft", inferred.args)
            : inferred.intent === "whatsapp_send"
              ? await runJarvisTool("prepare_whatsapp_send", inferred.args)
              : await runJarvisTool("draft_action", { objective: text, format: inferDraftFormat(text) })
      );
      const pendingAction = closeRequest?.pendingAction || await createPendingAction({
        command: text,
        intent: inferred.intent,
        risk,
        draft
      });
      const auditEvent = await appendAudit({
        source,
        command: text,
        intent: pendingAction.intent,
        tool: closeRequest ? "close_browser_tab" : "draft_action",
        risk,
        status: "needs_confirmation",
        detail: `Pending action created: ${pendingAction.id}`
      });
      return {
        statusCode: 200,
        body: {
          ok: true,
          intent: pendingAction.intent,
          tool: closeRequest ? "close_browser_tab" : "draft_action",
          risk,
          status: "needs_confirmation",
          requires_confirmation: true,
          result: draft,
          pending_action: pendingAction,
          message: "Action moved to Pending Actions. Review it, then confirm or cancel.",
          audit_event: auditEvent
        }
      };
    }

    const result = await runJarvisTool(inferred.tool, inferred.args);
    const auditEvent = await appendAudit({
      source,
      command: text,
      intent: inferred.intent,
      tool: inferred.tool,
      risk,
      status: result.ok ? "done" : "failed",
      detail: result.ok ? commandMessage(inferred.intent, result, risk) : result.error
    });

    return {
      statusCode: 200,
      body: {
        ok: result.ok,
        intent: inferred.intent,
        tool: inferred.tool,
        risk,
        status: result.ok ? "done" : "failed",
        requires_confirmation: false,
        result,
        message: commandMessage(inferred.intent, result, risk),
        audit_event: auditEvent
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command failed.";
    await appendAudit({
      source,
      command: text,
      intent: inferred.intent,
      tool: inferred.tool,
      risk,
      status: "failed",
      detail: message
    });
    return {
      statusCode: error.statusCode || 500,
      body: {
        ok: false,
        error: message,
        ...(error?.details && typeof error.details === "object" ? error.details : {})
      }
    };
  }
}

app.post("/api/jarvis/command", async (req, res) => {
  const result = await runJarvisCommandRequest(req.body?.text, { source: "command" });
  res.status(result.statusCode).json(result.body);
});

app.post("/api/jarvis/voice-command", async (req, res) => {
  const result = await runJarvisCommandRequest(req.body?.transcript || req.body?.text, { source: "voice_command" });
  res.status(result.statusCode).json(result.body);
});

app.post("/api/jarvis/pending-actions/:id/confirm", async (req, res) => {
  try {
    const pendingActions = await readPendingActions();
    const current = pendingActions.find((item) => item.id === req.params.id);
    if (!current) {
      return res.status(404).json({ ok: false, error: "Pending action not found." });
    }
    if (current.status !== "awaiting_confirmation") {
      return res.status(409).json({ ok: false, error: `Pending action is already ${current.status}.` });
    }
    if (current.risk === "high_risk_confirmation" && safeStartupValue(req.body?.confirmation_phrase) !== "CONFIRM") {
      return res.status(400).json({ ok: false, error: "High-risk actions require typing CONFIRM." });
    }
    if (!pendingActionExecutorIntents.has(current.intent)) {
      const message = `No executor is attached for '${current.intent}'. Action remains staged; connect the executor before confirming.`;
      const auditEvent = await appendAudit({
        source: "pending_action",
        intent: current.intent,
        risk: current.risk,
        status: "blocked",
        detail: message
      });
      return res.status(409).json({
        ok: false,
        error: message,
        executor_attached: false,
        pending_action: current,
        audit_event: auditEvent
      });
    }

    const started = await updateArrayFile(pendingActionsPath, 200, (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index === -1) {
        const error = new Error("Pending action not found.");
        error.statusCode = 404;
        throw error;
      }
      if (items[index].status !== "awaiting_confirmation") {
        const error = new Error(`Pending action is already ${items[index].status}.`);
        error.statusCode = 409;
        throw error;
      }
      const updated = {
        ...items[index],
        executor_attached: true,
        status: "executing",
        execution_state: "executing",
        confirmed_at: new Date().toISOString(),
        resolution_note: "Confirmed by operator. Executor is running."
      };
      items[index] = updated;
      return { items, pending_action: updated };
    });

    let executionResult = null;
    try {
      executionResult = started.pending_action.intent === "calendar_import"
        ? await executeCalendarImport(started.pending_action)
        : started.pending_action.intent === "whatsapp_web_open"
          ? await executeWhatsappWebDraft(started.pending_action)
          : started.pending_action.intent === "whatsapp_send"
            ? await executeWhatsappDraftSend(started.pending_action)
            : await closeBrowserTabNow(started.pending_action.browser_tab);
    } catch (executionError) {
      const message = executionError instanceof Error ? executionError.message : "Executor failed.";
      const failed = await updateArrayFile(pendingActionsPath, 200, (items) => {
        const index = items.findIndex((item) => item.id === started.pending_action.id);
        if (index === -1) return { items, pending_action: started.pending_action };
        const updated = {
          ...items[index],
          status: "failed",
          execution_state: "failed",
          failed_at: new Date().toISOString(),
          resolution_note: message
        };
        items[index] = updated;
        return { items, pending_action: updated };
      });
      const auditEvent = await appendAudit({
        source: "pending_action",
        intent: failed.pending_action.intent,
        risk: failed.pending_action.risk,
        status: "failed",
        detail: message
      });
      return res.status(executionError.statusCode || 500).json({
        ok: false,
        error: message,
        pending_action: failed.pending_action,
        audit_event: auditEvent
      });
    }

    const result = await updateArrayFile(pendingActionsPath, 200, (items) => {
      const index = items.findIndex((item) => item.id === started.pending_action.id);
      if (index === -1) return { items, pending_action: started.pending_action };
      const updated = {
        ...items[index],
        status: "executed",
        execution_state: "executed",
        executed_at: new Date().toISOString(),
        resolution_note: started.pending_action.intent === "calendar_import"
          ? "Confirmed by operator and opened with the local calendar file handler."
          : started.pending_action.intent === "whatsapp_web_open"
            ? "Confirmed by operator and opened WhatsApp Web. Send was not clicked."
            : started.pending_action.intent === "whatsapp_send"
              ? executionResult.note
              : "Confirmed by operator and closed the selected browser tab."
      };
      items[index] = updated;
      return { items, pending_action: updated };
    });
    const auditEvent = await appendAudit({
      source: "pending_action",
      intent: result.pending_action.intent,
      risk: result.pending_action.risk,
      status: result.pending_action.status,
      detail: executionResult?.opened
        ? `Calendar export opened: ${executionResult.opened}`
        : executionResult?.opened_url_host
          ? `WhatsApp Web opened for draft: ${executionResult.draft.id}`
          : executionResult?.provider === "whatsapp_cloud_api"
            ? `WhatsApp executor ${executionResult.dry_run ? "dry-run" : "send"} completed for draft: ${executionResult.draft.id}`
          : executionResult?.tab
            ? executionResult.message
          : `Pending action executed: ${result.pending_action.id}`
    });
    res.json({
      ok: true,
      pending_action: result.pending_action,
      execution: executionResult,
      message: executionResult?.opened
        ? `Calendar export opened: ${executionResult.opened}`
        : executionResult?.opened_url_host
          ? "WhatsApp Web opened with draft text. Send was not clicked."
          : executionResult?.provider === "whatsapp_cloud_api"
            ? executionResult.note
          : executionResult?.tab
            ? executionResult.message
            : "Pending action executed.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not confirm pending action." });
  }
});

app.post("/api/jarvis/pending-actions/:id/cancel", async (req, res) => {
  try {
    const result = await updateArrayFile(pendingActionsPath, 200, (items) => {
      const index = items.findIndex((item) => item.id === req.params.id);
      if (index === -1) {
        const error = new Error("Pending action not found.");
        error.statusCode = 404;
        throw error;
      }

      const current = items[index];
      if (current.status !== "awaiting_confirmation") {
        const error = new Error(`Pending action is already ${current.status}.`);
        error.statusCode = 409;
        throw error;
      }

      const updated = {
        ...current,
        status: "cancelled",
        execution_state: "cancelled",
        cancelled_at: new Date().toISOString(),
        resolution_note: "Cancelled by operator before execution."
      };
      items[index] = updated;
      return { items, pending_action: updated };
    });
    const auditEvent = await appendAudit({
      source: "pending_action",
      intent: result.pending_action.intent,
      risk: result.pending_action.risk,
      status: "cancelled",
      detail: `Pending action cancelled: ${result.pending_action.id}`
    });
    res.json({
      ok: true,
      pending_action: result.pending_action,
      message: "Pending action cancelled.",
      audit_event: auditEvent
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Could not cancel pending action." });
  }
});

app.post("/api/realtime-token", realtimeTokenLimiter, async (_req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY. Create .env from .env.example and restart the dev server."
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildSession())
    });

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).type("application/json").send(text);
    }

    res.type("application/json").send(text);
  } catch (error) {
    console.error("Realtime token error:", error);
    res.status(502).json({
      error: "Could not create a Realtime client secret.",
      detail: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

if (isProduction) {
  app.use(express.static(path.join(root, "dist")));
  app.use((_req, res) => {
    res.sendFile(path.join(root, "dist", "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: {
      middlewareMode: true,
      hmr: {
        port: hmrPort
      }
    },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

startSchedulerRunner();

app.listen(port, listenHost, () => {
  const url = listenHost === "0.0.0.0" ? `http://0.0.0.0:${port}` : `http://localhost:${port}`;
  console.log(`JARVIS listening on ${url}`);
});
