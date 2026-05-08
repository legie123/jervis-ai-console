const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSY_ENV_VALUES = new Set(["0", "false", "no", "off"]);

export const ADAPTER_DEFINITIONS = Object.freeze([
  {
    id: "obsidian",
    label: "Obsidian",
    feedPath: "/api/obsidian/feed",
    description: "Vault sync and memory summary feed",
    enableEnv: "JARVIS_ADAPTER_OBSIDIAN_ENABLED"
  },
  {
    id: "ruflo",
    label: "Ruflo Agents",
    feedPath: "/api/ruflo/feed",
    description: "Swarm orchestration events feed",
    enableEnv: "JARVIS_ADAPTER_RUFLO_ENABLED"
  },
  {
    id: "hermes",
    label: "Hermes Agents",
    feedPath: "/api/hermes/feed",
    description: "Dispatch and handoff events feed",
    enableEnv: "JARVIS_ADAPTER_HERMES_ENABLED"
  },
  {
    id: "good_mood",
    label: "GoodMood",
    feedPath: "/api/good-mood/feed",
    description: "Operator coaching and mood insights feed",
    enableEnv: "JARVIS_ADAPTER_GOOD_MOOD_ENABLED"
  }
]);

const TOOL_SCHEMAS = Object.freeze({
  "whatsapp.draft": {
    input: {
      to: "string",
      body: "string",
      reason: "string?",
      scheduledFor: "iso-datetime?"
    },
    actions: ["/api/whatsapp/drafts", "/api/whatsapp/drafts/:id/confirm", "/api/whatsapp/drafts/:id/send"]
  },
  "obsidian.sync": {
    input: {
      confirmToken: "string"
    },
    actions: ["/api/obsidian/sync-summary"]
  },
  "graphify.export": {
    input: {},
    actions: ["/api/graphify/export"]
  }
});

function parseBooleanEnv(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  const value = String(rawValue).trim().toLowerCase();
  if (!value) return null;
  if (TRUTHY_ENV_VALUES.has(value)) return true;
  if (FALSY_ENV_VALUES.has(value)) return false;
  return null;
}

function parseGlobalEnabledAdapters(rawValue = process.env.JARVIS_ADAPTERS_ENABLED) {
  const text = String(rawValue || "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  return new Set(
    text
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/-/g, "_"))
  );
}

function resolveAdapterEnabled(definition, enabledSet) {
  const fromScopedEnv = parseBooleanEnv(process.env[definition.enableEnv]);
  if (fromScopedEnv !== null) return fromScopedEnv;
  if (!enabledSet) return false;
  return enabledSet.has("*") || enabledSet.has(definition.id);
}

function runtimeForTool(toolId, snapshots) {
  if (toolId === "whatsapp.draft") return snapshots.whatsapp;
  if (toolId === "obsidian.sync") return snapshots.obsidian;
  if (toolId === "graphify.export") return snapshots.graphify;
  return {};
}

export function buildAdapterRegistry({ now = new Date().toISOString() } = {}) {
  const enabledSet = parseGlobalEnabledAdapters();
  return ADAPTER_DEFINITIONS.map((definition) => {
    const enabled = resolveAdapterEnabled(definition, enabledSet);
    return {
      ...definition,
      enabled,
      mode: "opt_in",
      status: enabled ? "REAL" : "MOCK",
      updatedAt: now
    };
  });
}

export function buildToolCatalog(operator, { now = new Date().toISOString() } = {}) {
  const snapshots = {
    whatsapp: operator?.whatsapp?.status?.() || {},
    obsidian: operator?.obsidian?.status?.() || {},
    graphify: operator?.graphify?.status?.() || {}
  };
  const tools = Array.isArray(operator?.tools) ? operator.tools : [];

  return tools.map((tool) => {
    const runtime = runtimeForTool(tool.id, snapshots);
    return {
      ...tool,
      status: runtime.status || tool.status || "UNVERIFIED",
      schema: TOOL_SCHEMAS[tool.id] || null,
      runtime,
      reconciledAt: now
    };
  });
}
