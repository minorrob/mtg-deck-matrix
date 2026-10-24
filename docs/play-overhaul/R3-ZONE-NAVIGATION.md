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

## Second slice: whole-card rows (October 24)

Continued on the same branch and draft PR #854, after merging main `02a52c3b` (merge `7c259046`).

- Battlefield cards wrap into rows at the selected size, with creatures and planeswalkers first. Other permanents follow in the same scroll surface; lands have their own independent viewport. Whole card images use `object-fit: contain`.
- Where a whole row fits, the tops of the following row remain visible as a scroll cue. Tight screens retain scrolling and the shared inspector rather than silently hiding later cards. Phone zones have bounded heights.
- Individual tapped battlefield cards turn 30 degrees. Their grid cells reserve the rotated footprint, so the tilted card does not cover its neighbor. This is not mixed-stack rendering; cards remain individually represented.
- Wheel input prefers the vertical rows, with horizontal wheel/Shift-wheel and left/right keys available when oversized cards also overflow horizontally. The hand stays stationary.
- Legacy keyboard-focus styling no longer turns the battlefield's overflow visible and disables scrolling.

### Contract boundary

Main's `game/engine/projection.mjs` does not yet expose token identity, Basic supertype or attachment host IDs, nor enough attributes to guarantee exact equivalence. Comparing names and power/toughness would incorrectly combine modified tokens or lands with different behavior. Requests row 5 in `docs/ACTIVE.md` now specifies the missing grouping/attachment contract; row 11 already tracks control provenance. Vehicles are not inferred to be attachments merely because they are crewed. No engine runtime or rules code is changed by this slice.

### Local verification

`tests/board-r3-zone-navigation.mjs` passes 121 checks: 100 cards per player, four seats, all three desktop views plus 390px phone Focus, whole-card row geometry, row previews, 30-degree tapping, both card-size endpoints, room/view restoration, and no actions from navigation. Compatibility passes: `node tests/table-board.mjs` (290), `node tests/a11y-board.mjs` (298, all 30 mats in both themes), `node tests/board-fullscreen-notes.mjs` (48), `node tests/settings-r3.mjs` (68), and `node tests/board-r2-actions-inspection.mjs` (88). `table-tabletop`, `table-camera-layout`, `table-shared-shell`, and `board-control` also pass. Browser commands use `UAT_CHROME` and `GEOMETRY_REQUIRED=1`. `python game/tools/batch/breaks.py tools/breaks-play-r3-zones.py` catches all eight deliberate navigation/layout regressions; the same runner with `tools/breaks-play-r3-focus.py` passes its accessibility baseline and catches the removed tapped-card focus ring. All nine mutations are restored. Logs are in `work/r3-zone-proof`. Navigation/layout screenshots use placeholder art and are not real-art or subjective visual acceptance.

## Remaining R3 work

The current slice does not finish R3. Complete card/hand readability at all size extremes, exact token/basic-land stack eligibility and member selection, mixed tapped-stack rendering, attachment/control provenance, and full real-art and physical-device acceptance remain. R2's reversible payment draft still needs ROB-74, verified Backlog in Linear on October 23. The frozen plan and completion weights are unchanged.

No merge, full CI pass, Staging deployment, or whole-package acceptance is claimed by this draft slice.
