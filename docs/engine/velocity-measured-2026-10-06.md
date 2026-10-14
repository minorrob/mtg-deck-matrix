# Engine velocity, measured (2026-10-06)

This is execution-plan step X10 (`docs/plan-execution-2026-10-03.md`): a 50-card pilot of bulk definitions, drawn at
random from the most-played cards that need only a definition, drafted from Oracle text and the Comprehensive Rules
alone, run through `game/tools/engine-ingest.mjs`'s checks, and then played in scenarios. It replaces the estimate in
`docs/engine/velocity-2026-10-03.md` ("50–100 cards a batch") with a measured rate, and it measures what the plan
review's R5 and R11 warned about: a smoke game proves a definition does not throw, not that it plays right.

There was no API key in the session, so the session was the drafter, as `engine-ingest.mjs`'s header describes. No
Forge script or source was read (ADR-001); rules are cited by number only.

**The numbers.**

| Of the 50 drafts | Cards | Share |
| --- | ---: | ---: |
| Passed the checks (schema, fidelity, smoke): stored provisional by the tool | 40 | 80% |
| Passed the checks and were right as far as the drafter could tell | 30 | 60% |
| Passed the checks and played right in scenarios: **stored** | **28** | **56%** |
| Did not pass, or passed and were wrong: an engine gap | 21 | 42% |
| Did not pass because of a gap in the ingest path itself (a modal double-faced card) | 1 | 2% |
| Drafting errors (a mistake a better draft fixes) | 0 | 0% |

The checks overstate the right rate by 24 points: 12 of the 40 definitions they passed were wrong. Ten of those the
drafter knew to be wrong as it wrote them, because the engine lacks the construct and the checks ignore a key they do
not know; two more were found only by playing them.

## The population

The population is the most-played cards with every mechanic built and no definition: the catalog's "with every
mechanic built, so only their definitions are left to write" figure less the cards already defined. It was computed at
`main` a2063d95, before anything was stored, like this:

1. Every card in `game/docs/engine-inventory.json`, `top.perCard`: the 3,238 most-played 80% of Commander cards
   (`data/engine/top-cards.json`).
2. Dropped when the card directory resolves it as playable: `loadCardIndex()` from `game/tools/engine-cards.mjs`,
   `resolve(name).playable === true` (1,144 cards).
3. Kept when `missingFor(card)` from `game/tools/engine-constructs.mjs` is empty: every effect, trigger, static,
   replacement, option, count and keyword the inventory records for it is built.

That leaves **1,316 cards** (2,460 with every rule, less 1,144 defined). None of them had a definition that the
directory could not play. The figure was 1,275 at batch 80; the engine's credits since then grew the "every rule"
count by 193 and the defined count by 152.

## The sample

The 1,316 cards, in the order of `data/engine/top-cards.json` (most played first), were shuffled once with the
engine's own generator, `createRng("x10-velocity-2026-10-06").shuffle(...)` from `game/engine/rng.mjs` (xoshiro128**
seeded by splitmix32, an unbiased Fisher-Yates shuffle), and the first 50 draws were taken. A draw with no record in
`data/engine/oracle.json` would have been replaced by the next one and counted; none was, so the sample is the first
50 draws exactly. No card was chosen by hand.

**Seed:** `x10-velocity-2026-10-06`. **Replaced draws:** 0.

By the front face's type, the 50 are 25 creatures (one of them the front of a modal double-faced card with a land on
its back), 14 instants and sorceries, 4 enchantments (one an Aura), 4 artifacts (one Equipment), 2 lands and 1
planeswalker; 15 are legendary.

## How the drafts were written and checked

Each card's abilities were written in `CrankCardScript@1` from its Oracle text, using the hand-authored definitions
under `game/engine/cards/` and `game/engine/script/schema.mjs`, `cards/index.mjs` (`TRIGGERS`), `script/filter.mjs`
and `script/amount.mjs` as the grammar reference. Where a card needed something the grammar does not have, the draft
said it the way the grammar would if it had it (`nthThisTurn` on a draw trigger, a `nonCounters` selector) and named
the gap in the card's `notes`. The session file is `data/engine/sessions/x10-pilot-2026-10-06.json` (writer
`x10-session`), all 50 drafts with their notes, kept so a blocked draft is checked again once the engine builds what it
needs.

