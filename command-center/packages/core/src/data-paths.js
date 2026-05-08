import path from "node:path";

const DEFAULT_PROFILE = "live";
const SAFE_PROFILE = /^[a-z0-9_-]+$/i;

export function resolveDataProfile(rawProfile = process.env.JARVIS_DATA_PROFILE) {
  const profile = String(rawProfile ?? "")
    .trim()
    .toLowerCase();
  if (!profile) return DEFAULT_PROFILE;
  if (!SAFE_PROFILE.test(profile)) return DEFAULT_PROFILE;
  return profile;
}

export function dataRoot(profile = resolveDataProfile()) {
  return path.join("data", resolveDataProfile(profile));
}

export function dataPath(relativePath, { profile } = {}) {
  if (!relativePath) throw new Error("relativePath is required");
  const cleaned = String(relativePath).replace(/^[/\\]+/, "");
  return `./${path.join(dataRoot(profile), cleaned)}`;
}

export function legacyDataPath(relativePath) {
  if (!relativePath) throw new Error("relativePath is required");
  const cleaned = String(relativePath).replace(/^[/\\]+/, "");
  return `./${path.join("data", cleaned)}`;
}
