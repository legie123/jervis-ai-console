import { test } from "node:test";
import assert from "node:assert/strict";
import { PathGuard } from "../apps/operator/src/security/path-guard.js";

test("path guard resolves allowed read paths", () => {
  const guard = new PathGuard({ root: "/tmp/jarvis" });
  const resolved = guard.resolve("apps/web/src/index.html", {
    mode: "read",
    allowedRoots: ["apps/web/src"]
  });
  assert.equal(resolved.relativePath, "apps/web/src/index.html");
  assert.equal(resolved.absolutePath, "/tmp/jarvis/apps/web/src/index.html");
});

test("path guard blocks escape and read-only writes", () => {
  const guard = new PathGuard({ root: "/tmp/jarvis" });

  assert.throws(
    () => guard.resolve("../etc/passwd", { mode: "read" }),
    /escape attempt blocked/
  );

  assert.throws(
    () => guard.resolve("apps/web/src/index.html", {
      mode: "write",
      allowedRoots: ["apps/web/src"]
    }),
    /read-only by policy/
  );
});
