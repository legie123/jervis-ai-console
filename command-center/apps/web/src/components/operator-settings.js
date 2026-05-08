import {
  BOOT_FSM_URLS,
  clearStoredBootFsmUrls,
  loadStoredBootFsmUrls,
  resolveBootFsmUrls,
  saveStoredBootFsmUrls
} from "./constants.js";

const MAX_ENTRIES = 4;

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowTemplate(entry, index) {
  return `
    <fieldset class="op-settings-row" data-row="${index}">
      <legend>Boot ${index + 1}</legend>
      <label>
        <span>Label</span>
        <input class="op-settings-label" type="text" value="${escapeHtml(entry.label || "")}" placeholder="Codex / Claude V3" maxlength="32" />
      </label>
      <label>
        <span>FSM URL</span>
        <input class="op-settings-url" type="url" value="${escapeHtml(entry.url || "")}" placeholder="http://127.0.0.1:7777/fsm" required />
      </label>
      <label>
        <span>Port</span>
        <input class="op-settings-port" type="number" inputmode="numeric" min="1" max="65535" value="${escapeHtml(entry.port || "")}" />
      </label>
      <button type="button" class="btn-secondary btn-compact op-settings-remove" aria-label="Remove this boot URL">Remove</button>
    </fieldset>
  `;
}

/**
 * Operator Settings dialog. Faza 2: per-operator overrides for boot FSM URLs
 * persisted in localStorage. No recompile, no env edit, no shell.
 *
 * @param {HTMLElement} container
 * @param {{ onSaved?: () => void, onClose?: () => void }} hooks
 */
export function mountOperatorSettings(container, hooks = {}) {
  container.innerHTML = `
    <dialog class="op-settings-dialog glass-modal" id="opSettingsDialog" aria-labelledby="opSettingsTitle">
      <form class="op-settings-form" method="dialog">
        <header class="op-settings-head">
          <h2 id="opSettingsTitle">Operator settings</h2>
          <p class="op-settings-sub">Boot FSM endpoints. Persisted locally on this machine. Reload not required — next poll picks them up.</p>
        </header>
        <div class="op-settings-rows" id="opSettingsRows" aria-live="polite"></div>
        <div class="op-settings-actions">
          <button type="button" class="btn-secondary" id="opSettingsAddBtn">Add boot URL</button>
          <button type="button" class="btn-secondary" id="opSettingsResetBtn">Reset defaults</button>
          <span class="op-settings-status" id="opSettingsStatus" aria-live="polite"></span>
          <button type="button" class="btn-secondary" id="opSettingsCancelBtn">Close <kbd>Esc</kbd></button>
          <button type="button" class="btn-primary" id="opSettingsSaveBtn">Save</button>
        </div>
      </form>
    </dialog>
  `;

  const dialog = container.querySelector("#opSettingsDialog");
  const rowsEl = container.querySelector("#opSettingsRows");
  const statusEl = container.querySelector("#opSettingsStatus");
  const addBtn = container.querySelector("#opSettingsAddBtn");
  const resetBtn = container.querySelector("#opSettingsResetBtn");
  const cancelBtn = container.querySelector("#opSettingsCancelBtn");
  const saveBtn = container.querySelector("#opSettingsSaveBtn");

  function setStatus(text, kind = "info") {
    statusEl.textContent = text || "";
    statusEl.dataset.kind = text ? kind : "";
  }

  function renderRows(entries) {
    const list = entries.length ? entries : [...BOOT_FSM_URLS];
    rowsEl.innerHTML = list
      .slice(0, MAX_ENTRIES)
      .map((entry, index) => rowTemplate(entry, index))
      .join("");
    rowsEl.querySelectorAll(".op-settings-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (rowsEl.children.length <= 1) {
          setStatus("At least one boot URL required.", "warn");
          return;
        }
        btn.closest("fieldset")?.remove();
        setStatus("");
      });
    });
  }

  function readEntries() {
    return Array.from(rowsEl.querySelectorAll(".op-settings-row")).map((field) => ({
      label: field.querySelector(".op-settings-label")?.value || "",
      url: field.querySelector(".op-settings-url")?.value || "",
      port: field.querySelector(".op-settings-port")?.value || ""
    }));
  }

  addBtn.addEventListener("click", () => {
    if (rowsEl.children.length >= MAX_ENTRIES) {
      setStatus(`Max ${MAX_ENTRIES} boot URLs.`, "warn");
      return;
    }
    const idx = rowsEl.children.length;
    const tpl = document.createElement("template");
    tpl.innerHTML = rowTemplate({ label: "", url: "", port: "" }, idx).trim();
    const node = tpl.content.firstElementChild;
    node.querySelector(".op-settings-remove")?.addEventListener("click", () => {
      if (rowsEl.children.length <= 1) {
        setStatus("At least one boot URL required.", "warn");
        return;
      }
      node.remove();
    });
    rowsEl.append(node);
    setStatus("");
  });

  resetBtn.addEventListener("click", () => {
    clearStoredBootFsmUrls();
    renderRows([...BOOT_FSM_URLS]);
    setStatus("Defaults restored. Save to apply.", "info");
  });

  cancelBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    setStatus("");
    hooks.onClose?.();
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.close();
  });

  saveBtn.addEventListener("click", () => {
    const entries = readEntries();
    const cleaned = entries
      .map((e) => ({ label: e.label.trim(), url: e.url.trim(), port: e.port }))
      .filter((e) => e.url);
    if (!cleaned.length) {
      setStatus("Need at least one URL.", "warn");
      return;
    }
    const ok = saveStoredBootFsmUrls(cleaned);
    if (!ok) {
      setStatus("Storage unavailable. Settings not persisted.", "warn");
      return;
    }
    setStatus("Saved. Boot poller will pick up next tick.", "info");
    hooks.onSaved?.();
    setTimeout(() => dialog.close(), 600);
  });

  return {
    open() {
      const stored = loadStoredBootFsmUrls();
      const seed = stored && stored.length ? stored : [...resolveBootFsmUrls()];
      renderRows(seed);
      setStatus("");
      dialog.showModal();
      requestAnimationFrame(() => {
        rowsEl.querySelector(".op-settings-url")?.focus();
      });
    },
    close() {
      dialog.close();
    },
    get element() {
      return dialog;
    }
  };
}
