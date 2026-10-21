# ROB-18: the phone board, upright

October 21, 2026, by Claude, holding Codex · Play while Codex is away. Branch `claude/play-phone-upright`, stacked on
#812 (ROB-98).

Rob's call, Oct 18: "Go with the 48px land spacing and the upright Focused phone layout. Implement both and keep moving
through the Play work in order." The design is Codex's, from its Oct 18 prototype on `codex/play-phone-focus` (draft
#766, `ui-prototypes/phone-focus/`). This ports it into the board.

## What a player sees on a phone

The phone is any screen whose shorter side is 500px or less. Focus is its only view.

- **Upright (390 x 844), from the top:**
  - a 52px rail: ✋ with the hand's count, History, the Coach, and the profile menu (Settings, Pages, Help);
  - Camera at the rail's right;
  - every seat in a row, with life and a flag;
  - the pill: turn, step, and Pass, Next step or Draw card (Yield turn on another player's turn);
  - the combat picture, during combat;
  - the battlefield;
  - what is asked.
- **The battlefield runs the full width:** creatures, then other permanents, then lands, then the four piles. It
  scrolls in its own frame; the pill and what is asked stay where they are.
- **Sideways (844 x 390):** the same, with the seats as a 110px column at the right.
- **Nothing is turned any more.** The old board drew upright phones sideways, a quarter turn.
- **✋ opens the hand as a drawer from the bottom.** The pill stays visible above it. Swipe to browse; tap a card to hold
  it up with what it can do.
- **Camera on a phone:**
  - no view switch and no Tilt;
  - ◀ ▶ go round the seats, which replaced the strip's ‹ › (a seat is also tapped);
  - the two card-size sliders.
- **Blocking upright:** the ask takes half the height while you block. The blocker tiles share the width and wrap,
  so each blocker, its attackers and Clear are in reach without scrolling. Sideways, it's a third, as before.

## What changed from the prototype

- **Kept from production,** which the prototype predates:
  - the combat picture (ROB-26), now in the column rather than over the mat;
  - Yield turn in the pill (ROB-28).
- **The hand hint** reads "tap a card to hold it up", because that is what a tap does today. Tap to inspect without
  holding is ROB-18's open item below.
- **Landscape is chosen by the board's own `data-phone="landscape"`,** not a media query. What is asked is capped at
  a third of the height there, as before.
- **Left out:**
  - the preview tool's own control-bar rule;
  - the prototype's screenshots, which were of the Oct 18 board.

## Proof

- **`table-board` walks Maya's phone, sideways then upright:**
  - the 52px rail along the top, the seats a 110px column, the board the whole screen, nothing scrolling sideways;
  - Camera without a view switch or Tilt, its ▶ going round the seats;
  - the battlefield scrolls in its frame down to her library, the pill staying put (hit-tested);
  - what she is asked stays under a third of the height and scrolls within;
  - ✋ opens a drawer from the bottom, below the pill, its cards 110px;
  - upright, the board isn't turned, fills the screen, and has the seats in a row beneath the rail;
  - back at a desk, the desk board.
- **`board-direct-blocking`:** real pointer reach in all six layouts, the upright phone among them.
- **Also passing:** `board-combat-display`, `board-yield`, `board-commander-hand`, `board-ending-rematch`,
  `table-camera-layout`, `table-shared-shell`, `table-tabletop`, `table-lobby`, `a11y-board` (298) and `mobile-r3`.
- **`game/tools/batch/breaks-phone-upright.py`** has five breaks:
  - the quarter turn restored;
  - the battlefield not scrolling;
  - the hand covering the turn;
  - the seats not a column sideways;
  - Camera offering a view switch.
- **`breaks-combat-display.py`:** two of its phone breaks are re-anchored to the new structure, and both are caught.
  Its desktop "combat has no reserved header space" break goes uncaught on main too (fe9795b5), so it predates this
  change.

## Still open on ROB-18

- Tap a battlefield card to inspect it without acting.
- One utility open at a time.
- The keyboard never covering a confirmation.
- A real phone and its touch, which desktop emulation can't prove.
