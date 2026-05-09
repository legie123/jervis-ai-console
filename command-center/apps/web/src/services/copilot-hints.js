const IDLE_WORKSPACE_NUDGE = Object.freeze({
  "section-mission": "Mission — plan text & JSON below.",
  "section-ops": "Ops — drafts, inbox, gated send; Ruflo Agents feed is always polled for swarm telemetry.",
  "section-bridge": "Bridge — live posture & payloads.",
  "section-system": "System — scheduler & backups.",
  "section-graph": "Graph — search nodes & export map."
});

function idleShortcutTip(snapshot) {
  const base =
    "Tip: ⌘K palette · Voice orb · Unified inbox (Ruflo + Hermes + GoodMood feeds always wired) · ⌘. emergency · ? shortcuts · ⌘, settings.";
  const sid = snapshot.activeSectionId;
  const extra = sid && IDLE_WORKSPACE_NUDGE[sid] ? ` ${IDLE_WORKSPACE_NUDGE[sid]}` : "";
  return `${base}${extra}`;
}

/**
 * Pure hint resolver for the contextual copilot strip (no DOM).
 */
export function resolveCopilotHint(snapshot = {}) {
  const {
    effectiveFsm = "STANDBY",
    bootOffline = false,
    emergencyActive = false,
    missionPreview = "",
    planStatus = "",
    activeSectionId = ""
  } = snapshot;

  if (emergencyActive) {
    return "Emergency stop is active — use palette “Emergency · Clear stop” or POST /api/emergency/clear before sends or backups.";
  }

  if (bootOffline) {
    return "Supervisor boot offline (:7777 / :7778). Mission state still syncs from operator; use ↻ or Settings to adjust probe URLs.";
  }

  if (effectiveFsm === "WAITING_CONFIRMATION") {
    return "Awaiting confirmation — review approval queue, complete the risk gate (⌘Enter), or finish scoped sends with tokens.";
  }

  if (effectiveFsm === "THINKING" || effectiveFsm === "PLANNING") {
    return "Planning — submit mission text, then check JSON output and WhatsApp draft flow when tools require it.";
  }

  if (effectiveFsm === "BLOCKED" || effectiveFsm === "ERROR") {
    return "Blocked or error state — inspect audit feed, health (✓), and Captain’s Log; retry after fixing upstream.";
  }

  if (effectiveFsm === "DONE" && missionPreview) {
    const clip = missionPreview.length > 96 ? `${missionPreview.slice(0, 93)}…` : missionPreview;
    const ps = planStatus ? ` (${planStatus})` : "";
    return `Latest mission ready${ps}: ${clip}`;
  }

  if (effectiveFsm === "SPEAKING" || effectiveFsm === "LISTENING") {
    return "Voice channel active — use orb commands or dictate replies; Esc closes overlays.";
  }

  return idleShortcutTip({ ...snapshot, activeSectionId });
}
