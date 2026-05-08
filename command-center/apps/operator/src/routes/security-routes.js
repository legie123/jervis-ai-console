function normalizeScope(rawScope) {
  return String(rawScope || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, "");
}

export async function handleSecurityRoutes(ctx) {
  const {
    req,
    url,
    operator,
    emergencyStop,
    tokenService,
    readJson,
    sendJson,
    requireScopedToken
  } = ctx;

  if (req.method === "GET" && url.pathname === "/api/emergency") {
    sendJson(ctx.res, 200, {
      ok: true,
      emergency: emergencyStop.status()
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/emergency/stop") {
    const body = await readJson(req);
    const emergency = emergencyStop.trigger({
      reason: body.reason || "manual_stop",
      source: body.source || "operator_api"
    });
    await operator.auditLog.write({
      source: "security",
      action: "emergency_stop_triggered",
      status: "blocked",
      risk: "CRIT",
      details: emergency
    });
    sendJson(ctx.res, 200, { ok: true, emergency });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/emergency/clear") {
    const body = await readJson(req);
    await requireScopedToken({
      operator,
      tokenService,
      scope: "emergency.clear",
      token: body.confirmToken || "",
      targetId: ""
    });
    const emergency = emergencyStop.clear({
      reason: body.reason || "manual_clear",
      source: body.source || "operator_api"
    });
    await operator.auditLog.write({
      source: "security",
      action: "emergency_stop_cleared",
      status: "ready",
      risk: "HIGH",
      details: emergency
    });
    sendJson(ctx.res, 200, { ok: true, emergency });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/security/tokens") {
    const body = await readJson(req);
    const scope = normalizeScope(body.scope);
    if (!scope) {
      sendJson(ctx.res, 400, { ok: false, error: "scope is required" });
      return true;
    }
    const issued = tokenService.issue({
      scope,
      targetId: body.targetId || "",
      ttlMs: body.ttlMs
    });
    await operator.auditLog.write({
      source: "security",
      action: "token_issued",
      status: "ready",
      risk: "HIGH",
      details: {
        scope: issued.scope,
        targetId: issued.targetId || null,
        ttlMs: issued.ttlMs
      }
    });
    sendJson(ctx.res, 201, { ok: true, token: issued });
    return true;
  }

  return false;
}
