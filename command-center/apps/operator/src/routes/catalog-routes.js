export async function handleCatalogRoutes(ctx) {
  const {
    req,
    url,
    root,
    operator,
    whatsappBridge,
    toolCatalog,
    adapterCatalog,
    adaptersByFeedPath,
    emergencyStop,
    tokenService,
    pathGuard,
    loadAdapterFeedEntries,
    sendJson
  } = ctx;

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(ctx.res, 200, {
      ok: true,
      status: "REAL",
      root,
      tools: toolCatalog,
      whatsapp: operator.whatsapp.status(),
      whatsappBridge: await whatsappBridge.status(),
      scheduler: {
        status: process.env.JARVIS_SCHEDULER_ENABLED === "true" ? "REAL" : "PARTIAL",
        enabled: process.env.JARVIS_SCHEDULER_ENABLED === "true",
        intervalMs: Number(process.env.JARVIS_SCHEDULER_INTERVAL_MS || 60000),
        autoSend: false
      },
      security: {
        emergency: emergencyStop.status(),
        tokens: tokenService.status(),
        pathGuard: pathGuard.status()
      },
      adapters: adapterCatalog,
      obsidian: operator.obsidian.status(),
      graphify: operator.graphify.status()
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tools") {
    sendJson(ctx.res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: toolCatalog.length,
      tools: toolCatalog
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/adapters") {
    sendJson(ctx.res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      count: adapterCatalog.length,
      enabledCount: adapterCatalog.filter((adapter) => adapter.enabled).length,
      adapters: adapterCatalog
    });
    return true;
  }

  if (req.method === "GET" && adaptersByFeedPath.has(url.pathname)) {
    const adapter = adaptersByFeedPath.get(url.pathname);
    if (!adapter.enabled) {
      sendJson(ctx.res, 200, {
        ok: true,
        adapter: adapter.id,
        enabled: false,
        status: "MOCK",
        entries: []
      });
      return true;
    }

    const entries = await loadAdapterFeedEntries(operator, adapter.id);
    sendJson(ctx.res, 200, {
      ok: true,
      adapter: adapter.id,
      enabled: true,
      status: entries.length ? "REAL" : "PARTIAL",
      entries
    });
    return true;
  }

  return false;
}
