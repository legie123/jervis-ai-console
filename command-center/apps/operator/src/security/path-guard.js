import path from "node:path";

const DEFAULT_POLICY = Object.freeze({
  readAllow: ["apps/web/src", "apps/web/dist", "data", "docs", "config"],
  writeAllow: ["data", "docs", "config"],
  writeDeny: ["apps", "packages", "scripts", ".git", "node_modules", "BRAIN"]
});

function normalizeRelative(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new Error("Path is required");
  }
  const normalized = path.normalize(inputPath).replace(/^[/\\]+/, "");
  if (!normalized || normalized === ".") {
    throw new Error("Path cannot point to root");
  }
  if (normalized.includes("\0")) {
    throw new Error("Path contains null bytes");
  }
  if (normalized.startsWith("..")) {
    throw new Error("Path escape attempt blocked");
  }
  return normalized;
}

function hasAllowedPrefix(relativePath, prefixes) {
  return prefixes.some((prefix) => {
    const normalizedPrefix = path.normalize(prefix).replace(/^[/\\]+/, "");
    return relativePath === normalizedPrefix || relativePath.startsWith(`${normalizedPrefix}${path.sep}`);
  });
}

export class PathGuard {
  constructor({ root, policy = DEFAULT_POLICY } = {}) {
    this.root = path.resolve(root || process.cwd());
    this.policy = policy;
  }

  resolve(inputPath, { mode = "read", allowedRoots } = {}) {
    const relativePath = normalizeRelative(inputPath);
    const policyRoots =
      Array.isArray(allowedRoots) && allowedRoots.length
        ? allowedRoots
        : mode === "write"
          ? this.policy.writeAllow
          : this.policy.readAllow;

    if (!hasAllowedPrefix(relativePath, policyRoots)) {
      throw new Error(`Path "${relativePath}" is outside allowed ${mode} roots`);
    }

    if (mode === "write" && hasAllowedPrefix(relativePath, this.policy.writeDeny)) {
      throw new Error(`Path "${relativePath}" is read-only by policy`);
    }

    const absolutePath = path.resolve(this.root, relativePath);
    if (!absolutePath.startsWith(this.root)) {
      throw new Error("Path escape blocked by root guard");
    }

    return {
      root: this.root,
      relativePath,
      absolutePath
    };
  }

  status() {
    return {
      enabled: true,
      root: this.root,
      policy: this.policy
    };
  }
}

export function createPathGuard(options = {}) {
  return new PathGuard(options);
}
