export function mountToastRegion(container) {
  container.classList.add("toast-region");
  container.setAttribute("role", "status");
  container.setAttribute("aria-live", "polite");

  function push(message, variant = "info") {
    const el = document.createElement("div");
    el.className = `toast toast-${variant}`;
    el.textContent = message;
    container.append(el);
    const t = setTimeout(() => {
      el.classList.add("toast-out");
      setTimeout(() => el.remove(), 280);
    }, 4000);
    el.addEventListener("click", () => {
      clearTimeout(t);
      el.remove();
    });
  }

  return { push };
}
