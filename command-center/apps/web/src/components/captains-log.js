export function isoDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftIsoDate(iso, deltaDays) {
  const [y, m, d] = String(iso || "")
    .split("-")
    .map((n) => parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return isoDateString(new Date());
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function loadCaptainsLogForDate(isoDateStr, fetchImpl = fetch) {
  const path = `/captains-log/${isoDateStr}.md`;
  try {
    const res = await fetchImpl(path, { cache: "no-store" });
    if (!res.ok) return { ok: false, text: "" };
    const text = await res.text();
    return { ok: true, text };
  } catch {
    return { ok: false, text: "" };
  }
}

export function mountCaptainsLog(container) {
  container.innerHTML = `
    <div class="captains-log-wrap">
      <div class="captains-log-nav" role="toolbar" aria-label="Captain's log date navigation">
        <button type="button" class="btn-secondary btn-compact" data-clog-prev aria-label="Previous day">‹</button>
        <input type="date" class="captains-log-date" aria-label="Captain's log date" />
        <button type="button" class="btn-secondary btn-compact" data-clog-next aria-label="Next day">›</button>
        <button type="button" class="btn-secondary btn-compact" data-clog-today>Today</button>
      </div>
      <div class="captains-log-inner"></div>
    </div>
  `;

  const dateInput = container.querySelector(".captains-log-date");
  const inner = container.querySelector(".captains-log-inner");
  const prevBtn = container.querySelector("[data-clog-prev]");
  const nextBtn = container.querySelector("[data-clog-next]");
  const todayBtn = container.querySelector("[data-clog-today]");

  let currentIso = isoDateString();
  dateInput.value = currentIso;

  async function refresh(iso = currentIso) {
    currentIso = iso;
    dateInput.value = iso;
    const today = isoDateString();
    nextBtn.disabled = iso >= today;
    const { ok, text } = await loadCaptainsLogForDate(iso);
    inner.replaceChildren();
    if (ok && text.trim()) {
      const pre = document.createElement("pre");
      pre.className = "captains-log-body";
      pre.setAttribute("tabindex", "0");
      pre.textContent = text;
      inner.append(pre);
      container.classList.remove("is-empty");
    } else {
      container.classList.add("is-empty");
      inner.append(
        emptyBlock(
          "Captain’s Log unavailable",
          `Add data/captains-log/${iso}.md under apps/web/src (static path /data/captains-log/).`
        )
      );
    }
  }

  prevBtn.addEventListener("click", () => refresh(shiftIsoDate(currentIso, -1)));
  nextBtn.addEventListener("click", () => {
    const next = shiftIsoDate(currentIso, 1);
    if (next > isoDateString()) return;
    refresh(next);
  });
  todayBtn.addEventListener("click", () => refresh(isoDateString()));
  dateInput.addEventListener("change", () => {
    if (dateInput.value) refresh(dateInput.value);
  });

  refresh(currentIso);
  return {
    refresh: () => refresh(currentIso),
    goToDate: (iso) => refresh(iso),
    get currentDate() {
      return currentIso;
    }
  };
}

function emptyBlock(title, hint) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  const icon = document.createElement("span");
  icon.className = "empty-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "📓";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.className = "empty-hint";
  span.textContent = hint;
  wrap.append(icon, strong, span);
  return wrap;
}
