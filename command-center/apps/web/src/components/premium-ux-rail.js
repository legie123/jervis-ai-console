import { resolveCopilotHint } from "../services/copilot-hints.js";

const ONBOARDING_STORAGE_KEY = "jervis.commandCenter.onboarding.v1";

export function mountPremiumUxRail({ onboardingHost, copilotHost, onSpotlightTour } = {}) {
  function tryMountOnboarding() {
    if (!onboardingHost) return;
    try {
      if (localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
        onboardingHost.hidden = true;
        return;
      }
    } catch {
      onboardingHost.hidden = true;
      return;
    }

    onboardingHost.hidden = false;
    onboardingHost.innerHTML = `
      <div class="first-run-banner glass-panel" role="region" aria-label="Welcome tips">
        <div class="first-run-banner-body">
          <strong class="first-run-title">JERVIS Command Center</strong>
          <p class="first-run-copy">
            Non-intrusive mode: use <kbd class="kbd-chip">⌘K</kbd> for actions,
            <kbd class="kbd-chip">⌘.</kbd> emergency stop,
            <kbd class="kbd-chip">?</kbd> shortcuts.
            Unified inbox always syncs <strong>Ruflo</strong>, <strong>Hermes</strong>, and <strong>GoodMood</strong>
            (<code>/api/ruflo/feed</code>, <code>/api/hermes/feed</code>, <code>/api/good-mood/feed</code>) alongside other adapters.
            Mission plans stream below the orb when boot is idle.
            <span class="first-run-meta">⌘6 Desk · nightly verify: see <code>docs/NIGHTLY_RUNNER.md</code>.</span>
          </p>
        </div>
        <div class="first-run-banner-actions">
          ${
            typeof onSpotlightTour === "function"
              ? `<button type="button" class="btn-secondary btn-compact" data-start-spotlight>Spotlight tour</button>`
              : ""
          }
          <button type="button" class="btn-secondary btn-compact" data-dismiss-onboarding>Got it</button>
        </div>
      </div>
    `;
    onboardingHost.querySelector("[data-start-spotlight]")?.addEventListener("click", () => {
      try {
        onSpotlightTour?.();
      } catch {
        /* ignore */
      }
    });
    onboardingHost.querySelector("[data-dismiss-onboarding]")?.addEventListener("click", () => {
      try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      onboardingHost.hidden = true;
    });
  }

  let textEl = null;
  if (copilotHost) {
    copilotHost.innerHTML = `
      <div class="context-copilot glass-panel" role="status" aria-live="polite" aria-atomic="true">
        <span class="context-copilot-mark" aria-hidden="true">◆</span>
        <p class="context-copilot-text"></p>
      </div>
    `;
    textEl = copilotHost.querySelector(".context-copilot-text");
  }

  tryMountOnboarding();

  function updateCopilot(getSnapshot) {
    if (!textEl || typeof getSnapshot !== "function") return;
    textEl.textContent = resolveCopilotHint(getSnapshot());
  }

  return { updateCopilot };
}
