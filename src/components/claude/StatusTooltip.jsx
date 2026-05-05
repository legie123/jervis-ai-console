/**
 * StatusTooltip.jsx — Faza P1 micro tooltip for cropped status tiles
 * Author: Claude (sesiunea 2026-05-05)
 *
 * Optional drop-in replacement for the existing inline StatusTile in main.jsx.
 * Currently unused. Provided as a reference of the cleaner pattern with
 * full label visibility on hover/focus.
 *
 * Integration when P2 lands:
 *   import { StatusTile } from "./components/claude/StatusTooltip.jsx";
 *   // replace existing function StatusTile in main.jsx
 *
 * Until then, the CSS overrides in styles.claude-patch.css already give
 * visible labels and ellipsis-with-cursor:help on values.
 */

import React from "react";

export function StatusTile({ icon, label, value, tone = "quiet", title }) {
  const fullText = title || `${label}: ${value}`;
  return (
    <div className={`status-tile tone-${tone}`} title={fullText}>
      {icon}
      <span>{label}</span>
      <strong data-full={String(value || "")}>{value}</strong>
    </div>
  );
}

export default StatusTile;
