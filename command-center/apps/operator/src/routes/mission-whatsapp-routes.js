import { buildMissionStateSnapshot } from "../../../../packages/core/src/missionFsm.js";

export async function handleMissionWhatsAppRoutes(ctx) {
  const {
    req,
    url,
    operator,
    whatsappBridge,
    readJson,
    readRaw,
    sendJson,
    runMission,
    createWhatsAppDraft,
    runDueScheduler,
    verifyWebhookChallenge,
    verifyWebhookSignature,
    requireScopedToken,
    tokenService,
    INTERNAL_TOKENS
  } = ctx;

  if (req.method === "GET" && url.pathname === "/api/missions/state") {
    const missions = await operator.missions.list();
    const last = missions.length ? missions[missions.length - 1] : null;
    sendJson(ctx.res, 200, { ok: true, ...buildMissionStateSnapshot(last) });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/missions/stream") {
    const res = ctx.res;
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    let closed = false;
    let intervalId = null;
    const cleanup = () => {
      closed = true;
      if (intervalId) clearInterval(intervalId);
    };
    req.on("close", cleanup);

    const push = async () => {
      if (closed) return;
      try {
        const missions = await operator.missions.list();
        const last = missions.length ? missions[missions.length - 1] : null;
        const snapshot = buildMissionStateSnapshot(last);
        res.write(`data: ${JSON.stringify({ ok: true, ...snapshot })}\n\n`);
      } catch (error) {
        if (!closed) {
          res.write(`event: error\ndata: ${JSON.stringify({ ok: false, error: error.message })}\n\n`);
        }
      }
    };

    await push();
    intervalId = setInterval(push, 2800);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/mission") {
    const body = await readJson(req);
    const result = await runMission(body.input || "");
    sendJson(ctx.res, 200, { ok: true, ...result });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/webhooks/whatsapp") {
    const challenge = verifyWebhookChallenge(url.searchParams, process.env.WHATSAPP_VERIFY_TOKEN || "");
    if (challenge === null) {
      sendJson(ctx.res, 403, { ok: false, error: "Webhook verification failed" });
      return true;
    }
    ctx.res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    ctx.res.end(challenge);
    return true;
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
        details: { reason: signature.reason || "signature_invalid" }
      });
      sendJson(ctx.res, 403, {
        ok: false,
        error: `Bad webhook signature (${signature.reason || "invalid"})`
      });
      return true;
    }

    const payload = JSON.parse(rawBody.toString("utf8") || "{}");
    const result = await operator.whatsapp.receiveWebhook(payload);
    sendJson(ctx.res, 200, {
      ok: true,
      messages: result.saved.length,
      statuses: result.statuses.length
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/whatsapp/drafts") {
    const body = await readJson(req);
    const result = await createWhatsAppDraft(body);
    sendJson(ctx.res, 201, { ok: true, ...result });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/drafts") {
    const drafts = await operator.whatsapp.draftStore.list();
    sendJson(ctx.res, 200, { ok: true, drafts });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/messages") {
    const messages = await operator.whatsapp.listMessages();
    sendJson(ctx.res, 200, { ok: true, messages: messages.slice().reverse() });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/status") {
    sendJson(ctx.res, 200, await whatsappBridge.status());
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/preflight") {
    try {
      sendJson(ctx.res, 200, await whatsappBridge.preflight());
    } catch (error) {
      sendJson(ctx.res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/messages") {
    try {
      sendJson(ctx.res, 200, await whatsappBridge.listMessages());
    } catch (error) {
      sendJson(ctx.res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/bridge/whatsapp/drafts") {
    try {
      sendJson(ctx.res, 200, await whatsappBridge.listDrafts());
    } catch (error) {
      sendJson(ctx.res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
    }
    return true;
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
      sendJson(ctx.res, 201, { ok: true, source: "whatsapp_bridge", ...result });
    } catch (error) {
      sendJson(ctx.res, 502, { ok: false, error: error.message, source: "whatsapp_bridge" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/scheduler/jobs") {
    const jobs = await operator.scheduler.list();
    sendJson(ctx.res, 200, { ok: true, jobs: jobs.slice().reverse() });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/scheduler/run-due") {
    const result = await runDueScheduler();
    sendJson(ctx.res, 200, { ok: true, ...result });
    return true;
  }

  const confirmMatch = url.pathname.match(/^\/api\/whatsapp\/drafts\/([^/]+)\/confirm$/);
  if (req.method === "POST" && confirmMatch) {
    const draft = await operator.whatsapp.confirmDraftNoSend(confirmMatch[1]);
    sendJson(ctx.res, 200, { ok: true, draft, realSend: false });
    return true;
  }

  const sendMatch = url.pathname.match(/^\/api\/whatsapp\/drafts\/([^/]+)\/send$/);
  if (req.method === "POST" && sendMatch) {
    const body = await readJson(req);
    try {
      await requireScopedToken({
        operator,
        tokenService,
        scope: "whatsapp.send",
        token: body.confirmToken,
        targetId: sendMatch[1]
      });
      const draft = await operator.whatsapp.sendConfirmedDraft(sendMatch[1], INTERNAL_TOKENS.whatsappSend());
      sendJson(ctx.res, 200, { ok: true, draft, realSend: true });
    } catch (error) {
      sendJson(ctx.res, error.statusCode || 409, {
        ok: false,
        error: error.message,
        draft: error.draft || null
      });
    }
    return true;
  }

  const bridgeConfirmMatch = url.pathname.match(/^\/api\/bridge\/whatsapp\/drafts\/([^/]+)\/confirm$/);
  if (req.method === "POST" && bridgeConfirmMatch) {
    const body = await readJson(req);
    try {
      await requireScopedToken({
        operator,
        tokenService,
        scope: "whatsapp.bridge.send",
        token: body.confirmToken,
        targetId: bridgeConfirmMatch[1]
      });
      const result = await whatsappBridge.confirmDraft({
        id: bridgeConfirmMatch[1],
        confirmToken: INTERNAL_TOKENS.bridgeSend()
      });
      await operator.auditLog.write({
        source: "whatsapp_bridge",
        action: "bridge_draft_confirmed",
        status: "sent_or_provider_result",
        risk: "DANGEROUS",
        details: { draftId: bridgeConfirmMatch[1] }
      });
      sendJson(ctx.res, 200, { ok: true, source: "whatsapp_bridge", ...result });
    } catch (error) {
      sendJson(ctx.res, error.statusCode || 409, { ok: false, error: error.message, source: "whatsapp_bridge" });
    }
    return true;
  }

  return false;
}
