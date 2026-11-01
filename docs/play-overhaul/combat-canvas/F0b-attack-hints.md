# F0b · Attack hints on the declare-attackers options

**Linear:** ROB-362 · **Wave 1** · **Lane:** the option builder in `game/engine/rules/combat.mjs`, the decision's
description in `game/room/decision.mjs`, its own `###` section of `docs/ui-lane/gameplay-anchor.md`, a new
`tests/room-attack-hints.mjs` · **Waits on:** nothing · **Runs beside:** F0a, F0c, F1 (and ROB-360 in the engine's
`statics.mjs` lane).

> **Note, 2026-11-01 (the integrator, after ROB-351):** "the no-leak harness" below is `node tests/room-g1-terms.mjs`
> (with `node tests/engine-gate.mjs` for the engine's own decks); name it that way in the PR. Run the breaks runner as
> `python3 -u game/tools/batch/breaks.py …` and paste its `missed: []`. The handoff goes to the integrator exactly as
> `INTEGRATION.md` in this folder says; workers never merge. There is no `blockers` function in `rules/combat.mjs`: blocker legality is `canBlock(state, id,
> player)` there and `canBlockAttacker`, `blockersAreLegal` and `lethalNeededFrom` in `game/engine/keywords/combat.mjs`;
> `combatDamageOf` and `attackTax` are in `game/engine/rules/statics.mjs`. Call those, so the hint and the ruling agree.

## Goal

The canvas's helping hand (green, amber, red outlines on attackers per front; wall creatures that dim because they
cannot block; a per-front tally) must come from the engine, computed by the same blocker logic and statics that will
judge the real blocks (Rob's decision, 2026-11-01). The board's own guessing (`attackRisk` in `crankmagic-board.js`,
which infers flying and reach) retires in F3.

## Hard rules

I1, I11 (hints never lie; absent where the engine lacks the rule), I10 (public information only: untapped creatures on
the battlefield, their keywords and statics; nothing from a hidden zone). Additive: options keep every field they
have; the room still checks the declaration exactly as today.

## The contract (write it in `gameplay-anchor.md` first, under `### Attack hints (ROB-362)`)

On every option of a `declare-attackers:<turn>` decision, a `hints` object:

```
hints: {
  couldBlock: [{cardId, kills, dies}],   // the defender's creatures that could legally block THIS attacker now
  menace: true | absent,                 // the attacker needs two blockers (a rule about the set, so a flag)
  tax: <mana amount> | absent,           // attacking this defender costs mana (attackTax), the amount
  evades: true | absent                  // couldBlock is empty although the defender has untapped creatures
}
```

- `couldBlock` is computed with the engine's own blocker legality (`blockers` in `rules/combat.mjs` and the keywords in
  `keywords/combat.mjs`: flying and reach, menace counted separately, protection, "can't block", "can block only",
  shadow, horsemanship, fear and intimidate where the engine knows them) **as the state stands now**, for the
  defender's untapped creatures only. A blocker the engine's rules would refuse is not listed.
- `kills`: that blocker alone would deal lethal damage to the attacker in the regular damage step: its combat damage by
  `combatDamageOf` (toughness as power under Doran and kin: ROB-360), deathtouch making 1 lethal, never against an
  indestructible attacker. `dies`: the attacker alone would deal lethal to that blocker, same rules. First strike and
  double strike are **not** resolved here (a trade under first strike is not a trade); the board shows ⇄ for a trade
  and the player reads the card. Pumps, tricks and triggers are not modeled: these are hints about the table as it
  stands.
- `tax`: the amount `attackTax` returns for this attacker at this defender; absent when 0.
- Where the engine does not know a keyword on either creature that bears on blocking, **omit the pair from
  `couldBlock` only if the rule says it cannot block; never guess**. If a keyword is unknown to the engine entirely,
  the hint is computed as if it were not there, and that is acceptable because the engine's own block check behaves
  the same way: the hint and the ruling agree.

The same `hints` shape is also given on `declare-blockers:<turn>` options for the defender's view (`kills`, `dies` for
the pair the option describes), so F4's tally uses engine numbers too.

## Build steps

1. Anchor section first. Then `tests/room-attack-hints.mjs` with fixtures: flying attacker versus a wall with and
   without reach; menace; protection from a color; a deathtouch blocker; an indestructible attacker; a 2/2 attacker
   into a 0/4 wall under Doran (toughness as power: `kills: true`); Propaganda's tax; a defender with no untapped
   creatures (`couldBlock: []`, `evades` absent); a face-down attacker (hints computed from its face-down
   characteristics, no name anywhere). Watch it fail.
2. Compute the hints where the declare-attackers options are built (`rules/combat.mjs`, the `declare-attackers:`
   choice). Keep it O(attackers × defenders × wall); cache `combatDamageOf` per creature within one build.
3. Make sure `room.mjs`'s `combatWords` (which rewrites labels for twins) leaves `hints` untouched.
4. Run `tests/room-combat-words.mjs`, `tests/room-block-check.mjs`, `tests/room-blocks-none.mjs`, the engine suites that
   touch combat (`game/tests`), the no-leak harness.
5. `breaks-attack-hints.py`: `kills` computed from `power` instead of `combatDamageOf`; a reach blocker omitted against a
   flyer; a tapped creature listed; a hidden-zone creature listed. All caught.

## Proof

`node tests/room-attack-hints.mjs`; `node --test game/tests/*.test.mjs`; the breaks runner.

## Done when

- [ ] The anchor section exists; `hints` appear on attack and block options; the fixtures above pass and failed first.
- [ ] Replays are identical (hints never change an answer's indices).
- [ ] The view's size grows by less than 10% on the sample views (`docs/reference/replit-sample-views.json`); if more,
      list `couldBlock` by `cardId` only and move `kills`/`dies` to a parallel array.

## Risks and what to watch

- **Drift between hint and ruling.** Any time you compute a hint with logic the block check does not use, you have
  created a lie waiting to happen. Call the same functions.
- **Performance on a Krenko board** (40 attackers × 3 defenders × 20 blockers = 2,400 pairs): measure the option
  build; it must stay under 5 ms in Node.
- **Face-down and morphs**: characteristics come from the face-down object (2/2, no abilities); no name leaks through
  `hints`.

## Choices you will face

- *Model first strike in `kills`/`dies`?* No. State the limit in the anchor section; the board shows the keyword glyph
  on the card and the player reads it.
- *Put hints on the view's `state.combat` instead of options?* No. They belong to the decision (the moment of choice),
  and they are private to the deciding seat's view by construction.
- *A keyword the engine does not implement at all?* Treat it as absent in both the hint and the check; file the
  keyword as an engine issue; never special-case the hint.
