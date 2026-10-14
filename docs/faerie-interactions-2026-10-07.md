# Faerie interactions, October 7, 2026

`codex/faerie-interactions` follows commander PR #673 at `3fdedc29`.
The new definitions are Faerie Mastermind, Spellstutter Sprite and Gilt-Leaf
Winnower, using the committed Oracle record. No card is substituted and no
provisional definition is promoted.

Faerie Mastermind's trigger uses the ordinal of each successful draw event,
shared by ordinary draw steps and draw effects. All players' counts reset on
every new turn, and the count survives serialization. Drawing three cards
together still produces exactly one second-card trigger; entering after that
draw does not retroactively trigger. Its activation draws for every player.

Spellstutter Sprite counts current controlled Faerie permanents, including
noncreature Kindred permanents, when choosing its target and again at resolution.
The common target filter now includes the chosen X in a spell's mana value on
the stack; X remains zero for cards outside the stack. This change does not
claim to revise every other mana-value arithmetic path.

Gilt-Leaf Winnower offers the optional destruction of a non-Elf creature whose
current power and toughness differ in either direction. Changeling, layers,
negative power and a target becoming equal before resolution are covered.

Sower of Temptation is deliberately left unavailable. The current raw-controller
and end-of-turn restoration paths do not implement its source-duration control
effect or overlapping control effects faithfully. Tegwyll remains provisional.

## Evidence and limits

- `node tests/engine-faerie-interactions.mjs`: 57 targeted checks, including five
  card scenarios, multiplayer draws, reload and changed targets.
- `NODE=<Node22> python game/tools/batch/breaks.py game/tools/batch/breaks-faerie-interactions.py`:
  all 20 deliberate faults caught and restored after a passing baseline.
- All 243 engine/regression suites passed: `tests/engine-*.mjs`,
  `tests/data-integrity.mjs` and `tests/feature-wiring.mjs`. This includes all
  1,000 deterministic whole-game replay/hidden-information runs and unchanged
  room performance gates. The held room seed completed in 75 turns / 23.6 seconds,
  16.2 CPU yardsticks per 1,000 events, inside both existing limits. Generic
  room fixtures still report survived refusals; this is not a zero-refusal claim.
- The generated coverage contains 1,661 confirmed and 28 provisional definitions;
  the latter are checked but not seated. The seven committed lists have 46
  distinct unavailable names (45 undefined plus Tegwyll). D7 has eight gaps;
  D1 has 18, D2 zero, D3 nine, D4 four, D5 zero and D6 seven.

These are isolated cloud checks, not a staged game or the exact October 4
backup on the offline desktop. Main and Train B stay unchanged. Release access,
data materialization and paid-AI approval remain separate gates.
