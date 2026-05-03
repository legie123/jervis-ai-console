import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import { getConfig } from "./config.js";
import { DraftStore, JsonlStore } from "./storage.js";
import { WhatsAppCloudApi } from "./whatsapp/cloudApi.js";
import {
  extractWebhookEvents,
  verifyMetaSignature,
  verifyWebhookSubscription
} from "./whatsapp/webhook.js";

function validateDraftInput({ to, text }) {
  if (!to || typeof to !== "string") return "Missing recipient";
  if (!/^\d{6,20}$/.test(to)) return "Recipient must be digits only, country code included";
  if (!text || typeof text !== "string" || !text.trim()) return "Missing text";
  if (text.length > 4096) return "Text exceeds WhatsApp 4096 character limit";
  return null;
}

export function createApp({ config = getConfig(), fetchImpl = fetch } = {}) {
  const app = express();
  const messages = new JsonlStore(path.join(config.dataDir, "whatsapp-messages.jsonl"));
  const audit = new JsonlStore(path.join(config.dataDir, "audit.jsonl"));
  const drafts = new DraftStore(path.join(config.dataDir, "whatsapp-drafts.json"));
  const whatsapp = new WhatsAppCloudApi({ ...config.whatsapp, fetchImpl });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      whatsapp: {
        webhookVerifyToken: Boolean(config.whatsapp.verifyToken),
        sendConfigured: whatsapp.isConfigured(),
        signatureRequired: config.nodeEnv === "production",
        signatureConfigured: Boolean(config.whatsapp.appSecret)
      }
    });
  });

  app.get("/webhooks/whatsapp", (req, res) => {
    const challenge = verifyWebhookSubscription(req.query, config.whatsapp.verifyToken);
    if (challenge === null) return res.sendStatus(403);
    return res.status(200).send(challenge);
  });

  app.post("/webhooks/whatsapp", express.raw({ type: "application/json" }), async (req, res, next) => {
    try {
      const signature = verifyMetaSignature({
        rawBody: req.body,
        signatureHeader: req.get("x-hub-signature-256"),
        appSecret: config.whatsapp.appSecret,
        nodeEnv: config.nodeEnv
      });

      if (!signature.ok) {
        await audit.append({
          ts: new Date().toISOString(),
          source: "whatsapp",
          action: "webhook_rejected",
          reason: "bad_signature"
        });
        return res.sendStatus(403);
      }

      const payload = JSON.parse(req.body.toString("utf8"));
      const events = extractWebhookEvents(payload);

      for (const message of events.messages) {
        await messages.append({ ...message, receivedAt: new Date().toISOString() });
        await audit.append({
          ts: new Date().toISOString(),
          source: "whatsapp",
          action: "message_received",
          messageId: message.id,
          from: message.from,
          type: message.type
        });
      }

      for (const status of events.statuses) {
        await audit.append({
          ts: new Date().toISOString(),
          source: "whatsapp",
          action: "message_status",
          messageId: status.id,
          status: status.status,
          recipientId: status.recipientId
        });
      }

      return res.json({ ok: true, messages: events.messages.length, statuses: events.statuses.length });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/whatsapp/messages", async (req, res, next) => {
    try {
      res.json({ messages: await messages.list({ limit: Number(req.query.limit || 100) }) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp/drafts", async (_req, res, next) => {
    try {
      res.json({ drafts: await drafts.list() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp/drafts", express.json(), async (req, res, next) => {
    try {
      const validationError = validateDraftInput(req.body || {});
      if (validationError) return res.status(400).json({ ok: false, error: validationError });

      const draft = await drafts.create({
        id: crypto.randomUUID(),
        to: req.body.to,
        text: req.body.text.trim(),
        status: "pending_confirmation",
        risk: "DANGEROUS_external_message",
        createdAt: new Date().toISOString(),
        reason: req.body.reason || ""
      });

      await audit.append({
        ts: new Date().toISOString(),
        source: "jarvis",
        action: "whatsapp_draft_created",
        draftId: draft.id,
        to: draft.to
      });

      return res.status(201).json({ ok: true, draft });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/whatsapp/drafts/:id/confirm", async (req, res, next) => {
    try {
      const draft = await drafts.get(req.params.id);
      if (!draft) return res.status(404).json({ ok: false, error: "Draft not found" });
      if (draft.status !== "pending_confirmation") {
        return res.status(409).json({ ok: false, error: `Draft status is ${draft.status}` });
      }

      try {
        const providerResponse = await whatsapp.sendText({ to: draft.to, text: draft.text });
        const sentDraft = await drafts.update(draft.id, {
          status: "sent",
          sentAt: new Date().toISOString(),
          providerResponse
        });
        await audit.append({
          ts: new Date().toISOString(),
          source: "whatsapp",
          action: "message_sent",
          draftId: draft.id,
          to: draft.to
        });
        return res.json({ ok: true, draft: sentDraft });
      } catch (error) {
        const failedDraft = await drafts.update(draft.id, {
          status: "send_failed",
          error: error.message
        });
        await audit.append({
          ts: new Date().toISOString(),
          source: "whatsapp",
          action: "message_send_failed",
          draftId: draft.id,
          to: draft.to,
          error: error.message
        });
        return res.status(502).json({ ok: false, error: error.message, draft: failedDraft });
      }
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(500).json({ ok: false, error: error.message });
  });

  return app;
}
