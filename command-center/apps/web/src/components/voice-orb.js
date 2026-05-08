export function mountVoiceOrb(container, { onToggle }) {
  container.innerHTML = `
    <button type="button" class="voice-orb-btn" aria-pressed="false" aria-label="Voice push to talk (demo)" title="Voice">
      <span class="voice-orb-glyph" aria-hidden="true">⌁</span>
      <span class="voice-orb-badge" id="voiceOrbBadge" hidden>Listening</span>
    </button>
  `;
  const btn = container.querySelector(".voice-orb-btn");
  const badge = container.querySelector(".voice-orb-badge");

  btn.addEventListener("click", () => {
    const next = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", String(next));
    badge.hidden = !next;
    if (typeof onToggle === "function") onToggle(next);
  });

  return {
    setListening(on) {
      btn.setAttribute("aria-pressed", String(on));
      badge.hidden = !on;
    }
  };
}
