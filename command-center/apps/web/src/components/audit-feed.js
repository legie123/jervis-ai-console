import { riskToLedIndex } from "./constants.js";

export function createAuditFeed(root, { fetchAudit }) {
  let backoffMs = 2600;
  let timer = null;
  let stopped = false;

  root.innerHTML = `
    <section class="audit-feed panel-section-elite" aria-labelledby="audit-feed-heading">
      <div class="audit-feed-head">
        <h3 id="audit-feed-heading">Audit stream</h3>
        <span class="audit-feed-live" aria-live="polite"><span class="live-dot" aria-hidden="true"></span> Live</span>
      </div>
      <div class="audit-feed-list" role="list"></div>
    </section>
  `;
  const listEl = root.querySelector(".audit-feed-list");

  function render(entries) {
    listEl.replaceChildren();
    if (!entries?.length) {
      listEl.append(emptyAudit());
      return;
    }
    const slice = entries.slice(0, 24);
    for (const entry of slice) {
      const row = document.createElement("article");
      row.className = "audit-feed-row";
      row.setAttribute("role", "listitem");
      row.innerHTML = `
        <div class="audit-feed-meta"><strong>${escapeHtml(entry.action || "")}</strong><span>${escapeHtml(entry.status || "")}</span></div>
        <div class="audit-feed-sub">${escapeHtml(entry.ts || "")} · ${escapeHtml(entry.source || "")} · ${escapeHtml(entry.risk || "")}</div>
      `;
      listEl.append(row);
    }
  }

  async function tick() {
    try {
      const entries = await fetchAudit();
      render(entries);
      backoffMs = 2600;
      return entries;
    } catch {
      backoffMs = Math.min(Math.round(backoffMs * 1.45), 28000);
      render([]);
      return [];
    }
  }

  function loop() {
    if (stopped) return;
    tick().finally(() => {
      if (!stopped) {
        clearTimeout(timer);
        timer = setTimeout(loop, backoffMs);
      }
    });
  }

  return {
    start() {
      stopped = false;
      loop();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    refresh: tick,
    lastRiskFrom(entries) {
      const first = entries?.[0];
      return riskToLedIndex(first?.risk);
    }
  };
}

function emptyAudit() {
  const wrap = document.createElement("div");
  wrap.className = "empty-state empty-state-compact";
  wrap.innerHTML = `<span class="empty-icon" aria-hidden="true"> ∅ </span><strong>No audit entries yet.</strong><span class="empty-hint">JERVIS is standing by.</span>`;
  return wrap;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
