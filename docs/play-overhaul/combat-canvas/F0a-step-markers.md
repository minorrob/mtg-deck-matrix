# F0a · Step markers in `events.v1`

**Linear:** ROB-361 · **Wave 1** · **Lane:** `game/room/events.mjs`, its own `###` section of
`docs/ui-lane/gameplay-anchor.md`, `tests/room-events.mjs` · **Waits on:** nothing · **Runs beside:** F0b, F0c, F1.

> **Note, 2026-11-01 (the integrator, after ROB-351):** "the no-leak harness" below is `node tests/room-g1-terms.mjs`
> (with `node tests/engine-gate.mjs` for the engine's own decks); name it that way in the PR. Run the breaks runner as
> `python3 -u game/tools/batch/breaks.py …` and paste its `missed: []`. The handoff goes to the integrator exactly as
> `INTEGRATION.md` in this folder says; workers never merge.

## Goal

The board's timeline player (F1) must know where one combat step ends and the next begins, so a first-strike wave
plays before the regular one and a combat's bursts are grouped truthfully (README, I2). Today a view's `events` carry
`attack`, `block`, `damage`, `life`, `move`, `tap` in order but no step boundaries.

## Hard rules

I2 (events are the truth), I10 (nothing hidden leaks), `AGENTS.md` "A test that cannot fail is a comment".
Additive only: no existing kind is renamed, no field removed; a client that ignores unknown kinds behaves as before.

## The contract (write this in `gameplay-anchor.md` first, under `### Step markers (ROB-361)`)

A new event kind `step`, emitted whenever the turn's phase changes, for **every** phase (not only combat; it is
cheaper to be general than to special-case):

```
{eventId, turn, phase, kind: "step", step: <the new phase>, player: <state.turnPlayerId>}
```

`step` is one of the engine's phase names (`UNTAP`, `UPKEEP`, `DRAW`, `MAIN1`, `COMBAT_BEGIN`,
`COMBAT_DECLARE_ATTACKERS`, `COMBAT_DECLARE_BLOCKERS`, `COMBAT_FIRST_STRIKE_DAMAGE`, `COMBAT_DAMAGE`, `COMBAT_END`,
`MAIN2`, `END_OF_TURN`, `CLEANUP`). An "end" of a step is the next step's `begin`: the board infers it, so there is
exactly one marker per transition and no pairing to get wrong. Public, identical for every seat, in order with the
other events. The existing `turn` event (on `UNTAP`) stays as it is.

## Build steps

1. Write the anchor section (above), then the test: extend `tests/room-events.mjs` with a game that reaches a
   first-strike combat and a two-defender combat and asserts, in order: `attack`, `step COMBAT_DECLARE_BLOCKERS`,
   `block`, `step COMBAT_FIRST_STRIKE_DAMAGE`, its `damage` events, `step COMBAT_DAMAGE`, its `damage` and `life`
   events, `step COMBAT_END`. Watch it fail.
2. In `tableEvent()` (`game/room/events.mjs`), on `GameEventTurnPhase`, return the `turn` event as today for `UNTAP`
   **and** a `step` event for every phase change. `tableEvent` returns at most one event today; if that constraint is
   load-bearing (read its callers in `room.mjs`), return an array for this kind and adapt the one caller, or emit
   `step` from the phase-change site in `room.mjs`'s event plumbing; either way the journal id (`event:<sequence>`)
   stays the engine's.
3. Make the test green; run `tests/room-events.mjs`, the no-leak harness, `tests/room-history-full.mjs`.
4. Add a mutation to `game/tools/batch/breaks-*.py` (a new `breaks-step-markers.py`): the marker dropped for
   `COMBAT_FIRST_STRIKE_DAMAGE`; the marker emitted out of order (after the damage). Both must be caught.

## Proof

`node tests/room-events.mjs`; the no-leak harness; `python game/tools/batch/breaks.py game/tools/batch/breaks-step-markers.py`.

## Done when

- [ ] The anchor section exists and matches the code.
- [ ] `tests/room-events.mjs` asserts the order above and failed first.
- [ ] A replay of the same game yields the same `step` events (the journal is the source).
- [ ] The breaks runner catches both mutations.

## Risks and what to watch

- **The view keeps the newest 200 events.** A long AI slice can push a combat's markers out; the board then sees
  `eventsReset` and draws the end state. Do not raise `EVENTS_KEEP` to fix a board symptom; it is the board's job to
  handle a reset (F1).
- **Extra combats** (Aurelia, Moraug) produce a second `COMBAT_BEGIN` in one turn: fine, one marker each.
- **A phase skipped by the rules** (no attackers: no declare blockers or damage steps) produces no marker: fine.
  Never emit a marker for a step that did not happen.

## Choices you will face

- *Only combat phases, or all?* All. One general rule, no special cases to maintain.
- *Begin and end markers, or begin only?* Begin only; an end is the next begin.
- *Should `step` carry the active player?* Yes (`player`), cheap and useful to the sound and the camera.
