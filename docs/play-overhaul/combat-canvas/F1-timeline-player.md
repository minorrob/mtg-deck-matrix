# F1 · The timeline player

**Linear:** ROB-364 · **Wave 1** · **Lane:** `crankmagic-timeline.js` (new), the `adopt()` seam and the event hooks in
`crankmagic-board.js`, its block of `crankmagic-stage.css`, `tests/timeline-plan.mjs` (Node), `tests/board-timeline.mjs`
(browser), `tests/fixtures/timeline/**`, `game/tools/batch/breaks-timeline.py` · **Waits on:** F0a (merged before
ready; build first against its written contract with a fixture) · **Runs beside:** F0a, F0b, F0c.

Rob, 2026-11-01: *"build the foundation first."* This is the foundation: without it the canvas would animate guesses.

## Goal

The board stops animating by diffing two views alone. When a view arrives whose new events carry more than one visible
change, the board **holds** the new state and **plays** the events in order, paced to a budget, then paints the view.
Damage becomes a number flying from source to target that lands as the card's damage mark or the badge's life; deaths
fall by the existing flight; callouts fire at their event. Nothing in this feature changes what is drawn at rest: the
strip and the pop-ups stay; F2 replaces them.

## Hard rules

I2, I3 (a card that moves on the timeline moves on an eased path), I8, I10 (an event about a face-down card draws a
back and no name), decision guide 9 (what cuts a hold) and 20 (bundle, never drop).

## The specification

### `crankmagic-timeline.js` (classic script, exposes `CrankTimeline`; no DOM in `plan`)

```
CrankTimeline.plan(before, after, {overlay, reduced, phoneBudget}) → schedule
  // before, after: two CrankRoomView@1 views of the same match and seat (before may be null)
  // picks after.events whose eventId is newer than the newest eventId already played (by eventId, so a view
  // "sent again" repeats nothing); ignores unknown kinds; stops with an empty schedule on eventsReset
  // groups by `step` markers (F0a); assigns EVENT_MS per kind (README constants); scales the whole to
  // COMBAT_BUDGET_MS × clamp(overlay/60, 0, 1.5) when the sum exceeds it; floors each at 60 ms unless the budget is 0;
  // reduced → every duration 0
  // returns {items: [{at, ms, event}], total, cuts: false}
CrankTimeline.play(schedule, hooks) → Promise<void>
  // hooks: {attack, block, step, damage, life, move, tap, cast, resolve, other}(event, {ms, index}) → void | Promise
  // plays items at their `at`, in order, never two of the same target at once (serialize by target cardId/player)
CrankTimeline.cut()                 // jumps to the end: every pending hook is called with ms 0, the promise resolves
CrankTimeline.holding() → boolean   // true while a schedule plays
CrankTimeline.played(eventId)       // mark as played (adopt after a cut), so a repeat is not replayed
```

### The seam in `crankmagic-board.js`

In `adopt(next)`: if `CrankTimeline.holding()` and the next view is **not urgent**, queue it and return; the queued
view is adopted when `play` resolves. **Urgent** (cut, then adopt at once): `next.decision` is for this seat and
differs from the current one; `matchId` or `seat` changed; `next.eventsReset`; `next.status === "finished"`. Any
pointer, key or wheel input on `#cm-board` also cuts. Otherwise, before `draw()`, compute the schedule from
`(view, next)` and play it with hooks that draw:

