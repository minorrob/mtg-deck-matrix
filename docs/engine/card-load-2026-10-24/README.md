# Card load, 2026-10-24: the compiler's candidates and the shared sentences

Rob, 2026-10-24: *"Look at the card list of cards not loaded in the engine but either automatically can be added or easily
added because of shared mechanics and characteristics with other cards loaded. Then run the load."*

One session, `claude/engine-card-load-2026-10-24`. No engine code changed: every card is a definition and its scenarios.

## The list

Rob's library was already loaded (1,362 of the workbook's 1,364 cards final; `tools/library-engine-index.mjs`). So the list
is the whole undefined Commander pool, through the card compiler (`node game/tools/card-compiler.mjs` on main 02a52c3):

| | Cards | What it means |
| --- | ---: | --- |
| **Added automatically** | 2,731 | The compiler's candidates: every sentence translated from a calibrated template, compiled, faithful, smoke game played |
| **Added easily** | 713 | One sentence short, where the missing sentence is shared by 5 or more cards: 91 sentences. One hand-written card per sentence teaches it, and the compiler takes the rest |

## The load

1. **Round one: review and promote the 2,731.** They hold 1,331 distinct sentence-to-ability pairs. Each pair was read
   once against its sentence and the cards using it, in five parallel reviews. Then 83 cards whose sentences span or split
   abilities were read whole. Approved cards were promoted with `card-waves.mjs`'s own `promote`, each with its drafted
   scenario: **2,711 promoted.**
2. **Teach the 91 sentences.** For each, one card of its list was written by hand, from `cardlib.py` generators, with
   scenarios. Where the engine lacked the rule, it was stopped instead. Result: **60 written, 30 stopped, 1 already
   taught** (`sentences.json`).
3. **Round two.** The recompile made 497 new candidates. Their 153 new pairs were read against every card using them, and
   the 12 multi-sentence cards were read whole: **497 promoted.**
4. **Converged.** A third compile finds no new candidate. The 23 left are the ones held back.

**2,887 definitions became 6,155** (+3,268: 2,711 + 497 + 60).
- `node --stack-size=4000 game/tools/batch/check-cards.mjs`: every definition playable, faithful and through its smoke
  game, every scenario green.
- Coverage (`docs/engine/coverage.md`): the card library 1,414 → 1,495 defined, the most-played 80% 1,863 → 1,873.
- Why so few most-played cards: wave 4d had already promoted the candidates among them, so these are mostly the long tail.

## Held back: 23 candidates, each a real mistranslation (`held.json`)

They stay candidates (playtest tables only) until the compiler or a hand definition fixes them. The defects are compiler
template bugs worth fixing in `game/engine/cards/sentences.mjs`:

| Bug | Cards |
| --- | --- |
| A type slot filled with the wrong type: "target creature" compiled as a land target, "creatures you control" as artifacts or enchantments, "a land" as a creature | Teetering Peaks, Smoldering Spires, Turntimber Grove, Looming Spires, Sandstone Bridge, Soaring Seacliff, Aven Fogbringer, Noggle Bridgebreaker, Skyshaper, Stormcaller's Boon, Pteron Ghost |
| A number not carried through: draw 3 for "draw a card", 1 damage for 3, transmute fixed at mana value 3 | Elite Guardmage, Tarnished Citadel, Dizzy Spell, Tolaria West |
| "For each" counting the wrong thing, or adding to toughness too | Granite Grip, Salvage Slasher |
| Overload carrying another card's effect (Vandalblast's, Cyclonic Rift's) | Electrickery, Weapon Surge, Mizzium Skin |
| A condition dropped or misapplied: a stray Class level, "costs {2} less" as `atMost: 2`, "3+ | Flying, haste" with haste unconditional | Phantom General, Gust of Wind, Galvanizing Sawship |

## Stopped: 30 sentences that need engine rules (`sentences.json`, `stopped`)

These are the next constructs, and how many cards each unlocks:
- **Combat keywords:** Swampwalk 23 and Mountainwalk 13 (`LANDWALKS` has only Forestwalk, Islandwalk, nonbasic);
  horsemanship 12, wither 12, myriad 11, banding 8, renown 7, intimidate 5, provoke 5, enlist 6.
- **Combat rules:** blocking an additional creature 10; "can't attack unless defending player controls an Island" 9;
  "can't attack or block alone" 6; "all creatures able to block this do so" 5; unblocked damage assignment 6.
- **Casting:** unleash 11, buyback 5, retrace 6, jump-start 5, learn 5, the Borderpost alternative cost 5.
- **Everything else:** "enters tapped unless a player has 13 or less life" 10; "doesn't untap during your next untap
  step" 10; "prevent the next 1 damage" 8; phasing 5; "whenever this creature deals damage" 5; the en-Kor redirect 5;
  "creatures without flying can't block" 5 (`nonKeywords` ignored by `rules/layers.mjs`); Attractions 5; "activate only
  before attackers are declared" 5.

Four sentences were written but teach less than their list:
- **Counter-then-exile:** it is learned only together with its counter (Deny Existence, No More Lies, Reject, Spell
  Shrivel still wait).
- **"If a creature dealt damage this way would die":** it is learned only with a damage effect that records its targets,
  on purpose, so Anger of the Gods does not compile to an exile that never happens.
- **Activated mana-symbol lines** (Dark Fortress's cycle): each land reads as a different line.
- **"As an additional cost, sacrifice a creature" on instants and sorceries:** `segment()` joins it only to a plain spell.
