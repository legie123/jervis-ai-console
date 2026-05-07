import { RISK_LEVELS } from "./constants.js";

export function mountRiskIndicator(container, getTierIndex) {
  container.innerHTML = `
    <div class="risk-indicator" role="group" aria-label="Risk tier">
      ${RISK_LEVELS.map(
        (tier, i) =>
          `<span class="risk-led" data-tier="${tier}" data-i="${i}" title="${tier}" aria-label="${tier}"></span>`
      ).join("")}
    </div>
  `;
  const leds = [...container.querySelectorAll(".risk-led")];

  function paint() {
    const idx = typeof getTierIndex === "function" ? getTierIndex() : 0;
    const clamped = Math.max(0, Math.min(3, idx));
    leds.forEach((el, i) => {
      el.classList.toggle("is-active", i === clamped);
    });
  }

  paint();
  return { update: paint };
}
