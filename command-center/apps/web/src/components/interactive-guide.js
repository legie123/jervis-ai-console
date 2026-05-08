const GUIDE_DONE_KEY = "jervis.commandCenter.spotlight.v1.done";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function getInteractiveGuideStepCount() {
  return buildSteps().length;
}

function buildSteps() {
  return [
    {
      selector: '[data-guide="topbar"]',
      sectionId: null,
      title: "Status strip",
      body: "Orb, mission FSM, voice, risk tier, clock, and boot badge stay pinned here so context never scrolls away."
    },
    {
      selector: '[data-guide="nav-rail"]',
      sectionId: "section-mission",
      title: "Workspace rail",
      body: "Mission, Ops, Bridge, System, Graph — one active pane at a time. Use ⌘1 … ⌘5 or click to switch without endless scrolling."
    },
    {
      selector: '[data-guide="stage-header"]',
      sectionId: "section-mission",
      title: "Focused stage",
      body: "Title and summary track the current workspace. Forms and tools scroll inside this column only."
    },
    {
      selector: '[data-guide="inspector"]',
      sectionId: "section-mission",
      title: "Inspector rail",
      body: "Unified inbox, tiles, audit, approvals, and Captain's Log stay beside the stage for glanceable ops."
    },
    {
      selector: '[data-guide="copilot"]',
      sectionId: "section-mission",
      title: "Context copilot",
      body: "This line reacts to boot health, gates, and mission state. ⌘K opens the palette for everything else."
    }
  ];
}

export function mountInteractiveGuide(documentRef = document, { shellNavigate } = {}) {
  const steps = buildSteps();
  let active = false;
  let stepIndex = 0;
  let onViewportChange = null;

  const root = documentRef.createElement("div");
  root.className = "interactive-guide-root";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.innerHTML = `
    <div class="interactive-guide-scrim" aria-hidden="true"></div>
    <div class="interactive-guide-hole" aria-hidden="true"></div>
    <div class="interactive-guide-card glass-modal">
      <p class="interactive-guide-progress" aria-live="polite"></p>
      <h3 class="interactive-guide-title" id="interactiveGuideTitle"></h3>
      <p class="interactive-guide-body"></p>
      <div class="interactive-guide-actions">
        <button type="button" class="btn-secondary btn-compact" data-ig-skip>Skip</button>
        <button type="button" class="btn-compact interactive-guide-next" data-ig-next>Next</button>
      </div>
    </div>
  `;

  documentRef.body.append(root);

  const scrim = root.querySelector(".interactive-guide-scrim");
  const hole = root.querySelector(".interactive-guide-hole");
  const card = root.querySelector(".interactive-guide-card");
  const progressEl = root.querySelector(".interactive-guide-progress");
  const titleEl = root.querySelector(".interactive-guide-title");
  const bodyEl = root.querySelector(".interactive-guide-body");
  const skipBtn = root.querySelector("[data-ig-skip]");
  const nextBtn = root.querySelector("[data-ig-next]");

  root.setAttribute("aria-labelledby", "interactiveGuideTitle");

  function finish(markDone) {
    active = false;
    root.hidden = true;
    scrim.style.pointerEvents = "";
    if (onViewportChange) {
      window.removeEventListener("resize", onViewportChange);
      documentRef.removeEventListener("scroll", onViewportChange, true);
      onViewportChange = null;
    }
    documentRef.removeEventListener("keydown", onKey, true);
    try {
      if (markDone) localStorage.setItem(GUIDE_DONE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function onKey(event) {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  }

  function layoutAround(target) {
    const rect = target.getBoundingClientRect();
    const pad = 10;
    const minDim = 44;
    const w = Math.max(rect.width + pad * 2, minDim);
    const h = Math.max(rect.height + pad * 2, minDim);
    const left = rect.left + rect.width / 2 - w / 2;
    const top = rect.top + rect.height / 2 - h / 2;

    hole.style.left = `${clamp(left, 8, window.innerWidth - w - 8)}px`;
    hole.style.top = `${clamp(top, 8, window.innerHeight - h - 8)}px`;
    hole.style.width = `${w}px`;
    hole.style.height = `${h}px`;

    card.style.visibility = "hidden";
    requestAnimationFrame(() => {
      const cw = card.offsetWidth || 320;
      const ch = card.offsetHeight || 160;
      const gap = 14;
      let ty = rect.bottom + gap;
      if (ty + ch > window.innerHeight - 12) {
        ty = rect.top - gap - ch;
      }
      ty = clamp(ty, 12, window.innerHeight - ch - 12);
      let tx = rect.left;
      tx = clamp(tx, 12, window.innerWidth - cw - 12);
      card.style.left = `${tx}px`;
      card.style.top = `${ty}px`;
      card.style.visibility = "";
    });
  }

  function applyStep() {
    const step = steps[stepIndex];
    if (!step) {
      finish(true);
      return;
    }

    if (step.sectionId && typeof shellNavigate === "function") {
      shellNavigate(step.sectionId);
    }

    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    progressEl.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
    nextBtn.textContent = stepIndex >= steps.length - 1 ? "Done" : "Next";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = documentRef.querySelector(step.selector);
        if (!target || !(target instanceof HTMLElement)) {
          stepIndex += 1;
          applyStep();
          return;
        }
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
        layoutAround(target);
      });
    });
  }

  function openTour() {
    active = true;
    root.hidden = false;
    scrim.style.pointerEvents = "auto";
    stepIndex = 0;
    documentRef.addEventListener("keydown", onKey, true);

    onViewportChange = () => {
      if (!active) return;
      const step = steps[stepIndex];
      const target = step ? documentRef.querySelector(step.selector) : null;
      if (target instanceof HTMLElement) layoutAround(target);
    };
    window.addEventListener("resize", onViewportChange);
    documentRef.addEventListener("scroll", onViewportChange, true);

    applyStep();
    requestAnimationFrame(() => nextBtn.focus());
  }

  skipBtn.addEventListener("click", () => finish(false));
  nextBtn.addEventListener("click", () => {
    if (stepIndex >= steps.length - 1) {
      finish(true);
      return;
    }
    stepIndex += 1;
    applyStep();
    requestAnimationFrame(() => nextBtn.focus());
  });

  scrim.addEventListener("click", () => finish(false));

  return {
    startTour: openTour,
    hasCompletedTour() {
      try {
        return Boolean(localStorage.getItem(GUIDE_DONE_KEY));
      } catch {
        return false;
      }
    }
  };
}
