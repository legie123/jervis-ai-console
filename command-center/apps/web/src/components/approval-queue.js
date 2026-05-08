import { riskToLedIndex } from "./constants.js";

/**
 * Approval Queue — Jarvis autonomous actions waiting for human gate.
 * Premium single-file component. Glass, risk LEDs, quick actions.
 *
 * @param {HTMLElement} container
 * @param {{ pendingGate: any, toastRegion: any, onAction?: (action: object) => void }} opts
 */
export function mountApprovalQueue(container, { pendingGate, toastRegion, onAction }) {
  let actions = createInitialActions();
  const listeners = new Set();
  let demoInterval = null;
  let listEl = null;
  let countEl = null;

  container.innerHTML = `
    <details class="panel-section glass approval-queue" open>
      <summary>Approval queue <span class="aq-count">${actions.length}</span></summary>
      <div class="panel-section-body">
        <div class="aq-toolbar">
          <button type="button" class="btn-secondary btn-compact" data-aq-clear>All clear</button>
          <span class="aq-hint">Jarvis așteaptă confirmarea ta</span>
        </div>
        <div class="aq-list" role="list"></div>
      </div>
    </details>
  `;

  listEl = container.querySelector(".aq-list");
  countEl = container.querySelector(".aq-count");
  const clearBtn = container.querySelector("[data-aq-clear]");

  function snapshot() {
    return actions.map((action) => ({ ...action }));
  }

  function notify() {
    const snap = snapshot();
    listeners.forEach((listener) => {
      try {
        listener(snap);
      } catch {
        // best-effort listeners
      }
    });
  }

  function renderList() {
    listEl.replaceChildren();
    countEl.textContent = actions.length;

    if (actions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state empty-state-compact";
      empty.innerHTML = `<span class="empty-icon">✓</span><strong>Nimic în coadă.</strong><span class="empty-hint">Jarvis e autonom.</span>`;
      listEl.append(empty);
      return;
    }

    actions.forEach((actionItem) => {
      const item = document.createElement("article");
      item.className = "aq-item";
      item.dataset.id = actionItem.id;

      const riskClass = ["LOW", "MED", "HIGH", "CRIT"][riskToLedIndex(actionItem.risk)] || "LOW";
      item.innerHTML = `
        <div class="aq-head">
          <span class="risk-led aq-risk is-active" data-tier="${riskClass}"></span>
          <strong class="aq-title">${escapeHtml(actionItem.title)}</strong>
          <span class="aq-source">${escapeHtml(actionItem.source)}</span>
        </div>
        <p class="aq-details">${escapeHtml(actionItem.details)}</p>
        <div class="aq-actions">
          <button type="button" class="btn-primary aq-approve" data-action="approve">Approve</button>
          <button type="button" class="btn-secondary aq-edit" data-action="edit">Edit</button>
          <button type="button" class="btn-secondary aq-skip" data-action="skip">Skip</button>
          <button type="button" class="btn-secondary aq-always" data-action="always">Always</button>
        </div>
      `;

      item.querySelectorAll("button[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => handleAction(actionItem.id, btn.dataset.action, item));
      });

      listEl.append(item);
    });
  }

  function removeItem(id, domItem, reason) {
    actions = actions.filter((action) => action.id !== id);
    const rerender = () => {
      renderList();
      notify();
      if (reason) toastRegion.push(`Action ${reason}`, "info");
    };

    if (!domItem) {
      rerender();
      return;
    }

    domItem.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    domItem.style.opacity = "0";
    domItem.style.transform = "translateX(20px)";
    setTimeout(rerender, 220);
  }

  function approveItem(actionItem, domItem, source = "manual") {
    onAction?.({ type: "approved", action: actionItem, source });
    removeItem(actionItem.id, domItem, "approved");
    return { ok: true, action: actionItem };
  }

  async function approveById(id, { source = "manual", domItem } = {}) {
    const actionItem = actions.find((entry) => entry.id === id);
    if (!actionItem) {
      return { ok: false, reason: "not_found" };
    }

    if (["HIGH", "CRIT"].includes(String(actionItem.risk || "").toUpperCase())) {
      pendingGate.open({ message: `Confirm: ${actionItem.title}` });

      if (source === "voice") {
        toastRegion.push("High risk action requires manual gate", "info");
        return { ok: false, reason: "gate_required", action: actionItem };
      }

      setTimeout(() => {
        if (!pendingGate.element?.open) {
          approveItem(actionItem, domItem, source);
        }
      }, 800);
      return { ok: true, action: actionItem, pendingGate: true };
    }

    return approveItem(actionItem, domItem, source);
  }

  async function handleAction(id, verb, domItem) {
    const actionItem = actions.find((entry) => entry.id === id);
    if (!actionItem) return;

    if (verb === "approve") {
      await approveById(id, { source: "manual", domItem });
      return;
    }

    if (verb === "edit") {
      const newTitle = prompt("Edit action title:", actionItem.title);
      if (newTitle && newTitle.trim()) {
        actionItem.title = newTitle.trim();
        renderList();
        notify();
        toastRegion.push("Action edited", "info");
      }
      return;
    }

    if (verb === "skip") {
      removeItem(id, domItem, "skipped");
      onAction?.({ type: "skipped", action: actionItem, source: "manual" });
      return;
    }

    if (verb === "always") {
      toastRegion.push(`Always auto for "${actionItem.type}"`, "info");
      removeItem(id, domItem, "always");
      onAction?.({ type: "always", action: actionItem, source: "manual" });
    }
  }

  clearBtn.addEventListener("click", () => {
    actions = [];
    renderList();
    notify();
    toastRegion.push("Queue cleared", "info");
  });

  renderList();
  notify();

  demoInterval = setInterval(() => {
    if (actions.length >= 6) return;
    const demo = createDemoAction();
    actions.unshift(demo);
    renderList();
    notify();
    toastRegion.push("New action from Jarvis", "info");
  }, 45000);

  return {
    refresh: renderList,
    add(actionItem) {
      actions.unshift({ ...actionItem });
      renderList();
      notify();
    },
    clearDemo() {
      clearInterval(demoInterval);
    },
    clearAll({ silent = false, reason = "Queue cleared" } = {}) {
      actions = [];
      renderList();
      notify();
      if (!silent) toastRegion.push(reason, "info");
    },
    getItems() {
      return snapshot();
    },
    async approveLast({ source = "voice" } = {}) {
      const top = actions[0];
      if (!top) {
        return { ok: false, reason: "empty" };
      }
      const domItem = [...listEl.querySelectorAll(".aq-item")].find((entry) => entry.dataset.id === top.id) || null;
      return approveById(top.id, { source, domItem });
    },
    async approveById(id, { source = "voice" } = {}) {
      const domItem = [...listEl.querySelectorAll(".aq-item")].find((entry) => entry.dataset.id === id) || null;
      return approveById(id, { source, domItem });
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    focus() {
      container.querySelector(".approval-queue")?.setAttribute("open", "");
      container.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };
}

function createDemoAction() {
  const samples = [
    { type: "wa_reply", title: "Confirmă livrare colet", details: "AWB 123456789", risk: "LOW" },
    { type: "email", title: "Răspuns la cerere de ofertă", details: "Termen 5 zile", risk: "MED" },
    { type: "reminder", title: "Urmărește plată restantă", details: "€890", risk: "HIGH" }
  ];
  const s = samples[Math.floor(Math.random() * samples.length)];
  return {
    id: "d" + Date.now(),
    ...s,
    source: "Auto • acum",
    ts: Date.now()
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createInitialActions() {
  return [
    {
      id: "a1",
      type: "wa_reply",
      title: "Răspuns WA la +40722 334 455",
      details: "Confirmare întâlnire marți 14:30 la sediu.",
      risk: "MED",
      source: "WA • 2m ago",
      ts: Date.now() - 120000
    },
    {
      id: "a2",
      type: "email_summary",
      title: "Trimite summary email la clientul Acme",
      details: "3 bullet points + link la draft din Vault.",
      risk: "LOW",
      source: "Email • 14m ago",
      ts: Date.now() - 840000
    },
    {
      id: "a3",
      type: "schedule",
      title: "Programează call cu echipa de vânzări",
      details: "30 min • vineri 11:00 • Google Meet.",
      risk: "HIGH",
      source: "Calendar • 47m ago",
      ts: Date.now() - 2820000
    },
    {
      id: "a4",
      type: "reminder",
      title: "Reminder: factură scadentă Acme",
      details: "€2.340 • 3 zile întârziere.",
      risk: "CRIT",
      source: "Vault • 1h ago",
      ts: Date.now() - 3600000
    }
  ];
}
