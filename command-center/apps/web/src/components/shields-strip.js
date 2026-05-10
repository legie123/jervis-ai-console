/**
 * Shields summary from operator /api/health — counts and flags only (no paths, no PII).
 * @param {unknown} health
 * @returns {{ state: "unknown" | "ok", emergencyActive: boolean, chips: { key: string, label: string }[] }}
 */
export function summarizeShieldsForDisplay(health) {
  const sec = health && typeof health === "object" ? health.security : null;
  if (!sec || typeof sec !== "object") {
    return { state: "unknown", emergencyActive: false, chips: [] };
  }

  const pg = sec.pathGuard && typeof sec.pathGuard === "object" ? sec.pathGuard : {};
  const policy = pg.policy && typeof pg.policy === "object" ? pg.policy : {};
  const readAllow = policy.readAllow;
  const writeAllow = policy.writeAllow;
  const writeDeny = policy.writeDeny;
  const readN = Array.isArray(readAllow) ? readAllow.length : 0;
  const writeN = Array.isArray(writeAllow) ? writeAllow.length : 0;
  const denyN = Array.isArray(writeDeny) ? writeDeny.length : 0;

  const emerg = sec.emergency && typeof sec.emergency === "object" ? sec.emergency : {};
  const tok = sec.tokens && typeof sec.tokens === "object" ? sec.tokens : {};
  const pending = typeof tok.pending === "number" ? tok.pending : 0;
  const emergencyActive = Boolean(emerg.active);

  return {
    state: "ok",
    emergencyActive,
    chips: [
      { key: "path", label: `Path guard · ${readN} read zones` },
      { key: "write", label: `${writeN} write zones · ${denyN} locked trees` },
      { key: "token", label: `Scoped tokens · ${pending} pending` },
      {
        key: "emergency",
        label: emergencyActive ? "Emergency stop · active" : "Emergency stop · clear"
      }
    ]
  };
}

export function mountShieldsStrip(container) {
  if (!container) {
    return { update() {} };
  }

  container.classList.add("shields-strip");
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "Security shields summary");

  const inner = document.createElement("div");
  inner.className = "shields-strip-inner";
  container.append(inner);

  return {
    update(health) {
      const s = summarizeShieldsForDisplay(health);
      inner.replaceChildren();

      if (s.state === "unknown") {
        const p = document.createElement("p");
        p.className = "shields-strip-muted";
        p.textContent = "Shields: connect to operator to load health.";
        inner.append(p);
        container.classList.add("shields-strip--unknown");
        container.classList.remove("shields-strip--emergency");
        return;
      }

      container.classList.remove("shields-strip--unknown");
      if (s.emergencyActive) container.classList.add("shields-strip--emergency");
      else container.classList.remove("shields-strip--emergency");

      for (const c of s.chips) {
        const span = document.createElement("span");
        span.className = "shields-chip";
        span.dataset.shieldKey = c.key;
        span.textContent = c.label;
        inner.append(span);
      }
    }
  };
}
