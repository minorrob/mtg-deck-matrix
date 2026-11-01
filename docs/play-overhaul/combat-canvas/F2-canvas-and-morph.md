# F2 · The combat canvas, read-only: layout, morph, public picture, summary card

**Linear:** ROB-365 · **Wave 2** (alone in the board and stage files) · **Lane:** `crankmagic-combat.js` (new), the
`combat` layout mode in `crankmagic-stage.js`, the combat-mode seam in `crankmagic-board.js`, `crankmagic-stage.css`,
`crankmagic-mats.css`, `tests/board-combat-display.mjs` (rewritten), `tests/board-combat-morph.mjs` (new, the eye test),
the combat cases of `tests/board-flat-views.mjs`, `game/tools/batch/breaks-combat-canvas.py` · **Waits on:** F1 ·
**Runs beside:** ROB-360, F9, the F6 shader prototype under `ui-prototypes/holo/`.

Rob, 2026-11-01: *"The test here is that if you keep your eye on a single card on the mat and then transition into the
combat view, you can keep your eye on that card as it moves into the combat screen. It doesn't jump anywhere on you."*
*"The mats won't be present for combat ... a shadow of them, or 50% transparency."* *"I like the idea of the arrows."*

## Goal

From the `attack` event to end of combat, every seat's screen morphs into the canvas and shows the **public** picture:
shadowed mats, the muster, the fronts with their walls, the approaches, the arrows, the blocks as they are confirmed,
the damage on the timeline (F1), the summary card, and the morph back. Nothing is interactive yet beyond inspection
(a press on any card still opens it to read). The header strip retires. This feature **defines the seams** F3, F4 and
F5 build on, so its API matters as much as its look.

## Hard rules

I2, I3 (the eye test is this feature's acceptance), I4 (only `state.combat`; never a draft), I7, I8, I9, I10, I12,
README constants (`MORPH_MS`, `SHADOW_OPACITY`, `ARROW`, `BUNDLE_WALL`, `EYE_TEST`, `BENCH`).

## The specification

### The layout, in table-plane coordinates (`CrankStage.layout(rect, {...opts, combat})`)

`combat = {attacker: <seat index>, defenders: [<seat index>…], seats: n, you: <seat index>}`. The mode returns the
existing fields plus:

```
{combat: true,
 ground: {x, y, width, height},                    // the open middle where arrows run
 muster: surface,                                   // the attacker's creatures, one row (folds past BUNDLE_WALL)
 fronts: [{seat, badge: rect, pw: rect[], battles: rect[], wall: surface, approach: surface}],  // seat order, left to right
 shadows: [{seat, surface}]}                        // where each mat lies, for the fade
```

Proportions of the plane's height, top to bottom: fronts band 0 to 34% (badge 10%, planeswalkers and battles beside
it, wall below), approaches 34 to 46%, ground 46 to 70%, muster 70 to 100%. Width: the fronts share the width in seat
order with `GRID_GAP` between; two seats make one full-width front; the muster is full width. Card size in the fronts
is 0.8 × the stage's card size, in the muster 1.0 ×, in the approaches 0.9 ×; a row that would overflow folds
same-named cards into a stack with `×n` (the hand's folding) before it shrinks, and shrinks before it overflows (I8).
The **viewer's own seat** is always the bottom: when the viewer is a defender or a bystander, the attacker's muster
and approaches are drawn at the top band in the attacker's color, the viewer's own front (badge, wall) at the bottom,
and the other fronts across the top beside the muster; the layout function takes `you` and places accordingly. 3D
projects the same rectangles through `geometry`; Table and Focus through `flatGeometry`.

### The canvas layer (`crankmagic-combat.js`, `CrankCombat`)

- `CrankCombat.enter(view, reason)` and `CrankCombat.leave(view)`: `enter` on the first `attack` event of a combat
  (and, from F3, on the attacker's Yes; from F4, on the defender's Enter); `leave` after `step COMBAT_END`'s timeline
  items and the summary card.
- A persistent `#cm-combat` layer inside the stage region, a sibling of the mats, with three sublayers: cards (the
  fighting `.cm-bcard` elements, **re-parented** here with a FLIP, keyed by `cardId`), the SVG arrows layer, and the
  HUD layer (badges, tally slots, the dock frame, the summary card). The board's `draw()` **never rebuilds
  `#cm-combat`**; in combat mode `draw()` calls `CrankCombat.update(view)` which reconciles by `cardId` (add, move,
  remove with motion; never `innerHTML` of a container that holds a fighting card).
- The morph: measure every fighting card's box; switch the stage to the combat layout; re-parent and position; measure
  again; animate each from its old box to its new one with the Web Animations API on **the element itself**
  (`transform` from the inverse delta to none, `MORPH_MS`, `EASE`, stagger `MORPH_STAGGER_MS` in the order muster,
  fronts, approaches); the mats fade to `SHADOW_OPACITY` over `MORPH_MS`; the camera (3D, F6) eases over the same
  duration. Reverse at `leave`. While a morph runs, `CrankTimeline.holding()` is true (register the morph as a timeline
  item) so views are held, and input cuts it.
- Arrows: one `<svg>` sized to the stage, redrawn on each layout change, camera frame (3D: subscribe to the stage's
  frame hook) and `fit()`; each arrow a cubic path from the attacker's box bottom-center to the target's box
  top-center (badge, planeswalker, battle) or from a blocker to its attacker; `data-combat-attacker`,
  `data-combat-defender`, `data-combat-target`, `data-combat-blocker` on the path elements (the journey compares these
  IDs); `aria-label` "<attacker> ⤳ <target>" with `combatWords` names; bundled past 6 per front into one path with a
  `×n` label and a `title` listing them.
- Blocks arriving: on a `block` event, the blocker moves from the wall to the approach row under its attacker
  (`CrankCombat.moveTo`), the arrow bends to it.
- A gone object (a `cardId` no longer in any public zone): its arrow ends at its owner's graveyard pile with ⌫; its
  card element plays the existing graveyard flight and leaves the layer.
- The summary card: after `COMBAT_END`, for the attacker and each defender who was attacked, a card in the HUD layer
  with glyphs and numbers (⚔ dealt, ⛨ taken, ☠ lost, life now), computed from the combat's events; Close, or fade after
  `2000 × overlay/60` ms; bystanders get callouts only. It may use `document.startViewTransition` behind feature
  detection (RESEARCH.md §5); the fallback is a fade.
- The header strip (`combatStrip()`, `[data-combat]` reservation in `crankmagic-stage.css`) retires; its 188 px return to
  the boards; `data-combat-*` live on the arrows and rows now. The blocker desk and the attack pop-up stay until F3 and F4.

### Seams exported for F3, F4, F5 (README, "The seams F2 must define")

`register`, `anchors`, `arrow`, `removeArrow`, `dock`, `ring`, `unring`, `lift`, `moveTo`. Document each in a header
comment with its contract; a later feature that needs more files a seam PR.

## Build steps

1. `design-reference-and-critique` for the layout (Mobbin references cited in `docs/design/references/`, never copied);
   a wireframe of the 2D canvas for Rob's look before code is complete (the 30-minute visual checkpoint of
   `AGENTS.md`).
