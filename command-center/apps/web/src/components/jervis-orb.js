import { FSM_STATES } from "./constants.js";

function fsmColor(state) {
  const s = String(state || "STANDBY").toUpperCase();
  if (s === "BLOCKED" || s === "ERROR") return "var(--accent-red)";
  if (s === "SPEAKING") return "var(--accent-green)";
  if (s === "THINKING" || s === "PLANNING") return "var(--accent-violet)";
  if (s === "WAITING_CONFIRMATION") return "var(--accent-amber)";
  return "var(--accent-cyan)";
}

export function mountJervisOrb(container, getState) {
  container.innerHTML = `
    <div class="jervis-orb" role="img" aria-label="JERVIS presence">
      <svg viewBox="0 0 72 72" width="56" height="56" aria-hidden="true">
        <defs>
          <radialGradient id="jOrbGrad" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stop-color="rgba(255,255,255,0.95)" />
            <stop offset="55%" stop-color="currentColor" />
            <stop offset="100%" stop-color="rgba(0,0,0,0.35)" />
          </radialGradient>
          <filter id="jOrbGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle class="jervis-orb-halo" cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35" />
        <circle class="jervis-orb-core" cx="36" cy="36" r="22" fill="url(#jOrbGrad)" filter="url(#jOrbGlow)" />
      </svg>
    </div>
  `;
  const root = container.querySelector(".jervis-orb");
  const core = container.querySelector(".jervis-orb-core");

  function paint() {
    const st = typeof getState === "function" ? getState() : "STANDBY";
    const safe = FSM_STATES.includes(st) ? st : "STANDBY";
    const col = fsmColor(safe);
    root.style.color = col;
    core.style.color = col;
    root.dataset.fsm = safe;
  }

  paint();
  return { update: paint };
}
