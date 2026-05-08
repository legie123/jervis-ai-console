import { FSM_STATES } from "./constants.js";

export function mountFsmPill(container, getState) {
  container.innerHTML = `
    <div class="fsm-pill" role="status" aria-live="polite" aria-atomic="true">
      <span class="fsm-pill-ring" aria-hidden="true"></span>
      <span class="fsm-pill-label">FSM</span>
    </div>
  `;
  const root = container.querySelector(".fsm-pill");
  const labelEl = container.querySelector(".fsm-pill-label");

  function paint() {
    const raw = typeof getState === "function" ? getState() : "STANDBY";
    const st = FSM_STATES.includes(raw) ? raw : "STANDBY";
    labelEl.textContent = st.replace(/_/g, " ");
    root.dataset.state = st;
  }

  paint();
  return { update: paint };
}
