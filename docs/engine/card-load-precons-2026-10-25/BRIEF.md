# The brief for every lane of the precon load (2026-10-25)

You are one of five lanes writing the 150 unwritten cards of the six precons on the Decks screen. `README.md` here has the
review and the table of lanes; your prompt names your lane and its file.

**This brief is the 10-24 priority-list load's brief with the differences below.** Read
`docs/engine/card-load-rob-lists-2026-10-24/BRIEF.md`, which in turn sends you to wave 4d's
(`docs/engine/card-load-2026-10-23/BRIEF.md`), and follow both, except where this file says otherwise.

## Your card list

`lane-<lane>.json` here: `cards` only. The commander (if unwritten) first, then the cards that need no new rule, then those
that need a rule your lane owns.

## Who builds which rule

Before building anything, grep the definitions and the engine: most of what these cards use exists, and the 10-24 load
added airbend, myriad, an additional end step, devour, sacrifice X, descend, shield counters, Alliance's unchosen modes,
"choose one at random", moving counters, the second card drawn each turn, and a life-gain adder. A rule the table below
does not name is the lane's whose card needs it; if two lanes need the same unbuilt rule, the earlier letter builds it and
the other stops on its card, naming the rule.

| Lane | Owns |
| --- | --- |
| A Angels | Lieutenant (Angelic Field Marshal, Tyrant's Familiar); "can't attack you unless its controller pays" and its block twin (Archangel of Tithes); exalted given to Clues; "7 life more than your starting life total"; a cast restriction by turn of the game (Serra Avenger); an alternative cost of tapping untapped creatures (Sephara); "if it had counters on it, investigate" |
| B Engineering | Imprint and a card's copied power and toughness (Duplicant); base power and toughness set for other creatures, and forced attacks (Graaz); reselecting a defender (Misleading Signpost); a counter threshold that exiles (Mazemind Tome); destroying by mana value X (Steel Hellkite); returning an artifact as a cost (Master Transmuter) |
| C Dragons | Additional combat phases (Hellkite Charger, Scourge of the Throne); dethrone; discover; behold; unspent mana kept (Leyline Tyrant); mana spendable only on Dragons and its rider (the Orbs); exiling to play until your next end step (Dragonhawk); the Saga The Elder Dragon War |
| D Dinosaurs | Formidable and ferocious conditions; "can't be blocked by more than one creature"; tokens that each fight a different creature (Ezuri's Predation); damage divided among any number of targets; "greatest mana value among your commanders"; "can't attack or block unless" (Rhonas) |
| E Zombies | A death replacement for opponents' nontoken creatures (Kalitas); "dies or is put into exile" (God-Eternal Bontu); a monarch attack drain (Marchesa's Decree); casting a creature card from a graveyard this turn (Zul Ashur); a graveyard ability whose cost depends on opponents' lands (Razorlash Transmogrant); "half the creature cards" amounts |

## Rules that differ from 10-24's brief

- **Branch** `claude/engine-precons-<lane>` (e.g. `claude/engine-precons-a-angels`) from `origin/claude/engine-precons-oct2`.
- **Breaks file:** `game/tools/batch/breaks-precons-<lane>.py`.
- **Suite:** `tests/engine-precons-<lane letter>.mjs` if you need one (check the name is free). Set the README's suite count
  to `ls tests/*.mjs | wc -l` on your branch; the integration sets it again.
- **Draft PR** into `claude/engine-precons-oct2`, titled `Precons <lane>: <n> of <m> written`.
- **The deck must play.** Your deck's cards are a game: after writing them, confirm the table seats the deck
  (`tableDefinition` resolves every card of `data/precons.json`'s deck, commander included) and say so in the report.
