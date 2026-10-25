# Card load, 2026-10-25: the six precons on the Decks screen

Rob, 2026-10-25: *"Next, we need to ensure that all cards in the precons listed on the Decks screen is loaded into the game
engine and can be played in Play."*

The Decks screen's "New from Wizards" lists the newest Commander decks (`data/precons-latest.json`): Foundations Commander
and Reality Fracture Commander, released 2026-10-02. Their decklists are Wizards' own, through MTGJSON (`data/precons.json`).
Main was `4096eb28` (6,255 definitions, after PR #862).

## The review

| Deck | Commander | Distinct cards | Playable now | To write |
| --- | --- | ---: | ---: | ---: |
| Calling All Angels | Giada, Font of Hope | 69 | 35 | 34 |
| Keen Engineering | Sai, Master Thopterist | 67 | 45 | 22 |
| Multiverse Reforged | Jace, Multiverse Architect | 93 | **93** | 0 |
| Reign of Dragons | Lathliss, Dragon Queen | 69 | 41 | 28 |
| Tramplesaurus Rex | Ghalta, Primal Hunger | 69 | 43 | 26 |
| Wretched Ranks | **Ghoulcaller Gisa** | 68 | 28 | 40 |
| **All, each card once** | | **406** | **256** | **150** |

- **Multiverse Reforged plays already.** The other five each wait on their unwritten cards; of the commanders, only
  Ghoulcaller Gisa is unwritten.
- **None of the 150 is a compiler candidate.** 149 have a sentence no defined card writes (87 are one sentence short) and
  one is another layout (the Saga The Elder Dragon War). So each is written by hand.
- **Most are classic cards built from what exists:** lords and anthems, ETB and death triggers, the monarch, investigate,
  cycling, flashback, kicker, gift, affinity, improvise, cost reductions by creature type, "choose one that hasn't been
  chosen" (built on 10-24), the second card drawn each turn (built on 10-24).
- **Rules that may not be built** (each lane confirms first): lieutenant; additional combat phases; dethrone; discover;
  behold; imprint with a card's power and toughness (Duplicant); base power and toughness for others (Graaz); reselecting a
  defender (Misleading Signpost); unspent red mana kept (Leyline Tyrant, stopped on 10-23 as Electro's rule); mana spendable
  only on Dragons; a cast restriction by turn of the game (Serra Avenger); an alternative cost of tapping creatures
  (Sephara); fights against different creatures (Ezuri's Predation); a death replacement for opponents' creatures (Kalitas).

## The load: five lanes, one per deck

| Lane | Deck | File | Cards | Branch |
| --- | --- | --- | ---: | --- |
| A | Calling All Angels (and Tyrant's Familiar, for lieutenant) | `lane-A-angels.json` | 35 | `claude/engine-precons-a-angels` |
| B | Keen Engineering | `lane-B-engineering.json` | 22 | `claude/engine-precons-b-engineering` |
| C | Reign of Dragons | `lane-C-dragons.json` | 27 | `claude/engine-precons-c-dragons` |
| D | Tramplesaurus Rex | `lane-D-dinosaurs.json` | 26 | `claude/engine-precons-d-dinosaurs` |
| E | Wretched Ranks | `lane-E-zombies.json` | 40 | `claude/engine-precons-e-zombies` |

Each lane branches from `claude/engine-precons-oct2` and opens a draft PR into it; that branch integrates the five and goes
to `main` as one PR. `BRIEF.md` is every lane's brief.

## The result: all 150 written, all six decks seat whole

| Lane | PR | Final | Scenarios | Stopped |
| --- | --- | ---: | ---: | --- |
| A Calling All Angels (and Tyrant's Familiar) | #869 | 35 of 35 | 110 | none |
| B Keen Engineering | #866 | 22 of 22 | 77 | none |
| C Reign of Dragons | #870 | 27 of 27 | 83 | none |
| D Tramplesaurus Rex | #867 | 26 of 26 | 72 | none |
| E Wretched Ranks | #868 | 40 of 40 | 104 | none |

**6,255 definitions became 6,405.** Every one of the six decks' 406 distinct cards resolves through `tableDefinition`,
every commander included. Each lane's PR body lists its engine changes; in short:

- **A:** Angelic Destiny's "return this card" from the graveyard; Archangel of Tithes' block tax, asked and paid
  (CR 509.1d); Vanguard Seraph's first life gain each turn; each player's turns counted (Serra Avenger); Sephara's
  alternative cost of tapping fliers (CR 118.9); "an opponent's life total", "opponents with more".
- **B:** Duplicant's imprinted power, toughness and types; combat damage dealt to each player by each source this turn
  (Steel Hellkite); reselecting a defender (CR 508.7, Misleading Signpost, a new primitive `reselectAttack`); "during a
  step"; "the monarch" in a selector.
- **C:** dethrone; pack tactics; behold; discover's "if you don't cast it"; read ahead (The Elder Dragon War); red mana
  kept (Leyline Tyrant), still restricted when it was; "still exiled" counted as a delayed trigger resolves.
- **D:** tokens that each fight a different creature, all at once (Ezuri's Predation); damage divided among any number
  of targets, asked of the caster (Monstrous Onslaught); "the greatest mana value among your commanders".
- **E:** Kalitas's exile-and-make-a-Zombie replacement; "kicked" kept on the permanent (Josu Vess); a gift's extra
  target (Consumed by Greed); a sacrifice remembered for every player (Syphon Flesh).
- **The integration:** `table-candidates`' fresh-copy check now empties a candidate that has abilities (the first by
  name, Annul, is an instant whose ability is its spell, so it had nothing to empty); three breaks re-anchored where
  the merges moved their lines, each caught again.

**Ignores** (a card that plays differently from a table in one case, named, not fixed):
- **Kalitas, Traitor of Ghet** beside another "exile it instead" (a second Kalitas, Dauthi Voidwalker): the dying
  creature's controller is not asked which applies (CR 616.1); the first found applies. And two state-based deaths
  exile under Kalitas but make no Zombie: an Aura creature put into the graveyard, a creature planeswalker at 0 loyalty.
- **Emeria Shepherd:** "if that land is a Plains" reads the land as the trigger resolves, so a Plains gone by then fails.
- **Serra Avenger:** in a game saved before this load, "your first three turns" count from the next turn.
- **Leyline Tyrant:** "pay any amount of {R}" does not offer zero.
- **Pack tactics (Minion of the Mighty):** a negative power subtracts from the total; no ruling was checked.

**Follow-up:** the compiler's candidates are 100 (from 58), playable at playtest tables only until a wave reviews them.

**Proof** (Personal-HP, the integrated head):
- `check-cards`: 6,405 definitions, 10,928 scenarios, 0 failed. Definitions, coverage, catalog and the data inventory
  `--check` current.
- 419 suites green: every `tests/engine-*.mjs`, the five lanes' suites, `card-waves`, `card-compiler`,
  `sentence-library`, `table-candidates`, `table-basics`, `table-scenarios`, the `room-*` suites, `data-integrity`,
  `feature-wiring`.
- Breaks: each lane's file `missed: []` (A 48, B 34, C 48, D 37, E 24); the re-anchored breaks caught again;
  `anchors.py` 3,389 breaks in 163 files, no problems. `table-candidates`' fresh-copy check fails when the candidates
  generator hands out one shared object.
- `--check-lane`: A 35/35, B 22/22, C 27/27, D 26/26, E 40/40 final.