2. The eye-test suite first (`tests/board-combat-morph.mjs`): with 12 and with 40 creatures, enter and leave combat;
   sample every fighting card's `getBoundingClientRect()` and computed opacity each frame via `requestAnimationFrame`;
   compute each card's eased path from its first and last boxes; fail on any frame absent, opacity ≤ .05 while it
   should show, or center more than 8 px off the path; also fail if any `.cm-bcard[data-card]` element identity changes
   during the morph (keep references). Watch it fail (it will: `draw()` rebuilds).
3. The stage's `combat` layout mode (pure geometry; unit-test it in Node like `flatGeometry` if a suite exists, else
   in the browser suite at three sizes).
4. `crankmagic-combat.js`: layer, keyed reconcile, morph, arrows, blocks arriving, gone objects, summary card, seams.
5. The board seam: enter on the `attack` event (through F1's hook), `draw()` → `CrankCombat.update`, leave after end.
6. Retire the strip; rewrite `tests/board-combat-display.mjs` for the canvas (grouping by front, twins, face-down,
   gone, cleanup, scroll retention is moot); add combat cases to `tests/board-flat-views.mjs` at its three sizes.
7. The 40-creature benchmark (a suite that measures frame times during the morph with `performance.now()` deltas,
   95th percentile ≤ 16.7 ms on the CI runner's headless Chromium is not meaningful; record the numbers, assert only
   no frame over 100 ms, and leave the 60 fps claim to a local session).
8. `breaks-combat-canvas.py`: a draft drawn without `state.combat`; a stale name on a gone object; the strip's
   reservation left behind; `innerHTML` of the cards sublayer during combat; an arrow without its `data-combat-*`.
9. Both pages, the service worker, pins by tool. `visual-acceptance` in Table, Focus and 3D at 1280×720 and 1400×900
   as attacker, defender and bystander; `write-ui-copy` for the summary card.

## Proof

`GEOMETRY_REQUIRED=1 node tests/board-combat-morph.mjs`; `node tests/board-combat-display.mjs`;
`node tests/board-flat-views.mjs`; `node tests/a11y-board.mjs`; `node tests/uat/solo-vs-ai.mjs`; the breaks runner.

## Done when

- [ ] The eye test passes at 12 and 40 creatures, in and out, in Table, Focus and 3D (3D by a local session).
- [ ] The strip is gone and its height returned; the journey compares the same IDs on the new elements.
- [ ] The seams are documented and used by nothing yet.
- [ ] `R4-B-COMBAT.md` and `ROB-26-COMBAT-DISPLAY.md` carry the superseding note.

## Risks and what to watch

- **`draw()` rebuilds the mats with `innerHTML`.** That is what the eye test will catch first. The fix is the keyed
  reconcile of fighting cards inside `#cm-combat` and leaving the mats' non-combat cards to the old draw; do not try to
  make a rebuild look continuous with ghosts (a ghost is a different element; the test holds references).
- **Re-parenting under `matrix3d`.** A card moved from a mat surface to the canvas layer changes its transform
  parent; measure in screen space before and after and animate the screen delta; in 3D the layer is itself a projected
  surface, so the card's final transform is the layer's.
- **The arrows lag the camera.** Redraw on the stage's frame hook, not on a timer; measure once per frame.
- **The viewer's seat at the bottom** changes the layout per viewer: three layouts for one combat. Test all three roles.
- **Focus view's miniature boards** are not the canvas: in combat mode, the canvas replaces the whole stage region, not
  one board.

## Choices you will face

- *Keep cards inside their mats and only draw arrows?* No: Rob chose the whole canvas; the mats are shadows.
- *Position by CSS transforms without re-parenting?* Only if the eye test passes in all three views; re-parenting is the
  recommended path because the layer is one projected surface in 3D.
- *The viewer is a bystander with the morph switched off (F4 adds the switch)?* Still draw the arrows over the shadowed
  mats; `enter` with `reason: "overlay"` skips the layout change.
- *A card enters the fight mid-combat (a flashed-in blocker)?* It morphs from its mat position along an eased path; it
  never appears in place.
- *Sizes won't fit at 1024×600?* Fold stacks, then shrink cards to the legibility floor (name 10 px), never overflow.
