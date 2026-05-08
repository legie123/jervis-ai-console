import { riskToLedIndex } from "./constants.js";

/**
 * Approval Queue — Jarvis autonomous actions waiting for human gate.
 * Premium single-file component. Glass, risk LEDs, quick actions.
 *
 * @param {HTMLElement} container
 * @param {{ pendingGate: any, toastRegion: any, onAction?: (action: object) => void }} opts
 */
export function mountApprovalQueue(container, { pendingGate, toastRegion, onAction }) {
  let actions = [
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

  function render() {
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

    const listEl = container.querySelector(".aq-list");
    const countEl = container.querySelector(".aq-count");
    const clearBtn = container.querySelector("[data-aq-clear]");

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

      actions.forEach((a) => {
        const item = document.createElement("article");
        item.className = "aq-item";
        item.dataset.id = a.id;

        const riskIdx = riskToLedIndex(a.risk);
        const riskClass = ["LOW", "MED", "HIGH", "CRIT"][riskIdx] || "LOW";

        item.innerHTML = `
          <div class="aq-head">
            <span class="risk-led aq-risk" data-tier="${riskClass}"></span>
            <strong class="aq-title">${escapeHtml(a.title)}</strong>
            <span class="aq-source">${escapeHtml(a.source)}</span>
          </div>
          <p class="aq-details">${escapeHtml(a.details)}</p>
          <div class="aq-actions">
            <button type="button" class="btn-primary aq-approve" data-action="approve">Approve</button>
            <button type="button" class="btn-secondary aq-edit" data-action="edit">Edit</button>
            <button type="button" class="btn-secondary aq-skip" data-action="skip">Skip</button>
            <button type="button" class="btn-secondary aq-always" data-action="always">Always</button>
          </div>
        `;

        item.querySelectorAll("button[data-action]").forEach((btn) => {
          btn.addEventListener("click", () => handleAction(a, btn.dataset.action, item));
        });

        listEl.append(item);
      });
    }

    async function handleAction(actionItem, verb, domItem) {
      if (verb === "approve") {
        if (["HIGH", "CRIT"].includes(actionItem.risk)) {
          pendingGate.open({
            message: `Confirm: ${actionItem.title}`
          });
          // wait for modal resolve via global listener or simulate
          // for demo we just proceed after short delay if user closes
          setTimeout(() => {
            if (!pendingGate.element.open) {
              approveItem(actionItem, domItem);
            }
          }, 800);
        } else {
          approveItem(actionItem, domItem);
        }
      }

      if (verb === "edit") {
        const newTitle = prompt("Edit action title:", actionItem.title);
        if (newTitle && newTitle.trim()) {
          actionItem.title = newTitle.trim();
          toastRegion.push("Action edited", "info");
          renderList();
        }
      }

      if (verb === "skip") {
        removeItem(actionItem.id, domItem, "skipped");
      }

      if (verb === "always") {
        toastRegion.push(`Always auto for "${actionItem.type}"`, "info");
        removeItem(actionItem.id, domItem, "always");
        onAction?.({ type: "always", action: actionItem });
      }
    }

    function approveItem(actionItem, domItem) {
      onAction?.({ type: "approved", action: actionItem });
      removeItem(actionItem.id, domItem, "approved");
    }

    function removeItem(id, domItem, reason) {
      actions = actions.filter((a) => a.id !== id);
      domItem.style.transition = "opacity 0.2s ease, transform 0.2s ease";
      domItem.style.opacity = "0";
      domItem.style.transform = "translateX(20px)";
      setTimeout(() => {
        renderList();
        toastRegion.push(`Action ${reason}`, "info");
      }, 220);
    }

    clearBtn.addEventListener("click", () => {
      actions = [];
      renderList();
      toastRegion.push("Queue cleared", "info");
    });

    renderList();

    // Demo: add a new random action every 45s
    const demoInterval = setInterval(() => {
      if (actions.length >= 6) return;
      const demo = createDemoAction();
      actions.unshift(demo);
      renderList();
      toastRegion.push("New action from Jarvis", "info");
    }, 45000);

    return {
      refresh: renderList,
      add: (a) => {
        actions.unshift(a);
        renderList();
      },
      clearDemo: () => clearInterval(demoInterval)
    };
  }

  return render();
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
