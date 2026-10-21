# ROB-98: Full-view land reachability

October 18, 2026. Proposal tested against PR #754, head `b538be8e`, before production changes.

## Rob's call

ROB-98 says "Rob picks from screenshots." Recommend **48px of additional bottom padding inside the front mat**.
This is the smallest tested candidate; 72px and 96px also clear the sampled targets but move more of the mat.
The camera remains at 40 degrees, Zoom 100%, Cards 100%; the hand's placement and size are unchanged.
The comparison was presented in the Codex chat and recorded on ROB-98. Rob approved it on October 18: "Go with the 48px
land spacing and the upright Focused phone layout. Implement both and keep moving through the Play work in order."

| Viewport | Before | Proposed spacing |
| --- | --- | --- |
| 1280 x 720 | [T08/T11 before](screenshots/rob-98-1280x720-before.png) | [T08/T11 after](screenshots/rob-98-1280x720-spacing-48.png) |
| 1024 x 768 | [Before](screenshots/rob-98-1024x768-before.png) | [After](screenshots/rob-98-1024x768-spacing-48.png) |
| 1400 x 900 | [Before](screenshots/rob-98-1400x900-before.png) | [After](screenshots/rob-98-1400x900-spacing-48.png) |

T08 identifies the lands row; T11 identifies the hand fan. These are recorded-room previews with a synthetic nine-card
hand, not a live match. The existing [390 x 844 phone baseline](screenshots/rob-99-phone-baseline.png) belongs to slice 1;
this proposal applies only inside the desktop Full-view mat. Phone interaction remains ROB-18.

## Reproduction and limits

Run `node ui-prototypes/rob98-land-spacing.mjs` from the repository root with `GEOMETRY_REQUIRED=1` and `UAT_CHROME`
pointing to Chromium. It starts the existing isolated tabletop preview, adds candidate CSS only in the browser, and
writes comparison images plus measured rectangles and hit-test results under ignored `work/rob98/`.

For every front-row land, the check samples its upper center at 10%, 25% and 45% of the bounding-box height, at rest
and during each of the seven visible hand-card hovers. Pointer movement uses an already visible hit target, avoiding
Playwright's automatic scroll of clipped hand cards. Nine cards are in the hand; two are offscreen in the carousel.

On the shared-shell baseline, 1400 x 900 and 1024 x 768 already pass these samples. At 1280 x 720, two hand-card hovers
cover a sampled land target. All three sizes pass with 48px. The harness asserts both the passing candidate and the
failing baseline, so removing the spacing cannot masquerade as proof of a fix.

No production CSS has changed. Before shipping: Rob's choice, a production browser assertion, a deliberate regression
in a breaks file, the affected board/accessibility suites, current main merged, pins, review, CI, then an engine-owned
staging release. Physical phones, hardware WebGL and legal mana activation on a live table are unproven.

## Shipped: October 21, on `claude/play-land-spacing`

Claude, holding Codex · Play while Codex is away, built this from Codex's work. That work is Codex's own Oct 18
implementation, parked in the stash "Preserve Oct18 approved ROB-98 and drawer fixes before Oct20 playtest work", which
is read, not applied or dropped.

- **The lands.** `.cm-stage-front>.cm-mat{padding-bottom:48px}` (crankmagic-stage.css). The harness above, run again
  on the Oct 21 board, still finds two blocked land points at 1280 x 720 without it and none with it.
- **The proof.** `tests/table-tabletop.mjs` hit-tests the shipped CSS with no style injected. It checks every front-mat
  land at 10%, 25% and 45% down its middle:
  - at rest;
  - with each of the fan's seven visible cards hovered;
  - at 1400 x 900, 1024 x 768 and 1280 x 720.

  A hand card is hovered at a point that hit-tests to it, never by Playwright's scroll into the clipped fan.
  `game/tools/batch/breaks-land-spacing.py` removes the 48px: caught at 1280 x 720 with Soul of New Phyrexia hovered.
- **The drawer's edge** (Rob's other Oct 18 report, Codex's fix). The right drawer's gray resize line sat 17px inside its
  edge, over its modules: 957 against 940 at 1280 wide on the Oct 21 board. It now sits on the edge, and keyboard
  resizing is kept. `tests/table-shared-shell.mjs` measures the line's drawn position against the drawer's edge in
  Table and Focus. `game/tools/batch/breaks-drawer-edge.py` shifts it inward: caught.
- **Not carried over from the stash:**
  - its separate `table-land-reachability` suite (the same check lives in table-tabletop, which CI runs);
  - its screenshots, which were of the Oct 18 board.