The checks are `engine-ingest.mjs`'s: schema (`validateScript`), fidelity (`checkFidelity`: every ability a sentence of
the card, every clause claimed) and the smoke game (`smokeTest`: the card cast or played in a scratch game, its
abilities used, every question answered with its first legal answer). A definition that passes all three and uses
nothing unbuilt is stored provisional; one that names something the compiler knows is unbuilt is blocked.

## First pass

`node game/tools/engine-ingest.mjs data/engine/sessions/x10-pilot-2026-10-06.json --dry-run` **crashed on the batch**:
Planar Genesis's draft carried an `otherwise` key on a `dig` effect (its gap, written as an object), the card
compiler walks every effect's `otherwise` as a list of effects (`effectsIn`, `game/engine/cards/index.mjs`), and the
smoke test calls the compiler outside its `try` (`smokeTest`, `game/engine/cards/compile.mjs`). One malformed draft
ended the run with a `TypeError` and no outcome for any card. The same checks were then run card by card through the
tool's own `ingestCards` with the command line's inputs (so one card that throws is recorded as such), and the command
line itself over the 49 cards that do not crash it. Both agree:

| Outcome | Stage | Cards |
| --- | --- | ---: |
| provisional | all three checks passed | 40 |
| failed | schema | 4 |
| failed | fidelity | 1 |
| failed | smoke | 1 |
| blocked | named by the compiler | 3 |
| crashed the tool | compile, inside the smoke stage | 1 |

**First-pass rate: 40 of 50 (80%) passed the checks.** The ten that did not, each with what stopped it:

| Card | Outcome | What the check said | Kind |
| --- | --- | --- | --- |
| Shiny Impetus | failed, schema | "goaded" is not a rule a static ability can change | engine gap |
| Betor, Kin to All | failed, schema | an amount counts one thing (no total toughness) | engine gap |
| Rat Colony | failed, schema | "deck-any-number" is not a rule a static ability can change | engine gap |
| Crackle with Power | failed, schema | a target's count is whole numbers (not X) | engine gap |
| Boggart Trawler // Boggart Bog | failed, fidelity | not a sentence of the card | tool gap |
| Wave Goodbye | failed, smoke | the selector grammar has no key "nonCounters" | engine gap |
| Calamity of the Titans | blocked | reveal: an additional cost nothing pays yet | engine gap |
| Iron Spider, Stark Upgrade | blocked | removeCounters: a cost atom nothing pays yet | engine gap |
| Favorable Winds | blocked | a layer static's affects has no key "keywords" | engine gap |
| Planar Genesis | crashed the tool | `TypeError: (list ?? []) is not iterable` | engine gap, and a tool defect |

