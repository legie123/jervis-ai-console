export const NAV_SECTION_IDS = Object.freeze([
  "section-mission",
  "section-ops",
  "section-bridge",
  "section-system",
  "section-graph",
  "section-desk"
]);

export const SECTION_STAGE_META = Object.freeze({
  "section-mission": {
    title: "Mission",
    blurb: "Compose missions and read planner output in one focused pane."
  },
  "section-ops": {
    title: "Ops",
    blurb: "Drafts, inbox, send gates, and Ruflo Agents channel (live feed + audit-backed events)."
  },
  "section-bridge": {
    title: "Bridge",
    blurb: "WhatsApp bridge health, tokens, and live payloads."
  },
  "section-system": {
    title: "System",
    blurb: "Scheduler jobs, backups, and vault sync."
  },
  "section-graph": {
    title: "Graph",
    blurb: "Operational map search, zoom, and Graphify export."
  },
  "section-desk": {
    title: "Desk",
    blurb: "Personal notes, priorities, voice hooks, and Ruflo pulse — local desk beside operator tools."
  }
});

function isQuestionMarkShortcut(event) {
  return event.key === "?" || (event.key === "/" && event.shiftKey);
}

function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const tagName = target instanceof HTMLElement ? target.tagName : "";
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function resolvePendingGateStep(pendingGate) {
  const dlg = pendingGate?.element;
  if (!dlg?.open) return false;
  const phrase = document.querySelector("#pendingPhraseInput");
  if (phrase && phrase.value.trim().toUpperCase() === "CONFIRM") {
    document.querySelector("#pendingStep2Btn")?.click();
  } else {
    document.querySelector("#pendingStep1Btn")?.click();
  }
  return true;
}

export function applyWorkspaceVisibility(documentRef, activeId) {
  if (!NAV_SECTION_IDS.includes(activeId)) return false;
  NAV_SECTION_IDS.forEach((sid) => {
    const sectionEl = documentRef.getElementById(sid);
    if (!sectionEl) return;
    sectionEl.toggleAttribute("hidden", sid !== activeId);
  });
  return true;
}

export function createShellNavigation({
  documentRef = document,
  navButtons = [],
  shortcutsOverlay,
  shortcutsCloseBtn,
  paletteCtl,
  operatorSettings,
  pendingGate,
  onEmergencyStop,
  onError,
  onActiveSectionChange
}) {
  function closeShortcutsOverlay() {
    if (shortcutsOverlay) shortcutsOverlay.hidden = true;
  }

  function toggleShortcutsOverlay() {
    if (shortcutsOverlay) shortcutsOverlay.hidden = !shortcutsOverlay.hidden;
  }

  function scrollToSection(id) {
    if (!applyWorkspaceVisibility(documentRef, id)) return;

    navButtons.forEach((button) => {
      const active = button.dataset.target === id;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    const main = documentRef.getElementById("main-content");
    if (main) main.scrollTop = 0;

    const meta = SECTION_STAGE_META[id];
    const titleEl = documentRef.getElementById("stageTitle");
    const blurbEl = documentRef.getElementById("stageBlurb");
    if (meta && titleEl) titleEl.textContent = meta.title;
    if (meta && blurbEl) blurbEl.textContent = meta.blurb;

    onActiveSectionChange?.(id);
  }

  navButtons.forEach((button) => {
    button.addEventListener("click", () => scrollToSection(button.dataset.target));
  });

  shortcutsCloseBtn?.addEventListener("click", closeShortcutsOverlay);
  shortcutsOverlay?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(".shortcuts-card")) closeShortcutsOverlay();
  });
  shortcutsOverlay?.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest(".shortcuts-card")) closeShortcutsOverlay();
  });

  documentRef.addEventListener("keydown", (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      paletteCtl.open();
    }
    if (meta && event.key === ",") {
      event.preventDefault();
      operatorSettings.open();
    }
    if (meta && event.key === ".") {
      event.preventDefault();
      Promise.resolve(onEmergencyStop?.("keyboard_shortcut")).catch((error) => onError?.(error));
    }
    if (meta && event.key >= "1" && event.key <= "6") {
      event.preventDefault();
      const id = NAV_SECTION_IDS[Number(event.key) - 1];
      if (id) scrollToSection(id);
    }
    if (!meta && isQuestionMarkShortcut(event) && !isEditableTarget(event.target)) {
      event.preventDefault();
      toggleShortcutsOverlay();
    }
    if (event.key === "Escape" && shortcutsOverlay && !shortcutsOverlay.hidden) {
      closeShortcutsOverlay();
    }
    if ((meta || event.ctrlKey) && event.key === "Enter") {
      if (resolvePendingGateStep(pendingGate)) {
        event.preventDefault();
      }
    }
  });

  return {
    scrollToSection,
    navTargets: () => [...NAV_SECTION_IDS],
    closeShortcutsOverlay,
    toggleShortcutsOverlay
  };
}
