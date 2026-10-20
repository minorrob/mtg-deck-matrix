# ROB-163: a long choice in Full screen can be finished

October 19, 2026. A Claude session on Personal-HP, branch `claude/hungry-khayyam-2e5ecc`, from main c42416e5. This is a
Codex · Play file changed at Rob's go, as ROB-156, ROB-161 and ROB-162 were; the change is the decision panel's
styling only (`crankmagic-stage.css`).

## What was wrong

In Full screen a choice with many options ran below the window, and Confirm went with it. Nothing scrolled it back:
the table's region clips (`.cm-stage-region{overflow:hidden}`), and the floated box (`.cm-stage-region .cm-board-ask`)
was pinned top and bottom with no limit on what it held. The cards in Rob's six decks that open such a choice: Gamble
(D1), Gifts Ungiven and Fauna Shaman (D2), Diabolic Tutor (D5), Curse-Marred Demon and Goblin Recruiter (D6).

Pinning the box to the foot of the table had a second effect: under a short choice, the empty part of the box covered
the table to its foot and took the clicks meant for the cards there (80px of the table at 1280 x 720, 298px at 1400 x 900).

## The fix

- The box is no taller than the table (`max-height` in place of `bottom`), and only as tall as what it holds.
- The decision is a column that may shrink; its options scroll between the title and the foot (Confirm, Reset, the
  count), which stay on screen.
- 3px of padding inside the scroll keeps a chosen option's outline whole at the list's edges. A matching -3px margin
  keeps the options under the title, where they are in every other view.

Table, Focus, the phone board and the Actions module (`crankmagic-stage.css`, `.cm-stage-module[data-module="actions"]`)
are untouched: every rule is under `.cm-stage-region .cm-board-ask>#cm-board-decision`. Measured before and after in
Table and Focus at all three sizes, with 60 options: the same geometry to the pixel.

## Measured

Frame 15 of the recorded preview ("Search your library", a `many` choice), its options D5's own card names
(`PREVIEW_FRAME=15 PREVIEW_OPTIONS=<n> node tools/play-tabletop-preview.mjs`). The Confirm row's top and bottom, in pixels:

| Options | Window | Before (main c42416e5) | After |
| --- | --- | --- | --- |
| 60 | 1024 x 768 | 735-777, cut by the window | 711-753 |
| 60 | 1280 x 720 | 583-625 | 583-625 |
| 60 | 1400 x 900 | 545-587 | 545-587 |
| 85 (the frame's whole library) | 1024 x 768 | 925-967, off screen | 711-753, list scrolls |
| 85 | 1280 x 720 | 735-777, off screen | 663-705, list scrolls |
| 85 | 1400 x 900 | 697-739 | 697-739 |
| 150 (stress) | all three | off screen | in reach, list scrolls |

With real card names, 60 options overflow only at 1024 x 768. The evaluation that filed ROB-163 found 60 unreachable
at all three sizes; its inflated options were not these names, and wider labels wrap into more rows. So the suite
renders 60 (the case filed) and a stress list of 150, which is longer than the table at every size, so the scroll is
exercised everywhere.

Screenshots, 1280 x 720, 85 options: `screenshots/long-decision-1280x720-before.png` (Confirm below the window, nothing
scrolls) and `screenshots/long-decision-1280x720-after.png` (the list scrolled to its end with the wheel; the title, the
count and Confirm on screen). Headless Chromium hides scrollbars; Chrome on Windows draws one in the list.

## Proof

- `GEOMETRY_REQUIRED=1 node tests/table-tabletop.mjs`. For 60 and for 150 options at 1024 x 768, 1280 x 720 and
  1400 x 900, it checks:
  - the title, the count and Confirm are hit by `elementFromPoint` (at the center and four inner points);
  - the wheel scrolls the list to its end, then the last option is hit and the title, count and Confirm still are;
  - a mouse click at the last option's point chooses it ("1 chosen");
  - a mouse click at Confirm's point sends the room `{choiceId: "chooseCard:0:29:21", indices: [n - 1]}`;
  - the first option's outline is clear of the list's edges, and the options start under the title;
  - under the short choice, the table just below the panel takes the pointer.

  Before each hit test, the scroll of every box that clips without scrolling is reset to 0. A person cannot scroll
  those boxes, though Playwright's own click would.
- `GEOMETRY_REQUIRED=1 python3 -u game/tools/batch/breaks.py game/tools/batch/breaks-play-long-decision.py`: 8 of 8
  caught, `missed: []` (the baseline passed unbroken first). The breaks are the fix removed whole, the box pinned to the
  table's foot again, the box with no limit, the decision that can't shrink, the decision not a column, the options
  that don't scroll, the outline's padding gone and the margin gone. Four were re-applied by hand to read the assertion
  each fails:
  - the box pinned to the table's foot fails "the table just below the decision takes the pointer" at 1280 x 720;
  - the options that don't scroll fail "Confirm is on screen" at 1024 x 768;
  - the padding gone fails "a chosen option's outline is whole" (0, 0);
  - the margin gone fails "the options start under the title" (3).

## Not done

- **The list scrolls back to its top after each pick.** Choosing an option redraws the board, and the redraw doesn't
  keep the list's scroll. Confirm stays in reach, so a choice can always be finished, but a choice of several cards
  from a long list (Gifts Ungiven's four) means scrolling down again for each one. Keeping the scroll is a change to
  `crankmagic-board.js`'s render, outside this styling-only fix. The On the Stack list already does it
  (`crankmagic-board.js`, the stack browser keeps `.cm-stack-list`'s `scrollTop`).
- A physical Windows Chrome window and a touch screen were not used. Every check here runs headless Chromium in this
  machine's real window sizes.