None of the ten is a drafting error: in each, the card says something the engine cannot yet say, or (Boggart Trawler)
the ingest path cannot carry it. A modal double-faced card's Oracle text is on its faces (`data/engine/oracle.json`
gives `text: ""`), and the session format and `assembleScript` carry no back face, so every one fails fidelity
whatever is written; the hand-authored modal double-faced cards (Fell the Profane // Fell Mire) carry a `back`.

Of the 40 that passed, the drafter withheld ten it knew to be wrong. Nine used a key the checks do not read, so the
definition played as though the missing construct were not there; Nykthos Paragon used a real key (a trigger's
`limit`) whose meaning is not the card's:

| Card | What the draft could not say | What the passed definition actually does |
| --- | --- | --- |
| Myr Battlesphere | tap any number of untapped Myr chosen as it resolves, X their number | taps nothing; +0/+0 and 0 damage |
| Emrakul's Messenger | "your second card each turn" on a draw trigger | makes a Spawn on every draw |
| Season of Gathering | pawprint modes, the same mode more than once (CR 700.2i, 700.2d) | one mode, as a plain modal |
| Dour Port-Mage | "one or more ... leave the battlefield without dying" (CR 700.4) | draws when a creature dies too, once per creature |
| Worldsoul's Rage | up to X land cards from the hand and/or the graveyard | the hand only |
| Ripples of Potential | the permanents proliferate put a counter on, remembered | phases nothing out |
| Kodama of the East Tree | "if it wasn't put onto the battlefield with this ability" | chains off its own arrivals |
| Ulamog, the Infinite Gyre | "when Ulamog is put into a graveyard from anywhere" | triggers on any card put into its owner's graveyard while Ulamog is on the battlefield, and never on Ulamog's own trip there from a hand or a library |
| Finale of Devastation | a search of the library and/or the graveyard | the library only |
| Nykthos Paragon | "do this only once each turn" on the choice, not the trigger | a declined first trigger uses up the turn's one |

## Second pass

The second pass fixes the drafting errors and runs again. The first pass found none, so the second pass is the first:
40 passed, 3 blocked, 6 failed, 1 crashed. **Second-pass rate: 40 of 50 (80%), unchanged.** The engine gaps stay
blocked; no engine construct was built. Thirty cards (the 40 passed, less the ten withheld) were stored with
`engine-ingest.mjs` without `--dry-run`.

## Beyond the smoke test: the late check

Every one of the 30 stored cards was then played in scenarios the way the hand-authored scenario files are
(`game/engine/cards/scenario.mjs`, `game/tools/batch/README.md`), each aimed at what makes the card that card: The Book
of Exalted Deeds' Angel surviving 50 life lost, Fling's damage equal to the sacrificed creature's power, Azusa's third
land and not a fourth, Chocobo Racetrack's Bird pumping off the next land, Cryptbreaker's three Zombies (itself among
them, an opponent's not), Liliana's −3 counting Swamps and not other lands, Feldon's copy an artifact with haste and
gone at the end step, Koma's ward and its four Coils, Loyal Warhound's intervening "if" (CR 603.4) both ways, and so on
for all 30.

**28 of the 30 played right. Two were wrong**, found only by playing them:

| Card | What the scenario showed | Why | Fixable in the draft? |
| --- | --- | --- | --- |
| The Book of Exalted Deeds | the Angel's controller lost at -10 life after the Angel "gained" "You can't lose the game" | a static ability cannot be granted (`GRANTABLE` in `cards/index.mjs` is activated, triggered and keyword), and a rule given by an effect is not read: `playerRuled` (`rules/sba.mjs`) reads a permanent's own abilities | no: an engine gap |
| Fling | 0 damage | a spell's cast records no object its additional cost sacrificed, so "the sacrificed creature's power" has nothing to read; the draft's `remember` on the cost atom is a key nothing reads | no: an engine gap |

Both were written in good faith with constructs the drafter believed existed, so they count as late-found errors, apart
from the first pass; both are engine gaps, so neither has a draft that fixes it, and both were withdrawn rather than
stored. **28 cards are stored**: `data/engine/scripts/<prefix>/<oracle id>.json` and `data/engine/onboarding-ledger.json`,
each provisional, `readBack: "not run"`.

The scenarios are kept as `tests/fixtures/learned-scenarios.json`, and `tests/engine-learned.mjs` holds the stored
definitions to them. Writing them had its own error rate: seven runs on four cards failed on the scenario, not the
definition (Liliana's abilities named by index instead of their ids, twice; Felidar Retreat's modes, and Bladewing's
target, asked as the trigger goes on the stack rather than as it resolves (CR 603.3c, 603.3d), three times; "No"
answered for Bladewing's "may"; and Venser's Journal's upkeep trigger firing once before the scenario began). Then the
checks were themselves broken to see that they can fail: 20 deliberate breaks, 17 of the stored definitions (a wrong
amount, a lord pumping an opponent's creatures, a dropped intervening "if", a copy that is not an artifact or does not
leave, a Dragon filter dropped, a tap cost any creature pays, and so on) and three of the records and the fixture,
were caught 15 times on the first try. The five misses were scenarios that never offered the wrong choice (the
Warhound's negative case declined the search whether or not the condition held; Ureni, Cryptbreaker, Tegwyll and
Liliana had nothing but the right kind of card on hand). Each was rewritten so the wrong definition and the right one
play differently, and then all 20 breaks were caught; the 28 definitions still passed every rewritten scenario.

## What the checks miss (R5 and R11, in numbers)

The checks passed 40 of 50; 28 were right. Of the 12 they passed wrongly, 10 did so because the effect, trigger and
cost grammar is open: a key the checks do not know is not refused, as the selector grammar refuses one ("THE GRAMMAR IS
CLOSED", `script/filter.mjs`), so a draft that names a missing construct compiles to the same card without it. The
other two used forms that exist: Nykthos Paragon a trigger's `limit`, which limits the trigger and not the choice, and
The Book of Exalted Deeds a rule given by an effect, which nothing reads.

A drafter without the session's knowledge of the grammar, such as the card loader's model, would have stored all 40,
12 of them wrong: three in ten of the stored definitions would have played wrong, behind a "provisional" label. That is
R11's case exactly. Two changes would close most of it, both outside this step's files: closing the effect, trigger and
cost parameter grammar in `script/schema.mjs` (10 of the 12 become a named schema failure), and an ingest that checks
each card inside its own `try`, with a schema that refuses a non-list `then` or `otherwise` on any effect (the crash).

## The engine gaps, by construct (the catalog's next list)

Twenty-one of the 22 cards that are not stored wait on the engine; one waits on the ingest path. Grouped by the axis
each gap belongs to (the velocity document's Track B), then by construct, ranked by cards in the sample:

| Axis | Cards | Construct | Cards in the sample |
| --- | ---: | --- | --- |
| Triggers | 4 | a draw trigger's Nth card each turn | Emrakul's Messenger |
| | | leaving the battlefield without dying, once for one or more (CR 700.4, 603.10a) | Dour Port-Mage |
| | | this card put into a graveyard from anywhere | Ulamog, the Infinite Gyre |
| | | an arrival not made by this ability | Kodama of the East Tree |
| Choices and modes | 4 | pawprint modes, a mode chosen more than once (CR 700.2i, 700.2d) | Season of Gathering |
| | | a second choice among the same looked-at cards when the first is declined ("if you don't") | Planar Genesis |
| | | tapping chosen untapped permanents as an effect resolves, X their number (CR 701.26a) | Myr Battlesphere |
| | | "do this only once each turn" on the choice, not the trigger | Nykthos Paragon |
| Selectors and amounts | 4 | a target count that is X, "up to X targets" (catalog: TargetMax, partial; CR 115.1, 601.2c) | Crackle with Power |
| | | total toughness of creatures you control; half a life total rounded up (CR 107.1a) | Betor, Kin to All |
| | | a permanent without a counter of a kind (CR 122.1) | Wave Goodbye |
| | | a layer static's `affects` by keyword ("creatures you control with flying") | Favorable Winds |
| Memory | 3 | what a cost or an effect did, for a later effect: the creature sacrificed to cast it, what proliferate put counters on (catalog: remembering what an effect moved), the revealed card's mana value | Fling, Ripples of Potential, Calamity of the Titans |
| Statics and rules | 3 | a static ability granted to another permanent, read as a rule (CR 613.1f) | The Book of Exalted Deeds |
| | | goaded as long as an Aura is attached (CR 701.15a) | Shiny Impetus |
| | | the deck rule "a deck can have any number of cards named ..." (an exception to CR 903.5b; catalog: DeckLimit) | Rat Colony |
| Zones | 2 | a search or a choice over two zones at once (library and/or graveyard, hand and/or graveyard) | Finale of Devastation, Worldsoul's Rage |
| Costs | 2 | reveal a card from your hand as an additional cost (catalog: Reveal, named; CR 601.2b, 701.20a) | Calamity of the Titans |
| | | remove counters from among permanents you control (catalog: SubCounter, named; only from itself is built) | Iron Spider, Stark Upgrade |
| Ingest path | 1 | a modal double-faced card's back face in the session format and `assembleScript` (CR 712.8a) | Boggart Trawler // Boggart Bog |

(Calamity of the Titans needs two: the reveal cost and the memory of what was revealed.)

Read with the sample's size in mind: one card in 50 is about 26 of the 1,316, and the error on a share this small is
wide. What the sample does show is the shape. No single construct holds back more than two cards in 50; the gaps are
spread across every axis, nearly all of them forms of things the engine already has (a trigger, a modal, a selector, a
cost) missing one variable. That is the velocity document's Track B argument, now measured by the engine instead of by
Forge's names, and it is why the catalog's "every mechanic built" figure overstates what needs only a definition: these
21 cards were all counted as needing nothing.

## The measured rate

Times are this session's wall clock, October 6, 2026, UTC:

| Step | From | To | Time |
| --- | --- | --- | ---: |
| The rules of engagement, the plan, the population | 15:53:45 | 15:56:10 | 2 min 25 s |
| Grammar lookups and drafting, cards 1–10 | 15:56:10 | 16:00:30 | 4 min 20 s |
| Cards 11–20 | 16:00:30 | 16:01:55 | 1 min 25 s |
| Cards 21–34 | 16:01:55 | 16:04:03 | 2 min 8 s |
| Cards 35–50 | 16:04:03 | 16:05:44 | 1 min 41 s |
| First pass, triage, the readers of stored definitions, storing 30 | 16:05:44 | 16:10:36 | 4 min 52 s |
| The late check: 30 cards' scenarios written and run | 16:10:36 | 16:15:48 | 5 min 12 s |
| One-time work: the generators, the suite, 20 breaks, 149 suites, this record, the commit | 16:15:48 | 16:37 | about 21 min |

Drafting took 9 minutes 34 seconds for 50 cards, about 11 seconds a card on average; the first ten took three times as
long as the rest, because the grammar was being looked up. From the sample to a late-checked set took 19 minutes 38
seconds and produced 28 right definitions: **about 85 right definitions per session-hour**, or about 150 drafts per
session-hour taken all the way through the checks and the scenarios. With this session's one-time work counted (about
41 minutes from the sample to the commit), it is **about 41 per session-hour**. A later batch pays only the first
figure's costs: the tools, the suite and the fixture format now exist.

Against the old estimate: "50–100 cards a batch" assumed every drafted card is stored. A batch of 50 drafts stores
about 28 right definitions and names about 21 engine gaps; a batch of 100 drafts, about 56. At 56%, the 1,316 cards
hold about 740 that can be defined today, about 26 batches of 50 drafts or 13 of 100, and about 580 that wait on the
constructs above. The batch count happens to fall in the old estimate's range of 13–26; the yield does not: half the
"definition only" pool is definition work, and the other half is the engine's Track B list. A rate measured on 50 cards
carries a wide margin (56% is about 42% to 69% at 95% confidence), and a session's speed is not a person's: what the
figures compare is batches, not hours of anyone's time.

The rate also depends on the late check. Without it the stored set would have been 30 with two wrong (93% right); with
the drafter's own triage removed as well, 40 with 12 wrong (70% right). The late check cost 5 minutes for 30 cards here,
a quarter of the batch's time, and it is what turned a pass rate into a "plays right" rate.

## D5 in practice

D5 says a provisional definition seats only at a playtest table until a played game or Rob confirms it. Every reader
of stored learned definitions, today:

| Reader | What it does with them |
| --- | --- |
| `cloud/game-room.mjs`, `tableCards` | **Does not read them.** It is the basics and `tableDefinition` from `game/engine/cards/definitions.mjs`, which `game/tools/engine-definitions.mjs` builds from the hand-authored directory only (`loadCardScripts`). Playtest tables (`PLAYTEST_TABLES` "on") use the same `tableCards`. |
| `game/room/table.mjs`, `game/room/room.mjs` | Take whatever card source the table is given; they never read the folder. |
| `game/tools/engine-cards.mjs`, `loadCardIndex` | Reads them (`loadCompiledScripts`), a hand-authored definition winning by name. Used by the tools and the suites below. |
| `game/tools/engine-coverage.mjs`, `engine-catalog.mjs` | Counted them as "defined and playable today", the cards "a table could seat today". **Changed here:** both now count the hand-authored directory as defined and report the stored ones apart as provisional (28 of the most-played cards; 1 in Rob's seven decks, 8 in his library). |
| `game/tools/engine-compile.mjs`, `engine-ingest.mjs` | Write them and the ledger; read the ledger so a card already learned for the same text is not learned again. |
| `game/tools/batch/check-cards.mjs`, `held-alone.mjs` | Count them as defined and playable in the directory. |
| 145 other suites (`tests/engine-*.mjs`, `tests/game-room.mjs` and more) | Build the index with `loadCardIndex`, so a stored card resolves there; none depends on one today. |
| `tests/engine-learned.mjs` (new) | Holds each stored definition to its card, its scenarios, and no table. |
| `tools/data-inventory.mjs` | Lists each file. **Changed here:** names their writers and reader instead of "candidate for deletion". |

So D5's restriction holds today, and holds trivially: **a provisional definition seats at no table, playtest tables
included.** D5's permission does not exist yet: nothing seats one at a playtest table, so no played game can confirm
one, and no tool records Rob's confirmation (a `confirmed` status the ledger knows and nothing writes). What would
break D5:

- `engine-definitions.mjs` says the compiled definitions "join only once they are committed". They are committed now
  (28 of them); a change that does what that sentence says, adding `loadCompiledScripts` to the table's module, would
  seat them at every table, not only playtest ones. Seating them at playtest tables only needs a second module, or a
  filter on the table's `playtest` flag where the card source is chosen (`cloud/game-room.mjs`, `game/room/table.mjs`).
  `tests/engine-learned.mjs` fails the day `tableCards` returns one of them.
- `tests/engine-cards.mjs` required the table's module to hold every playable definition `loadCardIndex` reads, the
  stored ones included: with one stored it failed unless the table seated it, so the suite pushed toward breaking D5.
  **Changed here:** it requires the hand-authored ones, and `tests/engine-learned.mjs` requires none of the others.
- A tool counting them as defined, as coverage and the catalog did, tells Rob a table can play cards it cannot.

## Reproducing it

- The population and the sample: the three steps above at `main` a2063d95, then `createRng("x10-velocity-2026-10-06")`.
- The first pass: `node game/tools/engine-ingest.mjs data/engine/sessions/x10-pilot-2026-10-06.json --dry-run` crashes
  on Planar Genesis as described; without that card it prints 40 provisional, 3 blocked, 6 failed. (Run it before the
  28 are stored, or against a ledger without them: a stored card is skipped as "already learned".)
- The late check and D5: `node tests/engine-learned.mjs`.
- The counts: `node game/tools/engine-coverage.mjs`, `node game/tools/engine-catalog.mjs --check`.

## Since: Tegwyll confirmed (2026-10-08)

The record above is left as it was measured. One of the 28 stored definitions has since been confirmed: **Tegwyll,
Duke of Splendor**, the one in Rob's seven decks (D7 Maralen Exile Cast), which the table refused to seat ("The table
cannot play this card yet", `cloud/game-room.mjs` `tableCards`). Each of its abilities was checked against the engine and
needed nothing new: flying and deathtouch (CR 702.9b, 702.2b); "Other Faeries you control get +1/+1" as a layer 7c static
over any Faerie permanent (CR 109.2, 205.3m, 613.4c), a kindred one included, which has no power to raise (CR 208.3);
and "Whenever another Faerie you control dies" as a trigger on any Faerie put into a graveyard from the battlefield (CR
700.4), read as it last existed (CR 603.10a). The provisional draft was right; it is now hand-authored,
`game/engine/cards/t/tegwyll-duke-of-splendor.json`, with fifteen scenarios of its own (a changeling, a token, a kindred
enchantment, a wipe it dies in, Day of Black Sun taking its abilities first, control changed both ways, its owner's
commander going home, exile that is not dying, the legend rule), and the table seats it.

So that the provisional record does not linger behind the confirmed one, its stored record
(`data/engine/scripts/86/868f0a0a-ca9e-4baf-8295-6b228aa834e5.json`) and its entry in
`tests/fixtures/learned-scenarios.json` are withdrawn, and its ledger row says `confirmed`, naming the definition: the
first row with the status the ledger always knew and nothing wrote. `tests/engine-learned.mjs` now holds the two to each
other (a provisional row has its record; a confirmed one has none, a hand-authored definition of the card's current text
where the row says, and a seat at the table; no record stays behind a hand-authored card). **27 definitions remain
stored provisional**; in the coverage document, Rob's seven decks are 477 defined and none provisional, the library 7
provisional, the most-played cards 27.
