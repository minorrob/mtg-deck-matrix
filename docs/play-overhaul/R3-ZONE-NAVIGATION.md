# R3: crowded boards and card handling

Rob authorized beginning the next roadmap feature set on October 23, 2026. Branch: `codex/play-r3-zone-navigation`, from main `8ea72639`.

## First slice: navigate overflowing zones

- Wheel input navigates the actual overflowing card viewport in Table, Focus, 3D and the phone layout. Ctrl/Command wheel remains available to the browser.
- Overflowing zones are named keyboard regions: arrows, Page Up/Down, Home and End navigate without selecting a card.
- Mouse/pen dragging on blank zone space scrolls; card dragging retains its existing arrangement behavior. Touch retains native scrolling; physical-device validation remains unproven.
- Scroll positions are preserved per view and player zone through redraws and view switches, scoped to the current game and viewing seat. New games clear them.
- Scrollbars are hidden; keyboard focus remains visible. Game actions, legality and engine state are unchanged.

## Evidence

`tests/board-r3-zone-navigation.mjs`: 55 browser checks at 1280x720 in Table, Focus and 3D, and 390x844 in phone Focus. Recorded projections contain 100 cards per seat (400 across the table); checks use real wheel, keyboard and pointer input. The suite failed before implementation. `tools/breaks-play-r3-zones.py` deliberately breaks wheel input, redraw restoration and blank-space dragging. Screenshots in `work/r3-zone-proof` use placeholder card art and prove navigation/layout only, not final visual quality. Compatibility checks passed: real two-browser gameplay 290, accessibility 298, Settings 68, existing 3D/gesture checks 48, and R2 Actions/inspection 88. All three deliberate regressions were caught and restored. Feature wiring 124, readout 1,119, data integrity, break anchors and all 125 asset hashes/pins pass. The final commit and draft PR carry the handoff.

## Remaining R3 work

This first slice does not finish the crowded-board layout. Multi-row composition and next-row peeks, uncropped card/hand readability at all size extremes, exact token/basic-land stack eligibility and member selection, 30-degree mixed tapping, attachment/control provenance, and full real-art and physical-device acceptance remain. R2's reversible payment draft still needs ROB-74, verified Backlog in Linear on October 23. The frozen plan and completion weights are unchanged.

No merge, full CI pass, Staging deployment, or whole-package acceptance is claimed by this draft slice.
