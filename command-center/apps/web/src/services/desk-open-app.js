/**
 * Canonical application names for operator `POST /api/personal/open-app` (`open -a` on macOS).
 * Matches must align with optional allowlist tokens (case-insensitive).
 */
const LABEL_ALIASES = Object.freeze({
  safari: "Safari",
  chrome: "Google Chrome",
  firefox: "Firefox",
  terminal: "Terminal",
  cursor: "Cursor",
  vscode: "Visual Studio Code",
  vs: "Visual Studio Code",
  code: "Visual Studio Code",
  notes: "Notes",
  slack: "Slack",
  mail: "Mail",
  finder: "Finder"
});

export function canonicalizeDeskOpenApp(rawInput) {
  const raw = String(rawInput || "").trim();
  if (!raw) return "";
  const ascii = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();

  const key = ascii.replace(/\s+/g, " ");
  if (LABEL_ALIASES[key]) return LABEL_ALIASES[key];
  const singleTok = LABEL_ALIASES[ascii.split(/\s+/)[0]];
  if (singleTok && raw.split(/\s+/).length === 1) return singleTok;
  return raw.replace(/\s+/g, " ");
}
