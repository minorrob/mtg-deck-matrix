# F5 · Damage division on the canvas

**Linear:** ROB-368 · **Wave 4** · **Lane:** `crankmagic-combat-block.js` (extends F4), a new
`tests/board-damage-division.mjs`, `game/tools/batch/breaks-damage-division.py` · **Waits on:** F4 · **Runs beside:**
F7, F8.

## Goal

When the engine asks the attacker's controller to divide combat damage (`view.decision.mode === "damage"`: two or more
blockers, or trample), the division happens on the canvas: pips on the attacker, moved by tapping blockers, trample's
rest to the badge, lethal as a tick, Confirm in the dock. The number inputs remain as the keyboard path.

## Hard rules

I1 (the engine's `total`, `lethal`, `minEach`, `divide`, the `defender` option for trample are the only truths), I5,
I9, decision guide 19 (no fixed order since 2024; never impose one).

## The specification

- The decision's options are the targets (each blocker; the defender for trample); `amounts[i]` as today
  (`board-amount`). The attacker on its approach shows `d.total` pips; each blocker shows its `lethal` as a tick mark
  and its current `amounts[i]` as filled pips; the badge shows the trample remainder when `d.options` include the
  defender.
- Tap a blocker: `amounts[i] += 1` (wheel or long-press: +1 per step, −1 with Shift or reverse wheel); tap the attacker's
  pips: reset. The total must equal `d.total` for Confirm; the engine's `damageAssignmentProblem` words appear on
  refusal, in the dock.
- Trample: the badge accepts pips only when every blocker has at least its `lethal` (the engine refuses otherwise; the
  dock shows why). Deathtouch: `lethal` is 1 as the engine says.
- Double strike: two divisions in one combat; each is its own decision and its own canvas state.
- The keyboard path: the existing inputs in the pop-up frame behind ≡, bound to the same `amounts`.

## Build steps

1. `tests/board-damage-division.mjs` with synthetic decisions: two blockers; trample with lethal met and not met;
   deathtouch; double strike; keyboard inputs; revision guards. Watch it fail.
2. Extend `crankmagic-combat-block.js` (the `block` module handles the attacker's division because the pairs are the
   same elements); the pips are the F2 `lift` states plus a small per-card HUD slot (seam `CrankCombat.pips(cardId,
   {filled, total, lethal})`: if F2 did not define it, a seam PR first).
3. `breaks-damage-division.py`: a total that does not match sent; lethal mis-drawn; trample to the badge before lethal;
   an order imposed. All caught.
4. `a11y-board`; `visual-acceptance`.

## Proof

`GEOMETRY_REQUIRED=1 node tests/board-damage-division.mjs`; the breaks runner.

## Done when

- [ ] Every division possible by inputs is possible by taps and gives the same `amounts`.
- [ ] The played division (F1) then matches what was sent.

## Risks and what to watch

- **ROB-190** notes the engine decides some divisions itself (trample on one blocker: exactly lethal, the rest to the
  player). Until that issue lands, those cases ask nothing and the canvas shows the engine's own division on the
  timeline. Do not add a question the engine does not ask.

## Choices you will face

- *Drag pips instead of tapping?* Tapping first; it has the tap and keyboard paths for free. Drag may be added later.