- `attack`: the attackers' tapped marks and the strip's rows (today's drawing) and the INCOMING callout, at this moment;
- `block`: the strip's blockers;
- `step`: a 120 ms beat; `COMBAT_FIRST_STRIKE_DAMAGE` and `COMBAT_DAMAGE` begin a wave;
- `damage`: a number element (`.cm-timeline-number`, the amount, tone harm) flies from the source's box to the target's
  box (a card `.cm-bcard[data-card]`, or the seat's vitals pill) over `EVENT_MS.damage`, then the target's damage mark
  or life text updates; several `damage` events in one wave to different targets may fly together (bundle), but two
  to the same target are serialized;
- `life`: the pill's number tweens over `EVENT_MS.life`; the HIT or LIFE callout fires here;
- `move`: the existing flight (`motionPlay`'s logic), extracted so it can run per event;
- `tap`: the existing turn;
- `cast` / `resolve`: the existing held-up play (ROB-102), at its moment rather than at the view.

`motionPlay`'s diff-based flights remain for views without events (older rooms, `eventsReset`), and for the morph's
own FLIP (F2). Callouts (`calloutsFor`) move from "at the view" to "at the event" for life, KO, INCOMING; the others
stay.

### Reduced motion and the budget

`CrankMotion.reduced()` → every duration 0 and `play` resolves synchronously (the end state in one paint). Overlay 0
(Settings › Play) → the same. The phone uses the same budget.

## Build steps

1. Fixtures first: `tests/fixtures/timeline/*.json`, each `{before, after}` from a real room or the sample views,
   covering: a first-strike combat (two waves), a two-defender combat, a spell cast and resolved between views, a view
   sent again (duplicate events), `eventsReset`, a face-down attacker, and one with 25 damage events (the bundle).
   Build them with a small Node script that runs a room and captures consecutive views; commit the script under
   `game/tools/` and the JSON.
2. `tests/timeline-plan.mjs` (Node, no browser): asserts order, grouping by `step`, durations, budget scaling, the floor,
   reduced → zeros, duplicates skipped, unknown kinds ignored, reset → empty. Watch it fail; write `plan`.
3. `tests/board-timeline.mjs` (browser, synthetic socket views as `tests/board-combat-display.mjs` does): asserts the
   number element appears at the source's box and ends at the target's, the pill's text changes only after the flight,
   the callout fires at the event, a held view is painted after the play, an urgent view cuts, input cuts, reduced
   motion paints once. Watch it fail; write the seam and hooks.
4. `breaks-timeline.py`: events played out of order; the budget ignored; a hidden card's name in the number's label;
   motion under reduced motion; an urgent decision held. All caught.
5. Run `tests/board-callouts.mjs`, `tests/board-callouts-place.mjs`, `tests/table-board.mjs`, `tests/a11y-board.mjs`,
   `tests/board-flat-views.mjs`, the solo-vs-AI journey (`node tests/uat/solo-vs-ai.mjs`).
6. Add the script to both pages and the service worker; bump pins by tool.
7. `visual-acceptance`: Table, Focus and 3D at 1280×720, a first-strike combat and an AI's whole combat.

## Proof

`node tests/timeline-plan.mjs`; `GEOMETRY_REQUIRED=1 node tests/board-timeline.mjs`; the suites in step 5; the breaks
runner.

## Done when

- [ ] `plan` is pure and the Node suite covers every rule above.
- [ ] A first-strike combat shows two waves; an AI's whole combat plays inside the budget and is cut by input.
- [ ] No existing suite changed its expectations except where a callout now fires at its event.
- [ ] Served files pinned; both pages and the service worker list the script.

## Risks and what to watch

- **Holding a decision.** The one unforgivable bug is a held view that carried a question for this seat. Test it
  first. When in doubt, cut.
- **Serialization by target.** Two numbers landing on one pill at once produce a wrong intermediate total; serialize.
- **Memory of played events.** Keep the newest 400 played `eventId`s, not all; a new `matchId` clears them.
- **`motionPlay` entanglement.** Extract the flight into a function the hook can call; do not duplicate it.
- **The pill moves.** The vitals pill's box is measured at the event, not at plan time (the layout can change).

## Choices you will face

- *Play the whole view's events or only combat's?* All of them; the module is general and F9 and later features depend
  on it being so. The budget is per view.
- *A view arrives with 300 events (an AI's three turns)?* Bundle per step and cap the total at the budget; never drop.
- *Should `plan` read the DOM to know what is visible?* No. `plan` is pure; hooks decide what to draw.
- *The source of a damage event is gone from the view?* Fly from its owner's graveyard pile, or from the badge if there
  is none; never from (0, 0).
