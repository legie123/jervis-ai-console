/**
 * PresenceOrb.jsx — Faza P1 minimal presence beside topbar (additive)
 * Author: Claude (sesiunea 2026-05-05)
 *
 * Optional micro-component. Currently unused. Designed to be mounted in
 * the topbar next to the JERVIS title to give a constant visual heartbeat
 * even when the dragon-core is not in the viewport (ops/transcript scroll).
 *
 * Color tied to visualState prop:
 *   standby   → bronze
 *   listening → gold pulse
 *   thinking  → amber slow
 *   speaking  → gold fast
 *   blocked   → risk red
 *   done      → cyan calm
 */

import React from "react";

const STATE_COLORS = {
  standby:   { hue: "var(--bronze, #B07B3B)",  speed: 4 },
  listening: { hue: "var(--gold, #f6be6c)",    speed: 1.4 },
  thinking:  { hue: "var(--amber, #ff8f3f)",   speed: 2.6 },
  speaking:  { hue: "var(--gold, #f6be6c)",    speed: 1.0 },
  blocked:   { hue: "var(--red, #d33128)",     speed: 1.8 },
  done:      { hue: "var(--cyan, #5be7ff)",    speed: 3.2 },
  executing: { hue: "var(--amber, #ff8f3f)",   speed: 1.2 }
};

export function PresenceOrb({ state = "standby", size = 22, label }) {
  const palette = STATE_COLORS[state] || STATE_COLORS.standby;
  return (
    <div
      className={`c-presence-orb-mini state-${state}`}
      role="img"
      aria-label={label || `presence ${state}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 28%, ${palette.hue}, color-mix(in srgb, ${palette.hue} 45%, #2A1F12) 80%, #06030A)`,
        boxShadow: `0 0 0 1px ${palette.hue}, 0 0 12px color-mix(in srgb, ${palette.hue} 35%, transparent)`,
        animation: `c-orb-mini-breathe ${palette.speed}s ease-in-out infinite`,
        flexShrink: 0
      }}
    />
  );
}

export default PresenceOrb;
