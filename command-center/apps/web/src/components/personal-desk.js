import { canonicalizeDeskOpenApp } from "../services/desk-open-app.js";
import { loadPriorities, loadScratch, savePriorities, saveScratch } from "../services/personal-desk-store.js";

function emptyList(container, icon, title, hint) {
  container.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.innerHTML = `<span class="empty-icon" aria-hidden="true">${icon}</span><strong>${title}</strong><span class="empty-hint">${hint}</span>`;
  container.append(wrap);
}

/** @typedef {{ voiceCommandHandlers: Record<string, Function>, toastRegion: object, scrollToSection: (id:string)=>void, api: Function, apiOptional: Function }} MountOpts */

/** @param {MountOpts & { auditCtl?: { refresh?: () => Promise<void> } }} opts */
export function mountPersonalDesk(opts) {
  const { voiceCommandHandlers, toastRegion, scrollToSection, api, apiOptional, auditCtl } = opts;

  const personalDeskNotes = document.querySelector("#personalDeskNotes");
  const personalDeskSaveNotes = document.querySelector("#personalDeskSaveNotes");
  const personalDeskPriorityNew = document.querySelector("#personalDeskPriorityNew");
  const personalDeskPriorityAdd = document.querySelector("#personalDeskPriorityAdd");
  const personalDeskPriorityList = document.querySelector("#personalDeskPriorityList");
  const personalDeskRufloStrip = document.querySelector("#personalDeskRufloStrip");
  const personalDeskOpenApp = document.querySelector("#personalDeskOpenApp");
  const personalDeskOpenAppBtn = document.querySelector("#personalDeskOpenAppBtn");
  const personalDeskOpenConfirm = document.querySelector("#personalDeskOpenConfirm");

  const ls = typeof globalThis !== "undefined" ? globalThis.localStorage : null;
  let personalPriorities = [];

  function persistPrioritiesLocally({ announce = false } = {}) {
    savePriorities(personalPriorities, ls);
    if (announce) toastRegion.push("Priorities saved locally", "info");
  }

  function persistScratchQuiet() {
    saveScratch(String(personalDeskNotes?.value || ""), ls);
  }

  function saveScratchNotesManual() {
    persistScratchQuiet();
    toastRegion.push("Notes saved in this browser", "info");
  }

  function renderPersonalPriorities() {
    if (!personalDeskPriorityList) return;
    personalDeskPriorityList.replaceChildren();
    const sorted = [...personalPriorities].sort((a, b) => a.order - b.order);
    if (sorted.length === 0) {
      emptyList(
        personalDeskPriorityList,
        "☆",
        "No priorities",
        'Add one above or say “prioritate …”.'
      );
      return;
    }
    sorted.forEach((item, idx) => {
      const row = document.createElement("article");
      row.className = "item desk-priority-row";
      row.setAttribute("role", "listitem");

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = item.done;
      chk.setAttribute("aria-label", `Done: ${item.text}`);
      chk.addEventListener("change", () => {
        item.done = chk.checked;
        persistPrioritiesLocally({ announce: false });
        renderPersonalPriorities();
      });

      const lab = document.createElement("span");
      lab.textContent = item.text;
      if (item.done) lab.classList.add("desk-priority-done");

      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "↑";
      up.setAttribute("aria-label", "Move up");
      up.disabled = idx === 0;
      up.addEventListener("click", () => {
        if (idx === 0) return;
        const prev = sorted[idx - 1];
        const tmp = item.order;
        item.order = prev.order;
        prev.order = tmp;
        persistPrioritiesLocally({ announce: false });
        renderPersonalPriorities();
      });

      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "↓";
      down.setAttribute("aria-label", "Move down");
      down.disabled = idx === sorted.length - 1;
      down.addEventListener("click", () => {
        if (idx >= sorted.length - 1) return;
        const next = sorted[idx + 1];
        const tmp = item.order;
        item.order = next.order;
        next.order = tmp;
        persistPrioritiesLocally({ announce: false });
        renderPersonalPriorities();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Remove";
      del.addEventListener("click", () => {
        personalPriorities = personalPriorities.filter((p) => p.id !== item.id);
        persistPrioritiesLocally({ announce: true });
        renderPersonalPriorities();
      });

      const toolbar = document.createElement("div");
      toolbar.className = "row-toolbar desk-priority-tools";
      toolbar.append(up, down, del);

      row.append(chk, lab, toolbar);
      personalDeskPriorityList.append(row);
    });
  }

  async function refreshPersonalRufloStrip() {
    if (!personalDeskRufloStrip) return;
    try {
      const payload = await apiOptional("/api/ruflo/feed");
      if (!payload) {
        personalDeskRufloStrip.textContent = "Ruflo: offline or unavailable.";
        return;
      }
      const entries = payload.entries || [];
      const latest = entries[0];
      personalDeskRufloStrip.textContent = latest
        ? `Ruflo pulse · ${entries.length} recent · latest: ${latest.title || "event"}`
        : `Ruflo pulse · ${payload.enabled === false ? "adapter disabled" : "no entries yet"}`;
    } catch {
      personalDeskRufloStrip.textContent = "Ruflo: could not load feed.";
    }
  }

  function loadPersonalDeskLocal() {
    if (personalDeskNotes) {
      personalDeskNotes.value = loadScratch(ls);
    }
    personalPriorities = loadPriorities(ls);
    renderPersonalPriorities();
    void refreshPersonalRufloStrip();
  }

  function deskOpenConfirmValue() {
    return String(personalDeskOpenConfirm?.value || "").trim();
  }

  async function handleDeskOpenApp(appRaw) {
    const label = canonicalizeDeskOpenApp(String(appRaw || "").trim());
    if (!label) {
      toastRegion.push("App name required", "error");
      return;
    }
    try {
      const body = { app: label };
      const confirmTok = deskOpenConfirmValue();
      if (confirmTok) body.confirmToken = confirmTok;
      const result = await api("/api/personal/open-app", { method: "POST", body: JSON.stringify(body) });
      if (result.dryRun) toastRegion.push(`Open (dry run): ${result.app}`, "info");
      else toastRegion.push(`Opened ${result.app}`, "info");
    } catch (e) {
      toastRegion.push(
        `Desktop bridge · ${String(e.message || e)}`,
        "error"
      );
    }
  }

  async function deskOpenViaVoice(parsedApp) {
    const label = canonicalizeDeskOpenApp(String(parsedApp || "").trim());
    if (!label) return { spokenText: "Which app should I open?" };
    try {
      const body = { app: label };
      const confirmTok = deskOpenConfirmValue();
      if (confirmTok) body.confirmToken = confirmTok;
      const res = await api("/api/personal/open-app", { method: "POST", body: JSON.stringify(body) });
      if (res.dryRun) return { spokenText: `Dry run: would open ${res.app}.` };
      toastRegion.push(`Opened ${res.app}`, "info");
      return { spokenText: `Opened ${res.app}.` };
    } catch (e) {
      const msg =
        typeof e.message === "string"
          ? e.message
          : "Open-app failed — check JARVIS_OPEN_APP_ALLOWLIST on the operator host.";
      toastRegion.push(`Desktop bridge · ${msg}`, "error");
      return { spokenText: msg };
    }
  }

  Object.assign(voiceCommandHandlers, {
    desk_note: async ({ parsed }) => {
      const line = String(parsed.payload?.text || "").trim();
      if (!line) return { spokenText: "I did not catch the note text." };
      const cur = personalDeskNotes?.value || "";
      personalDeskNotes.value = cur.trim() ? `${cur.trimEnd()}\n${line}` : line;
      persistScratchQuiet();
      scrollToSection("section-desk");
      return { spokenText: "Note saved locally." };
    },
    desk_add_priority: async ({ parsed }) => {
      const text = String(parsed.payload?.text || "").trim();
      if (!text) return { spokenText: "I did not catch the priority." };
      const maxOrder = personalPriorities.reduce((m, p) => Math.max(m, Number(p.order) || 0), -1);
      personalPriorities.push({
        id: `p_${Date.now()}`,
        text,
        done: false,
        order: maxOrder + 1
      });
      persistPrioritiesLocally({ announce: false });
      renderPersonalPriorities();
      scrollToSection("section-desk");
      return { spokenText: "Priority added." };
    },
    desk_open_app: async ({ parsed }) => deskOpenViaVoice(parsed.payload?.app)
  });

  personalDeskSaveNotes?.addEventListener("click", async () => {
    try {
      saveScratchNotesManual();
      await auditCtl?.refresh?.().catch(() => {});
    } catch (err) {
      toastRegion.push(err.message, "error");
    }
  });
  personalDeskPriorityAdd?.addEventListener("click", () => {
    try {
      const text = personalDeskPriorityNew?.value?.trim();
      if (!text) {
        toastRegion.push("Enter a priority", "error");
        return;
      }
      const maxOrder = personalPriorities.reduce((m, p) => Math.max(m, Number(p.order) || 0), -1);
      personalPriorities.push({
        id: `p_${Date.now()}`,
        text,
        done: false,
        order: maxOrder + 1
      });
      personalDeskPriorityNew.value = "";
      persistPrioritiesLocally({ announce: true });
      renderPersonalPriorities();
    } catch (err) {
      toastRegion.push(err.message, "error");
    }
  });
  personalDeskOpenAppBtn?.addEventListener("click", () => handleDeskOpenApp(personalDeskOpenApp?.value));

  personalDeskNotes?.addEventListener("blur", persistScratchQuiet);

  return {
    loadPersonalDesk: loadPersonalDeskLocal,
    refreshPersonalRufloStrip
  };
}
