import { MissionStatus, RiskLevel } from "../../../packages/core/src/types.js";

const TOOL_KEYWORDS = Object.freeze({
  "whatsapp.draft": [
    "whatsapp",
    "whatapp",
    "message",
    "reply",
    "text",
    "draft",
    "send",
    "mesaj",
    "trimite"
  ],
  "obsidian.sync": ["obsidian", "vault", "note", "notes", "markdown", "brain", "sync", "summary"],
  "graphify.export": ["graphify", "graph", "map", "topology", "node", "edge", "diagram"]
});

const LLM_PATTERNS = Object.freeze({
  "whatsapp.draft": [
    /whats?app/i,
    /\b(reply|respond|draft|message|text|send)\b/i,
    /\b(client|customer|chat)\b/i
  ],
  "obsidian.sync": [/\bobsidian\b/i, /\bvault\b/i, /\bnote(s)?\b/i, /\bbrain\b/i, /\bsync\b/i],
  "graphify.export": [/\bgraph(ify)?\b/i, /\bmap\b/i, /\btopology\b/i, /\bdiagram\b/i]
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(input = "") {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function scoreKeywordRouter(text, toolId) {
  const keywords = TOOL_KEYWORDS[toolId] || [];
  const hits = keywords.filter((keyword) => text.includes(keyword));
  return { hits, score: hits.length };
}

export function routeWithRegex(input = "") {
  const text = normalizeText(input);
  const ranked = Object.keys(TOOL_KEYWORDS)
    .map((toolId) => ({ toolId, ...scoreKeywordRouter(text, toolId) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const requestedTools = ranked.map((entry) => entry.toolId);
  const topScore = ranked[0]?.score || 0;
  const confidence = requestedTools.length ? clamp(0.36 + topScore * 0.17, 0.36, 0.92) : 0.18;

  return {
    source: "regex",
    confidence: Number(confidence.toFixed(2)),
    requestedTools,
    rationale: ranked.map((entry) => ({ toolId: entry.toolId, hits: entry.hits }))
  };
}

function scoreLlmPatterns(input, toolId) {
  const patterns = LLM_PATTERNS[toolId] || [];
  const hits = patterns.filter((pattern) => pattern.test(input)).map((pattern) => pattern.source);
  return { hits, score: hits.length };
}

export function routeWithMockLlm(input = "") {
  const raw = String(input || "").trim();
  const ranked = Object.keys(LLM_PATTERNS)
    .map((toolId) => ({ toolId, ...scoreLlmPatterns(raw, toolId) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const requestedTools = ranked.map((entry) => entry.toolId);
  const topScore = ranked[0]?.score || 0;
  const confidence = requestedTools.length ? clamp(0.44 + topScore * 0.12, 0.44, 0.95) : 0.21;

  return {
    source: "mock_llm",
    confidence: Number(confidence.toFixed(2)),
    requestedTools,
    rationale: ranked.map((entry) => ({ toolId: entry.toolId, hits: entry.hits }))
  };
}

function normalizeRouterMode(rawMode) {
  const mode = String(rawMode || "hybrid").trim().toLowerCase();
  if (mode === "regex" || mode === "llm" || mode === "hybrid") return mode;
  return "hybrid";
}

function parseMinConfidence(rawMinConfidence) {
  const parsed = Number(rawMinConfidence);
  if (!Number.isFinite(parsed)) return 0.65;
  return clamp(parsed, 0.35, 0.95);
}

export function routeMissionIntent(
  input,
  { mode = process.env.JARVIS_INTENT_ROUTER_MODE, minConfidence = process.env.JARVIS_INTENT_ROUTER_MIN_CONFIDENCE } = {}
) {
  const normalizedMode = normalizeRouterMode(mode);
  const min = parseMinConfidence(minConfidence);
  const regex = routeWithRegex(input);
  const llm = routeWithMockLlm(input);

  let selected = regex;
  let fallbackUsed = false;

  if (normalizedMode === "llm") {
    selected = llm;
  } else if (normalizedMode === "hybrid") {
    if (llm.requestedTools.length > 0 && llm.confidence >= min) {
      selected = llm;
    } else {
      selected = regex;
      fallbackUsed = true;
    }
  }

  const requestedTools = unique(selected.requestedTools);
  return {
    mode: normalizedMode,
    minConfidence: min,
    selectedSource: selected.source,
    fallbackUsed,
    confidence: selected.confidence,
    requestedTools,
    rationale: selected.rationale,
    candidates: {
      regex,
      llm
    },
    generatedAt: new Date().toISOString()
  };
}

function extractQuotedText(input) {
  const match = String(input || "").match(/["“](.+?)["”]|['’](.+?)['’]/);
  return (match?.[1] || match?.[2] || "").trim();
}

function extractTargetHint(input) {
  const match = String(input || "").match(/\b(?:to|catre|către)\s+([+\w@.\-]{3,})/i);
  return (match?.[1] || "").trim();
}

function detectRiskOverride(input) {
  const text = normalizeText(input);
  if (!text) return null;

  if (/\b(force|urgent|immediately|right now|auto-send|without confirm|fara confirm)\b/i.test(text)) {
    return RiskLevel.DANGEROUS;
  }

  if (/\b(check|status|preview|draft)\b/i.test(text)) {
    return RiskLevel.PARTIAL;
  }

  return null;
}

function normalizeToolRisk(tool, input) {
  const override = detectRiskOverride(input);
  if (override === RiskLevel.DANGEROUS) return RiskLevel.DANGEROUS;
  return tool?.risk || override || RiskLevel.UNVERIFIED;
}

function buildToolArgs(toolId, input) {
  if (toolId === "whatsapp.draft") {
    return {
      to: extractTargetHint(input) || "<pending_target>",
      body: extractQuotedText(input) || "<pending_message>",
      reason: "intent_router_hybrid"
    };
  }
  if (toolId === "obsidian.sync") {
    return {
      mode: /summary/i.test(input) ? "summary" : "sync",
      confirmToken: "<required>"
    };
  }
  if (toolId === "graphify.export") {
    return {
      scope: /audit/i.test(input) ? "audit" : "operational_map"
    };
  }
  return {};
}

export function buildIntentToolCalls({ missionInput, requestedTools = [], tools = [] }) {
  const byId = new Map((tools || []).map((tool) => [tool.id, tool]));
  return unique(requestedTools).flatMap((toolId) => {
    const tool = byId.get(toolId);
    if (!tool) return [];
    const risk = normalizeToolRisk(tool, missionInput);
    const requiresConfirmation = Boolean(tool.requiresConfirmation) || risk === RiskLevel.DANGEROUS;
    return [
      {
        toolId,
        label: tool.label || toolId,
        risk,
        requiresConfirmation,
        args: buildToolArgs(toolId, missionInput)
      }
    ];
  });
}

function mergeRiskLevels(baseRisks = [], toolCalls = []) {
  const risks = unique([
    ...(Array.isArray(baseRisks) ? baseRisks : []),
    ...toolCalls.map((call) => call.risk).filter(Boolean)
  ]);
  return risks.length ? risks : [RiskLevel.UNVERIFIED];
}

function mergeSteps(baseSteps = [], toolCalls = [], routeMeta = {}) {
  const merged = Array.isArray(baseSteps) ? baseSteps.map((step) => ({ ...step })) : [];
  const byToolId = new Map();

  for (const step of merged) {
    if (step.toolId) byToolId.set(step.toolId, step);
  }

  for (const [index, call] of toolCalls.entries()) {
    const existing = byToolId.get(call.toolId);
    if (existing) {
      existing.args = existing.args || call.args;
      existing.risk = call.risk;
      existing.route = routeMeta;
      if (call.requiresConfirmation) {
        existing.status = MissionStatus.WAITING_CONFIRMATION;
      }
      continue;
    }

    const step = {
      id: `intent_call_${index + 1}`,
      label: `Execute ${call.label}`,
      toolId: call.toolId,
      status: call.requiresConfirmation ? MissionStatus.WAITING_CONFIRMATION : MissionStatus.READY,
      risk: call.risk,
      args: call.args,
      route: routeMeta
    };
    merged.push(step);
    byToolId.set(step.toolId, step);
  }

  return merged;
}

export function mergePlanWithIntentRouting({ mission, fallbackPlan, route, toolCalls }) {
  const routeMeta = {
    source: route.selectedSource,
    mode: route.mode,
    confidence: route.confidence,
    fallbackUsed: route.fallbackUsed
  };
  const steps = mergeSteps(fallbackPlan.steps, toolCalls, routeMeta);
  const risks = mergeRiskLevels(fallbackPlan.risks, toolCalls);
  const status = steps.some((step) => step.status === MissionStatus.WAITING_CONFIRMATION)
    ? MissionStatus.WAITING_CONFIRMATION
    : steps.length
      ? MissionStatus.READY
      : fallbackPlan.status || MissionStatus.DRAFTED;

  return {
    ...fallbackPlan,
    missionId: fallbackPlan.missionId || mission.id,
    status,
    risks,
    steps,
    toolCalls,
    intentRouter: route,
    createdAt: new Date().toISOString()
  };
}
