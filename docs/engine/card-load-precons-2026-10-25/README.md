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
