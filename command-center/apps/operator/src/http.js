import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWhatsAppDraft, exportGraphifyMap, runDueScheduler, runMission, createOperator } from "./index.js";
import { createWhatsAppBridgeClient } from "./whatsapp-bridge-client.js";
import { buildAdapterRegistry, buildToolCatalog } from "./runtime-catalog.js";
import { createPathGuard } from "./security/path-guard.js";
import { createConfirmationTokenService } from "./security/confirmation-tokens.js";
import { createEmergencyStopState } from "./security/emergency-stop.js";
import { verifyWebhookChallenge, verifyWebhookSignature } from "../../../packages/whatsapp/src/index.js";
import { handleSecurityRoutes } from "./routes/security-routes.js";
import { handleCatalogRoutes } from "./routes/catalog-routes.js";
import { handleMissionWhatsAppRoutes } from "./routes/mission-whatsapp-routes.js";
import { handleSystemRoutes } from "./routes/system-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function internalConfirmToken(envKey, fallback) {
  return process.env[envKey] || fallback;
}

const INTERNAL_TOKENS = Object.freeze({
  whatsappSend: () => internalConfirmToken("WHATSAPP_SEND_CONFIRM_TOKEN", "CONFIRM_SEND"),
  bridgeSend: () => internalConfirmToken("WHATSAPP_BRIDGE_SEND_CONFIRM_TOKEN", "CONFIRM_BRIDGE_SEND"),
  obsidianSync: () => internalConfirmToken("OBSIDIAN_SYNC_CONFIRM_TOKEN", "SYNC_OBSIDIAN"),
  restore: () => internalConfirmToken("JARVIS_RESTORE_CONFIRM_TOKEN", "RESTORE_JARVIS")
});

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function isMutationRequest(method, pathname) {
  if (method !== "POST") return false;
  if (pathname === "/api/emergency/clear" || pathname === "/api/emergency/stop" || pathname === "/api/security/tokens") {
    return false;
  }
  if (pathname === "/webhooks/whatsapp") return false;
  return true;
}

function assertEmergencyRunnable(emergencyStop, req, pathname) {
  if (!isMutationRequest(req.method, pathname)) return;
  emergencyStop.assertRunnable(`${req.method} ${pathname}`);
}

async function requireScopedToken({
  operator,
  tokenService,
  scope,
  token,
  targetId = "",
  denyStatus = 403
}) {
  const verified = tokenService.verifyAndConsume({
    token,
    scope,
    targetId
  });

  if (verified.ok) return verified;

  await operator.auditLog.write({
    source: "security",
    action: "token_rejected",
    status: "denied",
    risk: "DANGEROUS",
    details: {
      scope,
      targetId,
      reason: verified.reason || "invalid_token"
    }
  });

  const error = new Error(`Confirmation token rejected (${verified.reason || "invalid_token"})`);
  error.statusCode = denyStatus;
  throw error;
}

function adapterMatchers(adapterId) {
  if (adapterId === "obsidian") return ["obsidian"];
  if (adapterId === "ruflo") return ["ruflo", "swarm", "claude_flow"];
  if (adapterId === "hermes") return ["hermes", "dispatcher", "handoff"];
  if (adapterId === "good_mood") return ["good_mood", "goodmood", "coach", "mood"];
  return [adapterId];
}

function adapterFeedEntry(adapterId, entry, index) {
  return {
    id: `${adapterId}:${entry.ts || "now"}:${index}`,
    title: entry.action || "event",
    preview: `${entry.status || "recorded"} · ${entry.source || "jarvis"}`,
    ts: entry.ts || new Date().toISOString(),
    risk: entry.risk || "UNVERIFIED",
    details: entry.details || {}
  };
}

async function loadAdapterFeedEntries(operator, adapterId) {
  const rows = await operator.auditLog.tail(200);
  const matchers = adapterMatchers(adapterId);
  const entries = rows
    .filter((row) => {
      const source = String(row.source || "").toLowerCase();
      const action = String(row.action || "").toLowerCase();
      return matchers.some((matcher) => source.includes(matcher) || action.includes(matcher));
    })
    .slice(0, 30)
    .map((entry, index) => adapterFeedEntry(adapterId, entry, index));
  return entries;
}

function resolveWebStaticRoot() {
  const distIndex = path.join(root, "apps/web/dist/index.html");
  if (existsSync(distIndex)) {
    return { relativeRoot: "apps/web/dist", allowedRoot: "apps/web/dist" };
  }
  return { relativeRoot: "apps/web/src", allowedRoot: "apps/web/src" };
}

async function serveStatic(req, res, pathGuard) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.replace(/^[/\\]+/, "");
  const { relativeRoot, allowedRoot } = resolveWebStaticRoot();
  let fullPath;
  try {
    const guarded = pathGuard.resolve(path.join(relativeRoot, requested), {
      mode: "read",
      allowedRoots: [allowedRoot]
    });
    fullPath = guarded.absolutePath;
  } catch (error) {
    error.statusCode = 403;
    throw error;
  }

  try {
    const body = await fs.readFile(fullPath);
    const type = contentTypes[path.extname(fullPath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }
    throw error;
  }
}

export function createHttpServer({
  operator = createOperator(),
  whatsappBridge = createWhatsAppBridgeClient(),
  pathGuard = createPathGuard({ root }),
  tokenService = createConfirmationTokenService(),
  emergencyStop = createEmergencyStopState()
} = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const toolCatalog = buildToolCatalog(operator);
      const adapterCatalog = buildAdapterRegistry();
      const adaptersByFeedPath = new Map(adapterCatalog.map((adapter) => [adapter.feedPath, adapter]));

      try {
        assertEmergencyRunnable(emergencyStop, req, url.pathname);
      } catch (gateError) {
        sendJson(res, 423, {
          ok: false,
          error: gateError.message,
          emergency: emergencyStop.status()
        });
        return;
      }

      const routeContext = {
        req,
        res,
        url,
        root,
        operator,
        whatsappBridge,
        pathGuard,
        tokenService,
        emergencyStop,
        toolCatalog,
        adapterCatalog,
        adaptersByFeedPath,
        runMission,
        createWhatsAppDraft,
        runDueScheduler,
        exportGraphifyMap,
        verifyWebhookChallenge,
        verifyWebhookSignature,
        readJson,
        readRaw,
        sendJson,
        loadAdapterFeedEntries,
        requireScopedToken,
        INTERNAL_TOKENS
      };

      if (await handleSecurityRoutes(routeContext)) return;
      if (await handleCatalogRoutes(routeContext)) return;
      if (await handleMissionWhatsAppRoutes(routeContext)) return;
      if (await handleSystemRoutes(routeContext)) return;

      if (req.method === "GET") {
        await serveStatic(req, res, pathGuard);
        return;
      }

      sendJson(res, 405, { ok: false, error: "Method not allowed" });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
  });
}
