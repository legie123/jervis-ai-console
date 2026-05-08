import crypto from "node:crypto";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config.js";
import { ElevenLabsClient } from "./elevenlabs/client.js";
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

function validateSpeechInput({ text, voice }) {
  if (!text || typeof text !== "string" || !text.trim()) return "Missing text";
  if (text.length > 5000) return "Text exceeds 5000 character limit";
  if (voice && !["primary", "alternate"].includes(voice)) return "Voice must be primary or alternate";
  return null;
}

function resolveSpeechVoice({ requestedVoice, elevenlabsConfig }) {
  if (requestedVoice === "alternate") {
    if (!elevenlabsConfig.altVoiceId) throw new Error("Alternate ElevenLabs voice is not configured");
    return { label: "alternate", voiceId: elevenlabsConfig.altVoiceId };
  }

  return { label: "primary", voiceId: elevenlabsConfig.voiceId };
}

function describeSecret(value) {
  return {
    present: Boolean(value),
    length: value ? value.length : 0
  };
}

function getWhatsAppPreflight({ config, whatsapp }) {
  const accessToken = config.whatsapp.accessToken || "";
  const phoneNumberId = config.whatsapp.phoneNumberId || "";
  const verifyToken = config.whatsapp.verifyToken || "";
  const appSecret = config.whatsapp.appSecret || "";
  const missing = [];

  if (!accessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!verifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");
  if (config.nodeEnv === "production" && !appSecret) missing.push("WHATSAPP_APP_SECRET");

  return {
    ok: missing.length === 0 && whatsapp.isConfigured(),
    sendConfigured: whatsapp.isConfigured(),
    webhookConfigured: Boolean(verifyToken),
    signatureConfigured: Boolean(appSecret),
    signatureRequired: config.nodeEnv === "production",
    graphVersion: config.whatsapp.graphVersion,
    missing,
    checks: {
      accessToken: {
        ...describeSecret(accessToken),
        shape: accessToken ? "present_not_logged" : "missing"
      },
      phoneNumberId: {
        present: Boolean(phoneNumberId),
        length: phoneNumberId ? phoneNumberId.length : 0,
        digitsOnly: phoneNumberId ? /^\d+$/.test(phoneNumberId) : false
      },
      verifyToken: describeSecret(verifyToken),
      appSecret: describeSecret(appSecret)
    }
  };
}

export function createApp({ config = getConfig(), fetchImpl = fetch } = {}) {
  const app = express();
  const messages = new JsonlStore(path.join(config.dataDir, "whatsapp-messages.jsonl"));
  const audit = new JsonlStore(path.join(config.dataDir, "audit.jsonl"));
  const drafts = new DraftStore(path.join(config.dataDir, "whatsapp-drafts.json"));
  const speech = new JsonlStore(path.join(config.dataDir, "elevenlabs-speech.jsonl"));
  const speechDir = path.join(config.dataDir, "speech");
  const whatsapp = new WhatsAppCloudApi({ ...config.whatsapp, fetchImpl });
  const elevenlabsConfig = config.elevenlabs || {};
  const elevenlabs = new ElevenLabsClient({ ...elevenlabsConfig, fetchImpl });

  app.use("/audio/speech", express.static(speechDir));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      whatsapp: {
        webhookVerifyToken: Boolean(config.whatsapp.verifyToken),
        sendConfigured: whatsapp.isConfigured(),
        signatureRequired: config.nodeEnv === "production",
        signatureConfigured: Boolean(config.whatsapp.appSecret)
      },
      elevenlabs: {
        ttsConfigured: elevenlabs.isConfigured(),
        voiceConfigured: Boolean(elevenlabsConfig.voiceId),
        alternateVoiceConfigured: Boolean(elevenlabsConfig.altVoiceId),
        modelId: elevenlabsConfig.modelId,
        outputFormat: elevenlabsConfig.outputFormat
      }
    });
  });

  app.get("/api/whatsapp/preflight", (_req, res) => {
    res.json(getWhatsAppPreflight({ config, whatsapp }));
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

  app.get("/api/voice/speech", async (req, res, next) => {
    try {
      res.json({ speech: await speech.list({ limit: Number(req.query.limit || 100) }) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/voice/speech", express.json(), async (req, res, next) => {
    try {
      const validationError = validateSpeechInput(req.body || {});
      if (validationError) return res.status(400).json({ ok: false, error: validationError });

      const id = crypto.randomUUID();
      const filename = `${id}.mp3`;
      const filePath = path.join(speechDir, filename);
      const selectedVoice = resolveSpeechVoice({
        requestedVoice: req.body.voice || "primary",
        elevenlabsConfig
      });

      try {
        const audio = await elevenlabs.createSpeech({
          text: req.body.text.trim(),
          voiceId: selectedVoice.voiceId
        });
        await fs.mkdir(speechDir, { recursive: true });
        await fs.writeFile(filePath, audio);

        const record = {
          id,
          provider: "elevenlabs",
          status: "created",
          risk: "DANGEROUS_third_party_text_transfer",
          voice: selectedVoice.label,
          textLength: req.body.text.trim().length,
          audioUrl: `/audio/speech/${filename}`,
          createdAt: new Date().toISOString()
        };

        await speech.append(record);
        await audit.append({
          ts: new Date().toISOString(),
          source: "elevenlabs",
          action: "speech_created",
          speechId: id,
          voice: selectedVoice.label,
          textLength: record.textLength
        });

        return res.status(201).json({ ok: true, speech: record });
      } catch (error) {
        await audit.append({
          ts: new Date().toISOString(),
          source: "elevenlabs",
          action: "speech_failed",
          error: error.message
        });
        return res.status(502).json({ ok: false, error: error.message });
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
