import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { dataRoot } from "../../../../packages/core/src/data-paths.js";

function personalRelative(segment) {
  return path.join(dataRoot(), "personal", segment);
}

function parseOpenAppAllowlist() {
  const raw = String(process.env.JARVIS_OPEN_APP_ALLOWLIST || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveAllowlistEntry(requested, allowlist) {
  const want = String(requested || "").trim();
  if (!want) return null;
  const exact = allowlist.find((entry) => entry === want);
  if (exact) return exact;
  const lower = want.toLowerCase();
  const ci = allowlist.find((entry) => entry.toLowerCase() === lower);
  return ci || null;
}

function openAppConfirmRequired() {
  const t = String(process.env.JARVIS_OPEN_APP_CONFIRM_TOKEN || "").trim();
  return t.length ? t : "";
}

function spawnOpenApp(appName) {
  return new Promise((resolve, reject) => {
    const dry =
      process.env.JARVIS_OPEN_APP_DRY_RUN === "true" || process.env.JARVIS_OPEN_APP_DRY_RUN === "1";
    if (dry) {
      resolve({ code: 0, dryRun: true });
      return;
    }
    if (process.platform !== "darwin") {
      reject(new Error("open-app is only supported on macOS (darwin)"));
      return;
    }
    const child = spawn("open", ["-a", appName], {
      stdio: "ignore"
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ code: 0, dryRun: false });
      else reject(new Error(`open exited with code ${code}`));
    });
  });
}

async function readPersonalJson(pathGuard, relativePath, fallback) {
  let guarded;
  try {
    guarded = pathGuard.resolve(relativePath, { mode: "read" });
  } catch {
    return fallback;
  }
  try {
    const raw = await fs.readFile(guarded.absolutePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writePersonalJson(pathGuard, relativePath, data) {
  const guarded = pathGuard.resolve(relativePath, { mode: "write" });
  await fs.mkdir(path.dirname(guarded.absolutePath), { recursive: true });
  await fs.writeFile(guarded.absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function handlePersonalRoutes(ctx) {
  const { req, url, operator, readJson, sendJson, pathGuard } = ctx;

  const notesPath = personalRelative("personal-notes.json");
  const prioritiesPath = personalRelative("personal-priorities.json");

  if (req.method === "GET" && url.pathname === "/api/personal/notes") {
    const data = await readPersonalJson(pathGuard, notesPath, { notes: [] });
    sendJson(ctx.res, 200, { ok: true, notes: Array.isArray(data.notes) ? data.notes : [] });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/personal/notes") {
    const body = await readJson(req);
    const notesIn = body.notes;
    if (!Array.isArray(notesIn)) {
      sendJson(ctx.res, 400, { ok: false, error: "notes array required" });
      return true;
    }
    const notes = notesIn.map((n, i) => {
      if (typeof n === "string") {
        return { id: `n_${i}_${Date.now()}`, text: n, ts: new Date().toISOString() };
      }
      return {
        id: String(n.id || `n_${i}`),
        text: String(n.text || ""),
        ts: n.ts || new Date().toISOString()
      };
    });
    await writePersonalJson(pathGuard, notesPath, { notes });
    await operator.auditLog.write({
      source: "personal_desk",
      action: "personal_notes_write",
      status: "ok",
      risk: "LOW",
      details: { count: notes.length }
    });
    sendJson(ctx.res, 200, { ok: true, notes });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/personal/priorities") {
    const data = await readPersonalJson(pathGuard, prioritiesPath, { priorities: [] });
    sendJson(ctx.res, 200, { ok: true, priorities: Array.isArray(data.priorities) ? data.priorities : [] });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/personal/priorities") {
    const body = await readJson(req);
    const priIn = body.priorities;
    if (!Array.isArray(priIn)) {
      sendJson(ctx.res, 400, { ok: false, error: "priorities array required" });
      return true;
    }
    const priorities = priIn.map((p, i) => ({
      id: String(p.id || `p_${i}`),
      text: String(p.text || ""),
      done: Boolean(p.done),
      order: Number.isFinite(Number(p.order)) ? Number(p.order) : i
    }));
    priorities.sort((a, b) => a.order - b.order);
    await writePersonalJson(pathGuard, prioritiesPath, { priorities });
    await operator.auditLog.write({
      source: "personal_desk",
      action: "personal_priorities_write",
      status: "ok",
      risk: "LOW",
      details: { count: priorities.length }
    });
    sendJson(ctx.res, 200, { ok: true, priorities });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/personal/open-app") {
    const allowlist = parseOpenAppAllowlist();
    const body = await readJson(req);
    const rawApp = body.app;
    const resolved = resolveAllowlistEntry(rawApp, allowlist);

    if (!allowlist.length) {
      await operator.auditLog.write({
        source: "personal_desk",
        action: "personal_open_app_denied",
        status: "denied",
        risk: "MED",
        details: { reason: "empty_allowlist", requested: rawApp }
      });
      sendJson(ctx.res, 403, { ok: false, error: "open-app disabled (empty JARVIS_OPEN_APP_ALLOWLIST)" });
      return true;
    }

    if (!resolved) {
      await operator.auditLog.write({
        source: "personal_desk",
        action: "personal_open_app_denied",
        status: "denied",
        risk: "MED",
        details: { reason: "not_allowlisted", requested: rawApp }
      });
      sendJson(ctx.res, 403, { ok: false, error: "Application not allowlisted" });
      return true;
    }

    const confirmNeed = openAppConfirmRequired();
    if (confirmNeed && String(body.confirmToken || "") !== confirmNeed) {
      await operator.auditLog.write({
        source: "personal_desk",
        action: "personal_open_app_denied",
        status: "denied",
        risk: "MED",
        details: { reason: "confirm_token", app: resolved }
      });
      sendJson(ctx.res, 403, { ok: false, error: "Invalid or missing open-app confirmation token" });
      return true;
    }

    try {
      const result = await spawnOpenApp(resolved);
      await operator.auditLog.write({
        source: "personal_desk",
        action: "personal_open_app",
        status: "ok",
        risk: "DANGEROUS",
        details: { app: resolved, dryRun: Boolean(result.dryRun) }
      });
      sendJson(ctx.res, 200, { ok: true, app: resolved, dryRun: Boolean(result.dryRun) });
    } catch (error) {
      await operator.auditLog.write({
        source: "personal_desk",
        action: "personal_open_app_failed",
        status: "error",
        risk: "DANGEROUS",
        details: { app: resolved, error: error.message }
      });
      sendJson(ctx.res, 500, { ok: false, error: error.message });
    }
    return true;
  }

  return false;
}
