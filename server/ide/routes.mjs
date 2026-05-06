/**
 * server/ide/routes.mjs — HTTP wire for IDE Layer
 * Author: claude-coder (sesiunea 2026-05-06)
 *
 * Drop-in for jervis-boot.mjs HTTP server.
 * Adds 6 routes:
 *   POST /api/ide/open_in_claude_code   {project}
 *   POST /api/ide/open_in_cursor        {project}
 *   POST /api/ide/open_in_antigravity   {project}
 *   POST /api/ide/open_in_vscode        {project}
 *   POST /api/ide/open_codex_task       {task, project?}
 *   GET  /api/ide/project_status?project=...
 *   GET  /api/ide/detect
 *
 * Use:
 *   import { handleIdeRoute } from "./server/ide/routes.mjs";
 *   if (await handleIdeRoute(req, res, body)) return;  // matched + handled
 */

import { IDE_REGISTRY, detectAvailableIdes, resolveProjectPath } from "./index.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 64 * 1024) reject(new Error("body too large")); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload, null, 2));
}

/**
 * Returns true if the route was handled (matched + responded).
 * jervis-boot.mjs should fall through to its other routes if false.
 */
export async function handleIdeRoute(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  if (!pathname.startsWith("/api/ide/")) return false;

  const action = pathname.replace("/api/ide/", "");

  // GET /api/ide/detect
  if (action === "detect" && req.method === "GET") {
    try {
      const r = await detectAvailableIdes();
      send(res, 200, { ok: true, available: r });
    } catch (err) { send(res, 500, { ok: false, error: err.message }); }
    return true;
  }

  // GET /api/ide/project_status
  if (action === "project_status" && req.method === "GET") {
    const project = url.searchParams.get("project");
    if (!project) { send(res, 400, { ok: false, error: "missing ?project=" }); return true; }
    try {
      const r = await IDE_REGISTRY.project_status(project);
      send(res, r.ok ? 200 : 400, r);
    } catch (err) { send(res, 500, { ok: false, error: err.message }); }
    return true;
  }

  // POST routes
  if (req.method !== "POST") {
    send(res, 405, { ok: false, error: "method not allowed", expected: "POST" });
    return true;
  }

  const fn = IDE_REGISTRY[action];
  if (!fn) {
    send(res, 404, { ok: false, error: `unknown ide action: ${action}`, available: Object.keys(IDE_REGISTRY) });
    return true;
  }

  let payload;
  try {
    const raw = await readBody(req);
    payload = raw ? JSON.parse(raw) : {};
  } catch (err) {
    send(res, 400, { ok: false, error: `bad JSON body: ${err.message}` });
    return true;
  }

  try {
    let r;
    if (action === "open_codex_task") {
      r = await fn(payload.task, { project: payload.project });
    } else {
      r = await fn(payload.project);
    }
    send(res, r.ok ? 200 : 400, r);
  } catch (err) {
    send(res, 500, { ok: false, action, error: err.message });
  }
  return true;
}

export default { handleIdeRoute };
