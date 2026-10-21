# ROB-165: keep a long choice at the player's scroll position

Branch: `codex/play-choice-scroll`, PR #798, from main `d7eadfe1`.

Preserve the options list's scroll position when the board redraws the same
decision in the same match. A new decision starts at the top. Keep the heading,
selection count and Confirm reachable, as established by ROB-163.

`render()` captures the existing decision's list position before repainting and
restores it only when both the decision ID and match ID still agree. Selection,
deselection and room refreshes of that question keep the player's place. It stores
no scroll position outside the current DOM, so leaving a question discards it.

`tests/table-tabletop.mjs` wheels the 60- and 150-option choices to their ends at
1024x768, 1280x720 and 1400x900. Real mouse clicks select, deselect and select the
last option again. After each redraw, the scroll value must be unchanged and all
five hit-test points must still reach that option. Confirm must send its exact
option index. Fresh socket views independently change the decision and match IDs;
each must reset the same-sized list to its top.

Screenshots use stable label C01:

- [1280x720, bottom option selected](screenshots/rob-165-choice-1280x720.png)
- [390x844, existing phone baseline](screenshots/rob-165-choice-390x844.png)

The phone screenshot records the current rotated layout; ROB-18's approved upright
view remains separate. Physical-phone interaction and hardware WebGL are unproven.
These choices are synthetic fixtures built from Shared D5's card names.

Read-only review found only the asset-pin update, now addressed. Pins build on
PR #797: board 56, service worker 497, app 514; stage CSS remains 22. The manifest
was regenerated once after the final cascade.

Local proof, with `GEOMETRY_REQUIRED=1` and installed Chrome:

- `node tests/table-tabletop.mjs`: geometry, profile and browser checks pass.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-choice-scroll.py`:
  all three regressions caught, `missed: []` (lose the kept scroll; carry it into
  a new decision; carry it into a new match).
- `node tests/table-board.mjs`: 278 checks before integrating #797's three
  additional Yield checks.
- `node tests/a11y-board.mjs`: 298 checks; `node tests/settings-r3.mjs`: 68.
- Feature wiring: 124; data integrity passes; the breaks-anchor scan passes.

PR #797 was integrated without conflicts. The final tabletop and focused Yield
suites pass with both changes together. One tabletop run stopped at an open
"Review action" dialog after the earlier camera-preference reload, before the
long-choice checks; the unchanged repeat passed. No assertion was weakened.
This intermittent setup failure remains recorded for follow-up if it recurs.

Full CI runs on GitHub. PR #798 carries #797's commits; landing this combined
head can preserve both changes in one merge without rebuilding an already
tested tree. Staging is released and verified by Engine after the merge request
in ROB-11.
