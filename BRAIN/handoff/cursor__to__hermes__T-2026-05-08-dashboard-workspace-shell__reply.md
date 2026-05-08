# Handoff — Cursor → Hermes (dashboard workspace shell)

**Task:** Radical reduction of “endless scroll” in Command Center main column; align with premium IA before Figma + interactive guide layers.

## DONE

- **Single-workspace shell:** Rail keys ⌘1–5 and nav clicks now **show one `view-section` at a time** (`hidden` toggled in `shell-navigation.js`). No more scrolling through Mission→Graph in one document.
- **Context header:** New glass `stage-header` with dynamic title/blurb from `SECTION_STAGE_META` (same file as nav IDs).
- **Scroll containment:** `.center-stage` uses `max-height` + internal scroll so the heavy column is bounded; inspector rail unchanged (sticky + own scroll).
- **Density:** Ops/System secondary `<details>` default **closed** (first panel still open where it mattered: Mission planner, Ops draft, Bridge, Scheduler, Graph).
- **A11y:** `aria-labelledby="stageTitle"` on `<main>`; `aria-current="page"` on active nav button.

## FILES

- `command-center/apps/web/src/index.html`
- `command-center/apps/web/src/services/shell-navigation.js`
- `command-center/apps/web/src/styles.css`

## BLOCKED

- **Figma:** Not executed this pass (needs connected Figma MCP + file target). Recommended next: `figma-generate-library` / screen frames from current shell **after** you freeze tokens in CSS (`:root`) or export a minimal token JSON for Hermes.

## NEXT (priority order)

1. **Figma:** One “Command Center — desktop” frame + component slots (rail / stage / inspector) so visual language matches code iterations.
2. **v2-interactive-guide:** Spotlights bound to `[data-target]` / section IDs **after** layout stable (driver.js or lightweight custom).
3. **Codex:** Local `npm --prefix command-center test` showed **5 failing HTTP subtests** (draft confirm/send/scheduler emergency/graphify) — appears unrelated to these UI files; worth a bisect on operator routes.

## RISKS

- Users who relied on **seeing multiple sections at once** must use rail or palette to switch (by design).
- Very tall Graph workspace scrolls inside center-stage only.

## CAVEMAN

Un singur ecran activ = mai puțin scroll prost. Figma după ce înghețăm layout-ul.
