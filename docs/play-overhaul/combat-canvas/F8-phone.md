# F8 · The combat canvas on the phone

**Linear:** ROB-371 · **Wave 4** · **Lane:** the phone blocks of `crankmagic-combat*.js` and their CSS, the phone cases
of the board suites · **Waits on:** F3, F4 · **Runs beside:** F5, F7. A physical phone is a local session's acceptance.

Rob, 2026-11-01: *"desktop first, phone later."*

## Goal

The same model in the phone's column (Focus only, upright, ROB-18): the seat row's badges are the drop targets,
planeswalkers and battles as chips under them; the muster is the creatures row; the incoming line sits above the
battlefield; arrows run in the column; the gates sit in the pill; the dock sits where the ask sits today. Holograms and
particles are off (Effects 0).

## Hard rules

I3 (the eye test holds in the column), I8 (the battlefield scrolls in its own frame; the pill and the dock stay in
reach), I9, ROB-18's layout and ROB-328's held-lift touch drag.

## The specification

- Upright (390 × 844): rail · camera · seats row (badges as targets, ringed) · pill (the gate's two buttons live here
  while a gate is open) · incoming line (defender) or approaches (attacker) · battlefield (the muster is its first
  row) · the dock where the ask is today. The arrows layer spans the column; bundling at 4 per badge.
- Sideways (844 × 390): the seats as the right column; targets are those badges.
- The morph in the column: cards move within the column's rows; the mats' shadow is the battlefield frame's dimming.
- Touch: the held-lift drag (320 ms) as the hand's; tap path identical to desktop.

## Build steps

1. The phone cases of `tests/board-r4-combat.mjs` and `tests/board-direct-blocking.mjs` at 390×844 and 844×390 (reach of
   the pill and dock with `elementFromPoint`, the battlefield still scrolls, the gate in the pill, held-lift drag). Watch
   them fail.
2. The phone blocks in the two modules and CSS; `board-flat-views` phone sizes.
3. `breaks-combat-phone.py`: the dock covering the battlefield's creatures; the gate outside the pill; Effects on by
   default on a phone.
4. `visual-acceptance` in the container at both sizes; a physical phone walk by a local session.

## Done when

- [ ] Both sizes pass; the eye test passes in the column; a local session has walked a real phone (or the PR says
      "unproven until a local session proves it").

## Risks and what to watch

- **The pill's space.** Two gate buttons plus the turn words will not fit at 390 px; glyphs with accessible names, and
  the step words shrink first (ROB-18's rules).
- **Scrolling battlefield plus arrows.** Arrows must redraw on the frame's scroll; measure once per frame.

## Choices you will face

- *Keep the desk on the phone for now?* No; the same model, reduced. If a case cannot fit, the ≡ list is the path.
