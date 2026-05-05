import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWhatsAppDraft, exportGraphifyMap, runDueScheduler, runMission, createOperator } from "./index.js";
import { createWhatsAppBridgeClient } from "./whatsapp-bridge-client.js";
import { verifyWebhookChallenge, verifyWebhookSignature } from "../../../packages/whatsapp/src/index.js";
import { BackupManager } from "../../../packages/memory/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const webRoot = path.join(root, "apps/web/src");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

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

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(webRoot, safePath);

  if (!fullPath.startsWith(webRoot)) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
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
  whatsappBridge = createWhatsAppBridgeClient()
} = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          status: "REAL",
          root,
          tools: operator.tools,
          whatsapp: operator.whatsapp.status(),
          whatsappBridge: await whatsappBridge.status(),
          scheduler: {
            status: process.env.JARVIS_SCHEDULER_ENABLED === "true" ? "REAL" : "PARTIAL",
            enabled: process.env.JARVIS_SCHEDULER_ENABLED === "true",
            intervalMs: Number(process.env.JARVIS_SCHEDULER_INTERVAL_MS || 60000),
            autoSend: false
          },
          obsidian: operator.obsidian.status(),
          graphify: operator.graphify.status()
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/mission") {
        const body = await readJson(req);
        const result = await runMission(body.input || "");
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      if (req.method === "GET" && url.pathname === "/webhooks/whatsapp") {
        const challenge = verifyWebhookChallenge(url.searchParams, process.env.WHATSAPP_VERIFY_TOKEN || "");
        if (challenge === null) {
          sendJson(res, 403, { ok: false, error: "Webhook verification failed" });
          return;
        }
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(challenge);
        return;
      }

      if (req.method === "POST" && url.pathname === "/webhooks/whatsapp") {
        const rawBody = await readRaw(req);
        const signature = verifyWebhookSignature({
          rawBody,
          signatureHeader: req.headers["x-hub-signature-256"],
          appSecret: process.env.WHATSAPP_APP_SECRET || ""
        });

        if (!signature.ok) {
          await operator.auditLog.write({
            source: "whatsapp",
            action: "webhook_rejected",
            status: "bad_signature",
            risk: "DANGEROUS",
            details: {}
          });
          sendJson(res, 403, { ok: false, error: "Bad webhook signature" });
          return;
        }

        const payload = JSON.parse(rawBody.toString("utf8") || "{}");
        const result = await operator.whatsapp.receiveWebhook(payload);
        sendJson(res, 200, {
          ok: true,
          messages: result.saved.length,
          statuses: result.statuses.length,
          signatureSkipped: signature.skipped
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/whatsapp/drafts") {
        const body = await readJson(req);
        const result = await createWhatsAppDraft(body);
        sendJson(res, 201, { ok: true, ...result });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/whatsapp/drafts") {
        const drafts = await operator.whatsapp.draftStore.list();
        sendJson(res, 200, { ok: true, drafts });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/whatsapp/messages") {
        const messages = await operator.whatsapp.listMessages();
        sendJson(res, 200, { ok: true, messages: messages.slice().reverse() });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/status") {
        sendJson(res, 200, await whatsappBridge.status());
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/preflight") {
        try {
          sendJson(res, 200, await whatsappBridge.preflight());
        } catch (error) {
          sendJson(res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/messages") {
        try {
          sendJson(res, 200, await whatsappBridge.listMessages());
        } catch (error) {
          sendJson(res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/drafts") {
        try {
          sendJson(res, 200, await whatsappBridge.listDrafts());
        } catch (error) {
          sendJson(res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/bridge/whatsapp/drafts") {
        const body = await readJson(req);
        try {
          const result = await whatsappBridge.createDraft(body);
          await operator.auditLog.write({
            source: "whatsapp_bridge",
            action: "bridge_draft_created",
            status: "pending_confirmation",
            risk: "DANGEROUS",
            details: { draftId: result.draft?.id || null, to: body.to }
          });
          sendJson(res, 201, { ok: true, source: "whatsapp_bridge", ...result });
        } catch (error) {
          sendJson(res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/scheduler/jobs") {
        const jobs = await operator.scheduler.list();
        sendJson(res, 200, { ok: true, jobs: jobs.slice().reverse() });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/scheduler/run-due") {
        const result = await runDueScheduler();
        sendJson(res, 200, { ok: true, ...result });
        return;
      }

      const confirmMatch = url.pathname.match(/^\/api\/whatsapp\/drafts\/([^/]+)\/confirm$/);
      if (req.method === "POST" && confirmMatch) {
        const draft = await operator.whatsapp.confirmDraftNoSend(confirmMatch[1]);
        sendJson(res, 200, { ok: true, draft, realSend: false });
        return;
      }

      const sendMatch = url.pathname.match(/^\/api\/whatsapp\/drafts\/([^/]+)\/send$/);
      if (req.method === "POST" && sendMatch) {
        const body = await readJson(req);
        try {
          const draft = await operator.whatsapp.sendConfirmedDraft(sendMatch[1], body.confirmToken);
          sendJson(res, 200, { ok: true, draft, realSend: true });
        } catch (error) {
          sendJson(res, 409, { ok: false, error: error.message, draft: error.draft || null });
        }
        return;
      }

      const bridgeConfirmMatch = url.pathname.match(/^\/api\/bridge\/whatsapp\/drafts\/([^/]+)\/confirm$/);
      if (req.method === "POST" && bridgeConfirmMatch) {
        const body = await readJson(req);
        try {
          const result = await whatsappBridge.confirmDraft({
            id: bridgeConfirmMatch[1],
            confirmToken: body.confirmToken
          });
          await operator.auditLog.write({
            source: "whatsapp_bridge",
            action: "bridge_draft_confirmed",
            status: "sent_or_provider_result",
            risk: "DANGEROUS",
            details: { draftId: bridgeConfirmMatch[1] }
          });
          sendJson(res, 200, { ok: true, source: "whatsapp_bridge", ...result });
        } catch (error) {
          sendJson(res, 409, { ok: false, error: error.message, source: "whatsapp_bridge" });
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/audit") {
        const entries = await operator.auditLog.tail(100);
        sendJson(res, 200, { ok: true, entries });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/backup") {
        const body = await readJson(req);
        const result = await new BackupManager({ root }).createBackup(body.label || "");
        sendJson(res, 201, { ok: true, ...result });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state/export") {
        const state = await new BackupManager({ root }).exportState();
        sendJson(res, 200, { ok: true, state });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/restore") {
        const body = await readJson(req);
        try {
          const result = await new BackupManager({ root }).restoreBackup(body.backupPath, body.confirmToken);
          sendJson(res, 200, { ok: true, ...result });
        } catch (error) {
          sendJson(res, 409, { ok: false, error: error.message });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/obsidian/sync-summary") {
        const body = await readJson(req);
        try {
          const state = await new BackupManager({ root }).exportState();
          const result = await operator.obsidian.syncJarvisSummary({
            state,
            confirmToken: body.confirmToken
          });
          sendJson(res, 200, { ok: true, result });
        } catch (error) {
          sendJson(res, 409, { ok: false, error: error.message });
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/graphify/export") {
        try {
          const result = await exportGraphifyMap();
          sendJson(res, 200, { ok: true, ...result });
        } catch (error) {
          sendJson(res, 409, { ok: false, error: error.message });
        }
        return;
      }

      if (req.method === "GET") {
        await serveStatic(req, res);
        return;
      }

      sendJson(res, 405, { ok: false, error: "Method not allowed" });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
  });
}
