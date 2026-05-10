import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const required = [
  "apps/web",
  "apps/web/index.html",
  "apps/web/vite.config.js",
  "apps/web/postbuild-copy.mjs",
  "apps/web/src/index.html",
  "apps/web/src/styles.css",
  "apps/web/src/app.js",
  "apps/web/src/components/premium-ux-rail.js",
  "apps/web/src/components/shields-strip.js",
  "apps/web/src/services/collaboration-feeds.js",
  "apps/web/src/services/graph-runtime.js",
  "apps/web/src/services/security-ops.js",
  "apps/web/src/services/shell-navigation.js",
  "apps/web/src/services/mission-state-stream.js",
  "apps/web/src/services/copilot-hints.js",
  "apps/web/src/services/api-base.js",
  "apps/web/src/services/desk-open-app.js",
  "apps/web/src/services/personal-desk-store.js",
  "apps/web/src/components/personal-desk.js",
  "apps/operator",
  "apps/operator/src/http.js",
  "apps/operator/src/intent-router.js",
  "apps/operator/src/routes/security-routes.js",
  "apps/operator/src/routes/catalog-routes.js",
  "apps/operator/src/routes/mission-whatsapp-routes.js",
  "apps/operator/src/routes/system-routes.js",
  "apps/operator/src/routes/personal-routes.js",
  "apps/operator/src/security/path-guard.js",
  "apps/operator/src/security/confirmation-tokens.js",
  "apps/operator/src/security/emergency-stop.js",
  "apps/operator/src/server.js",
  "apps/operator/src/scheduler-loop.js",
  "apps/operator/src/run-scheduler.js",
  "apps/operator/src/backup.js",
  "apps/operator/src/export-state.js",
  "apps/operator/src/reset-seed.js",
  "apps/operator/src/restore.js",
  "apps/operator/src/sync-obsidian.js",
  "apps/operator/src/export-graphify.js",
  "packages/core",
  "packages/core/src/missionFsm.js",
  "packages/tools",
  "packages/whatsapp",
  "packages/whatsapp/src/messageStore.js",
  "packages/whatsapp/src/webhook.js",
  "packages/scheduler",
  "packages/memory",
  "packages/memory/src/missionStore.js",
  "packages/graphify",
  "packages/obsidian",
  "docs/ARCHITECTURE.md",
  "docs/SAFETY_RULES.md",
  "docs/ROADMAP.md",
  "docs/WHATSAPP_PLAN.md",
  "docs/LOCAL_SETUP.md",
  "config/.env.example",
  "config/tools.registry.json",
  "config/permissions.json",
  "scripts/healthcheck.sh",
  "scripts/dev-local.sh",
  "scripts/start-local.sh",
  "scripts/run-scheduler.sh",
  "scripts/backup-local.sh",
  "scripts/export-state.sh",
  "scripts/reset-seed.sh",
  "scripts/restore-local.sh",
  "scripts/sync-obsidian.sh",
  "scripts/export-graphify.sh"
];

const results = required.map((item) => {
  const fullPath = path.join(root, item);
  return {
    item,
    exists: fs.existsSync(fullPath)
  };
});

const missing = results.filter((result) => !result.exists);

console.log(
  JSON.stringify(
    {
      ok: missing.length === 0,
      root,
      status: missing.length === 0 ? "REAL" : "BROKEN",
      missing: missing.map((result) => result.item)
    },
    null,
    2
  )
);

process.exitCode = missing.length === 0 ? 0 : 1;
