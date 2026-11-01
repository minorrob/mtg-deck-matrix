# F0c · `passCombat`: the room carries one answer for one combat

**Linear:** ROB-363 · **Wave 1** · **Lane:** `game/room/room.mjs` (`prefer`, the pass logic, the view field, the
tape), its own `###` section of `docs/ui-lane/gameplay-anchor.md`, a new `tests/room-pass-combat.mjs` · **Waits on:**
nothing · **Runs beside:** F0a, F0b, F1.

> **Note, 2026-11-01 (the integrator, after ROB-351):** "the no-leak harness" below is `node tests/room-g1-terms.mjs`
> (with `node tests/engine-gate.mjs` for the engine's own decks); name it that way in the PR. Run the breaks runner as
> `python3 -u game/tools/batch/breaks.py …` and paste its `missed: []`. The handoff goes to the integrator exactly as
> `INTEGRATION.md` in this folder says; workers never merge.

## Goal

Rob, 2026-11-01: *"'No' and 'take it' do not mean that the board auto-answers. That's the user's or the AI's response
to allowing the outcome from the attacker, or from skipping the combat altogether."* The attacker's **No** and the
defender's **Take it** are one choice about one combat. Several engine questions follow it (beginning-of-combat
priority, the declaration, the response windows). The room carries the player's choice through them, the way
`yieldTurn` carries a yield (ROB-28), and still asks every other question (I6).

## Hard rules

I6, `AGENTS.md` "Decisions inside the game belong to the players" (the room may pass only what the player chose to
pass; a trigger's target, a "may", a payment, a damage division are still asked), "Behavior that would break a game is
refused, with instructions" (a `passCombat` for a combat that is not current is refused with the reason).

## The contract (anchor section `### passCombat (ROB-363)`)

```
→ {type: "prefer", passCombat: {turnId, combat}}      // combat = state.combatsThisTurn, from 1
← the next view carries, to that seat alone: passingCombat: {turnId, combat}
← refused: {type: "refused", of: "prefer", status: 409, error: "<why>"}   // not the current turn or combat; game over
```

While it holds, for that seat, in the combat phases of that turn (`COMBAT_BEGIN` to `COMBAT_END`):

- the room **passes the seat's priority** whenever it is offered;
- if the seat is the active player and the `declare-attackers` decision arrives, the room **answers it with nothing**
  (`indices: []`), provided the rules allow no attackers (an "attacks each combat if able" creature makes the answer
  the least the rules require, as `room.mjs` already computes for the AI; and if the rules then force a choice, the
  seat is asked);
- if the seat is a defender and its `declare-blockers` decision arrives, the room **answers it with no blocks**, via
  the same empty-draft check ROB-333 uses, so a required block (ROB-149, when it lands) is still asked;
- **every other question is asked**: targets, modes, costs, "may", damage division, the legend rule, anything;
- it **clears** when the phase leaves combat (`MAIN2`, `END_OF_TURN`) or the turn changes, and on a new `combat`
  index (an extra combat is a new choice).

It is on the tape (`{kind: "prefer", seat, passCombat}`) so a replay makes the same passes. The AI pilot is untouched:
it answers its questions as today (its "take it" is simply answering blocks with none).

## Build steps

1. Anchor section, then `tests/room-pass-combat.mjs`: (a) an attacker with a beginning-of-combat trigger that targets:
   `passCombat` → no attackers declared, priority passed through combat, **the trigger's target still asked**; (b) a
   defender with an instant in hand and a "may" trigger on being attacked: `passCombat` → blocks answered none,
   response windows passed, **the "may" still asked**; (c) a stale `passCombat` (last turn's) → refused 409; (d) an
   extra combat the same turn is asked again; (e) the replay of (a) and (b) is identical to the live game. Watch them
   fail.
2. Implement beside `yielding` in `room.mjs`'s pass logic; add the view field for the seat alone; add the `prefer`
   field; tape it; wake it from the record like `yielding`.
3. Run `tests/room-blocks-none.mjs`, `tests/room-block-check.mjs`, `tests/room-beats.mjs`, `tests/room-refusals.mjs`, the
   no-leak harness.
4. `breaks-pass-combat.py`: the "may" answered by the room; the policy surviving into Main 2; the field shown to another
   seat. All caught.

## Proof

`node tests/room-pass-combat.mjs`; the room suites above; the no-leak harness; the breaks runner.

## Done when

- [ ] Anchor section; the five cases pass and failed first; replays identical; the field is private to the seat.
- [ ] `docs/ui-lane/gameplay-anchor.md`'s list of `prefer` fields names `passCombat`.

## Risks and what to watch

- **Answering a decision that is not combat's.** The room may answer only `declare-attackers` (with nothing) and
  `declare-blockers` (with none) for the seat that chose; anything else asked during combat is still asked. Write the
  test for the "may" first; it is the one that catches an eager implementation.
- **Required attacks and blocks.** "Attacks each combat if able" (already handled for the AI in `room.mjs`) and
  required blocks (ROB-149, future) can make an empty answer illegal; then the seat is asked, with the gate's answer
  shown as the default. Never send an illegal answer to the engine.
- **Reconnect mid-combat.** The policy is in the record; a reconnecting seat's view shows `passingCombat` so the board
  does not show the gate again.

## Choices you will face

- *Carry it as a board-side auto-answer instead?* No (I6). The board never answers for anyone.
- *Pass priority outside combat too?* No. The scope is the combat the player answered about.
- *Should "No" with attack-forcing creatures on the board refuse instead of asking?* Ask (the engine's forced-attack
  options with the rest none), with the reason in the room's words; refusing would trap the player.
