export async function loadCaptainsLogForDate(isoDateStr) {
  const path = `/captains-log/${isoDateStr}.md`;
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return { ok: false, text: "" };
    const text = await res.text();
    return { ok: true, text };
  } catch {
    return { ok: false, text: "" };
  }
}

export function mountCaptainsLog(container) {
  const inner = document.createElement("div");
  inner.className = "captains-log-inner";
  container.append(inner);

  async function refresh() {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  refresh();
  return { refresh };
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
