function readOperatorApiOrigin() {
  if (typeof import.meta === "undefined") return "";
  const env = import.meta.env;
  if (!env) return "";
  const raw = env.VITE_OPERATOR_API_ORIGIN;
  return String(raw ?? "")
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Absolute URL for operator API when `VITE_OPERATOR_API_ORIGIN` is set at build time
 * (e.g. static UI on Cloud.ru OBS, API on another host). Otherwise same-origin relative `path`.
 * @param {string} path must start with `/` for API routes
 */
export function resolveApiUrl(path) {
  const p = String(path || "");
  const base = readOperatorApiOrigin();
  if (!base) return p;
  if (!p.startsWith("/")) return `${base}/${p.replace(/^\/+/, "")}`;
  return `${base}${p}`;
}
