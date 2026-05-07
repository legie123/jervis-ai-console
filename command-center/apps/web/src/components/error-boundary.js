export function mountErrorBoundary(bannerEl) {
  const details = bannerEl.querySelector(".error-boundary-details");

  function show(err) {
    const msg = err?.message || String(err);
    const stack = err?.stack || "";
    bannerEl.hidden = false;
    if (details) {
      details.textContent = stack || msg;
    }
    bannerEl.querySelector(".error-boundary-msg").textContent = msg;
  }

  window.addEventListener("error", (ev) => {
    show(ev.error || new Error(ev.message));
  });

  window.addEventListener("unhandledrejection", (ev) => {
    show(ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason)));
  });

  const copyBtn = bannerEl.querySelector(".error-boundary-copy");
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(details?.textContent || "");
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = "Copy stack";
      }, 1600);
    } catch {
      /* ignore */
    }
  });

  const dismiss = bannerEl.querySelector(".error-boundary-dismiss");
  dismiss?.addEventListener("click", () => {
    bannerEl.hidden = true;
  });

  return { show };
}
