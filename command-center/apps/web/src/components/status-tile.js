/**
 * Simple metric tile + CSS sparkline (inline SVG polyline).
 */
export function mountStatusTile(container, { title, getValue, spark = [] }) {
  container.classList.add("status-tile");
  container.innerHTML = `
    <div class="status-tile-head">
      <span class="status-tile-title">${escapeHtml(title)}</span>
      <span class="status-tile-value" aria-live="polite">—</span>
    </div>
    <svg class="status-tile-spark" viewBox="0 0 80 24" role="img" aria-hidden="true">
      <polyline fill="none" stroke="currentColor" stroke-width="1.4" points="" />
    </svg>
    <p class="status-tile-hint" aria-hidden="true"></p>
  `;
  const valueEl = container.querySelector(".status-tile-value");
  const poly = container.querySelector("polyline");

  const series = [...spark];

  function render() {
    const v = typeof getValue === "function" ? getValue() : "—";
    valueEl.textContent = typeof v === "string" || typeof v === "number" ? String(v) : "—";
    if (series.length > 1) {
      const max = Math.max(...series, 1);
      const min = Math.min(...series, 0);
      const range = max - min || 1;
      const pts = series
        .map((y, i) => {
          const x = (i / (series.length - 1)) * 78 + 1;
          const yn = 22 - ((y - min) / range) * 20;
          return `${x.toFixed(1)},${yn.toFixed(1)}`;
        })
        .join(" ");
      poly.setAttribute("points", pts);
    }
  }

  render();
  return { update: render, pushSample(n) {
    series.push(n);
    if (series.length > 24) series.shift();
    render();
  } };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
