import path from "node:path";
import { BackupManager } from "../../../../packages/memory/src/index.js";

export async function handleSystemRoutes(ctx) {
  const {
    req,
    url,
    root,
    operator,
    tokenService,
    readJson,
    sendJson,
    pathGuard,
    requireScopedToken,
    INTERNAL_TOKENS,
    exportGraphifyMap
  } = ctx;

  if (req.method === "GET" && url.pathname === "/api/audit") {
    const entries = await operator.auditLog.tail(100);
    sendJson(ctx.res, 200, { ok: true, entries });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/backup") {
    const body = await readJson(req);
    const result = await new BackupManager({ root }).createBackup(body.label || "");
    sendJson(ctx.res, 201, { ok: true, ...result });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/state/export") {
    const state = await new BackupManager({ root }).exportState();
    sendJson(ctx.res, 200, { ok: true, state });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/restore") {
    const body = await readJson(req);
    try {
      const backupInput = String(body.backupPath || "");
      const relativeBackupInput = path.isAbsolute(backupInput) ? path.relative(root, backupInput) : backupInput;
      const backupPath = pathGuard.resolve(relativeBackupInput, {
        mode: "read",
        allowedRoots: ["data/exports"]
      }).relativePath;
      await requireScopedToken({
        operator,
        tokenService,
        scope: "backup.restore",
        token: body.confirmToken,
        targetId: backupPath
      });
      const result = await new BackupManager({ root }).restoreBackup(backupPath, INTERNAL_TOKENS.restore());
      sendJson(ctx.res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(ctx.res, error.statusCode || 409, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/obsidian/sync-summary") {
    const body = await readJson(req);
    try {
      await requireScopedToken({
        operator,
        tokenService,
        scope: "obsidian.sync",
        token: body.confirmToken
      });
      const state = await new BackupManager({ root }).exportState();
      const result = await operator.obsidian.syncJarvisSummary({
        state,
        confirmToken: INTERNAL_TOKENS.obsidianSync()
      });
      sendJson(ctx.res, 200, { ok: true, result });
    } catch (error) {
      sendJson(ctx.res, error.statusCode || 409, { ok: false, error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/graphify/export") {
    try {
      const result = await exportGraphifyMap();
      sendJson(ctx.res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(ctx.res, 409, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}
