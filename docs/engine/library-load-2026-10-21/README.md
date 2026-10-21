# Library card load, 2026-10-21

Rob's request, 2026-10-21: *"Index all cards in my library against the cards available for play in the engine. Those not
loaded, break the population of cards needing to be loaded into reasonable groups to process in parallel sessions, then
give me the copy/paste ready prompt for each session and the file to give to each of them with their card lists."*

## Where the library stands

The library is Rob's workbook `data/source/Backup_Load_-_CrankMagic_-_2026-10-21.xlsx` (Master Table v1), read for the 37
decks he named. The seven live decks are D1–D7, played from boxes. The thirty designs are S1-D1…D6, S2-D1…D6, G0-D1…D4,
G1-D1…D4, CJ1…CJ5, HG1, HG2, TB1, TB2 and TB5. Every card a deck names, plus everything owned, ordered, watched or on the
buy list, is put in one tier by `tools/library-engine-index.mjs`:

| Tier | Cards | What it means |
| --- | ---: | --- |
| Final | 1,246 | The card directory defines it: every table plays it |
| Candidate | 8 | The card compiler's: playtest tables only, until a review promotes it |
| Not loaded | 108 | No table plays it. 102 have sentences no defined card writes, 5 have more than one face, and 1 is vetoed |
| Unresolved | 0 | |
| **All** | **1,362** | |

| Where | Cards | Final | Candidate | Not loaded |
| --- | ---: | ---: | ---: | ---: |
| In a live deck (D1–D7) | 459 | 412 | 3 | 44 |
| In a design deck only | 449 | 447 | 0 | 2 |
| In the library only | 454 | 387 | 5 | 62 |

**What each live deck is waiting on** (not loaded, or a candidate):

| Deck | Cards | Which |
| --- | ---: | --- |
| D1 Atraxa | 14 | 11 walkers and walker cards (lane L1), Happily Ever After (L3), Veil of Summer (L6) |
| D2 Chulane | 3 | Regrowth (L3), Eerie Interlude, Flickering Hound (L6) |
| D3 Ezuri | 4 | Refute (L2), Amphin Mutineer (L3), Leyline Axe (L4), Blossoming Defense (candidate) |
| D4 Felothar | 3 | Nethroi (L1), Umbral Mantle (L4), Wall of Shards (L5) |
| D5 Teysa Karlov | 4 | Reveillark (L3), Cartel Aristocrat (L4), Plumb the Forbidden, Ruthless Lawbringer (L5) |
| D6 Krenko | 4 | Goblin Engineer, Boggart Shenanigans (L3), Dark-Dweller Oracle (L5), Goblin Sledder (candidate) |
| D7 Queza | 16 | **Its commander, Queza, Augur of Agonies (L6)**; 8 stack cards (L2); Teferi, Time Raveler (L1); Reveillark, Luminous Broodmoth, Hostage Taker (L3); Teysa, Envoy of Ghosts (L4); Liliana's Standard Bearer (L6); Absorb (candidate) |

Of the designs, 26 of 30 already play whole. Four still wait on cards:
- TB1 (14 cards) and TB2 (11) share D1's walkers.
- TB5 (16) is D7's list.
- G0-D2 and G0-D4 each wait on their commander (Kaalia of the Vast in L4; Kynaios and Tiro of Meletis in L6).

## The sessions

The 108 cards are dealt into six lanes, one theme each, so one lane owns each rule its cards need, as the waves were run
(`docs/handoff-2026-10-12.md` §5). The eight candidates are a seventh session, and an eighth integrates. Each lane file
lists its cards most-wanted first: the live decks' cards, then the designs', then the library's.

| Session | Lane file | Cards | In live decks | Branch |
| --- | --- | ---: | ---: | --- |
| 1 | `lane-L1-walkers.json`: planeswalkers, loyalty, emblems; two-faced cards and mutate | 17 | 14 (D1, D4, D7) | `claude/engine-libload-l1-walkers` |
| 2 | `lane-L2-stack.json`: counterspells, can't-cast, phasing, morph, surge, spree, control | 18 | 9 (D3, D7) | `claude/engine-libload-l2-stack` |
| 3 | `lane-L3-graveyard.json`: recursion, death and leave triggers, manifest | 14 | 8 (D1, D2, D3, D5, D6, D7) | `claude/engine-libload-l3-graveyard` |
| 4 | `lane-L4-combat.json`: attack and block rules, evasion, protection, equipment | 20 | 4 (D3, D4, D5, D7) | `claude/engine-libload-l4-combat` |
| 5 | `lane-L5-tokens.json`: tokens, counters, sacrifice, lifegain payoffs | 16 | 4 (D4, D5, D6) | `claude/engine-libload-l5-tokens` |
| 6 | `lane-L6-spells.json`: draws, discards, spell triggers, the rest | 23 | 5 (D1, D2, D7), with D7's commander | `claude/engine-libload-l6-spells` |
| 7 | `lane-candidate-review.json`: review the eight candidates and promote | 8 | 3 (D3, D6, D7) | `claude/engine-libload-candidates` |
| 8 | Integration: merge the seven, verify, release | — | — | `claude/engine-libload-integrate` |

- The rules every lane follows: `BRIEF.md`.
- The copy/paste prompts: `PROMPTS.md`.
- `index.json` holds every card's tier.

## Rebuilding this

```sh
DECKS="CJ1,CJ2,CJ3,CJ4,CJ5,D1-T,D2-T,D3-T,D4-T,D5-T,D6-T,D7-T,G0-D1,G0-D2,G0-D3,G0-D4,G1-D1,G1-D2,G1-D3,G1-D4,HG1,HG2,S1-D1,S1-D2,S1-D3,S1-D4,S1-D5,S1-D6,S2-D1,S2-D2,S2-D3,S2-D4,S2-D5,S2-D6,TB1,TB2,TB5"
node tools/scryfall-cache.mjs --out /tmp/scryfall.json /tmp/collection.json      # optional; rules text and prices (needs a collection first)
node tools/build-live-load.mjs data/source/Backup_Load_-_CrankMagic_-_2026-10-21.xlsx --only "$DECKS" --out /tmp/collection.json [--scryfall /tmp/scryfall.json]
node tools/build-live-state.mjs /tmp/collection.json --out /tmp/CrankMagic-backup-2026-10-21.json [--scryfall /tmp/scryfall.json]
node --stack-size=4000 tools/library-engine-index.mjs --live /tmp/collection.json --out docs/engine/library-load-2026-10-21 --lane-size 26
node tools/library-engine-index.mjs --check-lane docs/engine/library-load-2026-10-21/lane-L1-walkers.json   # where a lane stands now
```

The backup is what Rob restores (User Functions → Restore from a backup file). It replaces the library with the 37 decks:
- D1–D7 are locked, each with its box. In those decks, 30 substitutes hold the seats of the cards coming in for them.
- The thirty designs are drafts: they hold their lists without reserving a copy.

`data/live-load.json` and `data/live-state.json` (Load Live) are not changed by this.
