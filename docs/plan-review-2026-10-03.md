# The plan review (devil's advocate), 2026-10-03

The review `docs/prompt-plan-review-2026-10-03.md` asked for, of `docs/plan-remaining-2026-10-03.md` and
`docs/engine/velocity-2026-10-03.md`, against `docs/plan-to-done-2026-09-30.md` (Part 0 the contract, Part 7 the gates).
Written by the plan-review session of 2026-10-03 (Claude, a cloud container) on the branch `claude/plan-review-2026-10-03`,
from the handoff head 849845bf (#575, the tree `main` has once #571-#575 are merged). Nothing in the engine, the app or the
tests was changed; everything below was read, run or played here, and says how. The plan the execution session follows is
`docs/plan-execution-2026-10-03.md`.

## Read this first

**Four things in the engine are wrong today in ways any Commander player meets in a first game, and the plan has no step
for any of them.** Each was played here through the scenario runner against the engine at the handoff head (the probes are
in Part 6; the rules are cited by number from the Comprehensive Rules of September 25, 2026, fetched to a scratch folder
and not committed):

1. **A commander removed by an effect never comes back.** Swords to Plowshares leaves it in exile, Terminate leaves it in the
   graveyard, and its owner is never asked (CR 903.9a). Only a death by damage asks, and that one asks before the card
   moves, so nothing that watches for deaths sees a commander die (CR 903.9a has been a state-based action since 2020; the
   engine implements the replacement it used to be). `game/engine/script/effects/zones.mjs` `moveOne` never consults
   `offersCommandZone`; only `game/engine/rules/sba.mjs` does.
2. **Commander damage is never counted.** `game/engine/rules/combat.mjs` `combatDamage.deal` sends a player's damage through
   `changeLife`; `dealCommanderDamage` in `sba.mjs`, the only writer of the tally, is called by two test suites and by
   nothing in the game. Twenty-one from one commander never loses anybody the game (CR 903.10a), and the board's bars
   toward 21 can never fill.
3. **The commander tax is forgotten the first time the commander returns.** `commanderCasts` and the damage tally are keyed by
   the object id, and a zone change makes a new object (CR 400.7), so the second cast from the command zone costs the
   printed cost again (CR 903.8). `tests/engine-commander.mjs` proves the tax on one object id and never moves the card.
4. **The legend rule is not implemented** (CR 704.5j): two copies of a legendary permanent under one controller stay. Nor is
   the annihilation of +1/+1 and -1/-1 counters (CR 704.5q), which the Atraxa deck lives on.

A fifth is a rule the engine has right by the rules of 2023 and wrong by today's: **combat damage among several blockers must
be assigned lethal to the first in order** (`game/engine/controller.mjs` `validateCombatDamage` refuses 1 and 4 against two
2-toughness blockers). CR 510.1c has read "divided as its controller chooses" since the Foundations update of November 2024;
the damage assignment order is gone, and CR 509.2, which the comment in `rules/combat.mjs` cites for it, is now the
priority rule.

None of these is a leak of hidden information; no leak was found (Part 2, 2.10). None is an exception: G1's harness
("1,400 games, zero engine exceptions, the same hash on replay, no hidden card") would pass with all five in place, which
is the review's central point about the plan: **its gates measure crashes, replay and leaks, and never correctness**.

**The plan's order starves itself of feedback.** The 1,011 definitions the engine holds reach no table: `cloud/game-room.mjs`
hands the room `basicCards` (M5 is step E6, after the seven decks' mechanics and G1). Until E6, nobody can play a card at
staging, Rob included, and every rules error above waits for Grok Bot to find it in G-D. Part 3 proposes the inverse: fix the
commander layer, serve the definitions, and make one deck wholly playable (D5 Shadrix Aristocrats is 12 mechanics away),
so that each batch is played the week it lands.

**The estimates are the wrong shape, not the wrong size.** Definitions are not the bottleneck: the directory went from 0 to
1,011 cards in three days (467 on October 1, 853 on October 2, 999 on October 3, read from `main`'s history), about 340 a
day, while "about nine a batch" is the batch size, not the rate. What is slow is the long tail of mechanics, and the plan's
E4 (8-14 sessions) is the only number that matters; everything else in Track E is days.

## Part 1 -- The standing, verified

Each claim in `docs/ACTIVE.md` and `docs/plan-remaining-2026-10-03.md` was checked rather than trusted.

| Claim | Verified | How |
| --- | --- | --- |
| #571-#575 open, unmerged, in that order; main eb149397 | Yes | GitHub's pull request list at 15:15 UTC: all five open; #573 and #575 on `main`, #574 on `claude/cards-batch-79`, #572 and #571 on `main`; `main` eb149397c2 |
| GitHub Actions refuses jobs on billing | Yes | The Tests workflow's runs 2102-2104 (the three heads of #573-#575) concluded `failure` four to five seconds after they were created, with no job log; the same on `main` at 08:20 UTC |
| Coverage at #574: 992 defined, 2,267 (70.0%) of 3,238; the seven decks 157 and 358 (75.1%); the library 440 and 1,565 (66.2%) | Yes | `node game/tools/engine-coverage.mjs` here prints the same table |
| 1,011 definitions, 1,463 scenarios | Yes | counted on disk; 640 cards carry one scenario, 298 two, 67 three, 6 more; 2.29 checks a scenario; 219 scenarios check nothing but a zone or control listing |
| The engine suites green | Yes | all 117 `tests/engine-*.mjs` pass here (Node 22.22.0) |
| The whole gate | See Part 5 | `tools/local-ci.sh HEAD 1` run here on 849845bf: the workflow's toolchain (Node 22, Playwright 1.56.0 with Chromium, openpyxl) on a clean worktree merged with `main` |
| Staging and production versions | Yes | the Cloudflare API, read-only: `crankmagic` (production) last deployed 2026-10-01 19:59 UTC, version 2fc36d3b (its tenth); `crankmagic-staging` last deployed 2026-10-03 04:57 UTC, version 99f23f29 (its 118th); nothing since, as ACTIVE.md says |
| The cloud table plays no card definitions (M5) | Yes | `cloud/game-room.mjs` line 41: `cards = basicCards`; `cloud/play-worker.mjs` passes nothing else |
| The room plays the definitions when handed them | Yes | 12 seeded four-seat games in `game/room/room.mjs` with four house pilots, each seat a random commander and 62 random defined cards plus basics (Part 6, probe R): see the table there |
| The board at real sizes | Yes | `node tools/board-fixture.mjs` here at 1280x720 and 1920x1080, a real four-seat table to turn 9: eight shots, the hand whole in all of them (Part 4) |
| Rob's seven decks, per deck | New | Part 6, probe D: D5 is the closest to playable (12 cards need a mechanic, 25 a definition); D1 the farthest (30 and 28) |

What this container cannot prove, as AGENTS.md says: anything touching Forge or the JDK, a real table at crankmagic.com (production
answers; staging is behind Access), a phone, Firefox, or a Workers Build.

## Part 2 -- Where the engine would not seem correct to an experienced player (question 2)

Ranked by how soon a player meets it and what it costs the game. "Expects" cites the Comprehensive Rules by number
(September 25, 2026); "does" names the file and the probe (Part 6) that showed it. Every probe is a scenario through
`game/engine/cards/scenario.mjs` at the handoff head, run with `node --stack-size=4000`.

### 2.1 The commander rules (CR 903) -- wrong in four ways, all met in a first game

| # | What a player expects | What the engine does | Evidence | Severity |
| --- | --- | --- | --- | --- |
| a | A commander put into exile or a graveyard by any effect may be moved to the command zone by its owner the next time state-based actions are checked (CR 903.9a); one that would go to a hand or a library may be put there instead (CR 903.9b) | Only the death path in `rules/sba.mjs` asks. `effects/zones.mjs` `moveOne` (every exile, destroy, bounce, mill of a commander) never does: the commander stays where the effect put it, for the rest of the game | P1: Swords to Plowshares, "question pending: none; Boss is in exile". P2: Terminate, "Boss is in graveyard(seat 0)" | **Severe.** Swords, Path, Terminate, Beast Within and Cyclonic Rift are the removal every deck runs |
| b | A commander that dies, dies: "whenever a creature dies" sees it, its own "when this dies" fires, and then the owner may move it (CR 903.9a is a state-based action, a replacement no longer) | The owner is asked before the move ("asked BEFORE the move, like any replacement", `rules/sba.mjs`), so the card never reaches the graveyard and no death is seen | P3b: Zulaport Cutthroat on the battlefield, the commander bolted, the owner says "command zone": the opponent stays at 29, not 28 | Medium: every aristocrats deck (D5) |
| c | The second cast from the command zone costs {2} more, the third {4} (CR 903.8) | The tally is keyed by the object id, and the card is a new object after each zone change (CR 400.7): `commanderCasts` reads `{"45":1,"57":1}` after one return and the tax is 0 | P4: with one Mountain untapped the {R} commander is offered again | **Severe.** Every game, from the second cast |
| d | 21 combat damage from the same commander over the game loses it (CR 903.10a) | Never counted: `rules/combat.mjs` `combatDamage.deal` calls `changeLife`; `dealCommanderDamage`, the one writer of `commanderDamage`, is reached only from `tests/engine-sba.mjs` and `tests/engine-life-lost-infect.mjs` | P5: 11 then 11 from the same commander, "commander damage tally {}; seat 1 lost? false" | **Severe.** Voltron decks cannot win; the board's bars toward 21 can never move |
| e | Two commanders only when both have partner, or one has a background and the other says so (CR 702.124, 702.153); refused with instructions otherwise (AGENTS.md) | `game/room/table.mjs` `readDeck` accepts any two legendary creatures | read, lines 70-84 | Low-medium: a legality gap at Change deck |

The suites that cover this (`tests/engine-commander.mjs`, `tests/engine-sba.mjs`) are unit tests of the kernel functions with
one object id and no zone change, which is how all four survived 80 batches: each function is right and nothing in the
game reaches it the right way. The fix is one PR (Part 3, A1): a commander identity that survives zone changes (the owner
and the card, as CR 903 means it), the tax and the tally keyed by it, the tally written from combat, 903.9a asked after the
move as a state-based action from every path, and 903.9b as a replacement for hand and library.

### 2.2 State-based actions the engine does not perform

| What a player expects | What the engine does | Evidence | Severity |
| --- | --- | --- | --- |
| The legend rule: two legendary permanents with the same name under one controller, the controller keeps one (CR 704.5j) | Nothing; `rules/sba.mjs` names it as deferred in its header. Copies (`copyPermanent`, `becomeCopy`, 64 and 29 of the most-played cards) and a second commander-like body stay | P6: two legendary creatures on one battlefield, "question pending: none" | Medium-high for every deck with a clone or a token copy of a legend |
| +1/+1 and -1/-1 counters on one permanent annihilate (CR 704.5q) | Nothing (`grep 704.5q game/engine` finds no code) | read | Low-medium: D3 Atraxa (proliferate, infect) is built on counters |
| Planeswalker loyalty and damage to planeswalkers (CR 704.5i, 306) | Not built, named in the catalog; no planeswalker is defined, so a deck with one is refused by name | catalog | Low today, by design |

### 2.3 A rule the engine has right by the old book: combat damage among several blockers

CR 510.1c: a creature blocked by two or more creatures assigns its combat damage "divided as its controller chooses". The
damage assignment order (lethal to the first blocker before any to the second) left the rules with the Foundations update of
November 2024, and the CR 509.2 the engine cites for it is now the rule that the active player receives priority.
`game/engine/controller.mjs` `validateCombatDamage` still enforces the old order (`overrideOrder: false` in
`rules/combat.mjs`): P7 refuses 1 and 4 against two 2-toughness blockers ("Assign lethal damage to the required blockers
before assigning damage onward") and accepts 3 and 2. The house pilot assigns the same way. A player who wants to spread
damage is told it is illegal. Trample's own rule (lethal to every blocker before the excess, CR 702.19b) is right and stays.
Medium: every multi-block.

### 2.4 Decisions the rules leave to a player that the code makes (AGENTS.md: "Decisions inside the game belong to the players")

| Where | The rule | What the code does | Evidence | Severity |
| --- | --- | --- | --- | --- |
| Several damage replacement effects apply at once (a doubler and Torbran's "plus 2") | The affected player chooses the order (CR 616.1) | `rules/replacement.mjs` `applyReplacements` applies "the order that leaves the least damage" and says so ("Asking them is deferred") | read, `leastFirst` | Low-medium: rare boards; wrong when the affected player wanted the damage (Vigor's counters, a death they were after) |
| Paying an "unless" cost or an attack tax without priority (Rhystic Study's {1}, Propaganda's {2}, Mana Leak's {3}) | Which mana pays is the player's (AGENTS.md; CR 601.2g for a cost paid as a spell is cast) | `rules/mana.mjs` `payGeneric` empties the pool in a fixed color order, then taps the first untapped plain sources it finds | read | Medium: Rhystic Study and Propaganda are in most games, and which land is tapped decides what can still be cast |
| "Each player sacrifices a creature" (Fleshbag Marauder, Grave Pact's chains) | Choices in APNAP order, then the sacrifices at the same time (CR 101.4) | Each player's sacrifice happens as they answer, before the next is asked | P8b: seat 0's Bear is already in the graveyard while seat 1 is still choosing | Low-medium: changes what "whenever one or more" sees and what a lord was still pumping |
| Several replacement effects as a permanent enters | The affected controller orders them (CR 616.1) | The first found is applied, on the argument that the result is the same | read, `applyReplacements` | Low: the argument holds for tapped and counters; a Clone's "enter as a copy of" is an ask, which keeps it right |

What the engine gets right here, and the board should keep: which mana pays a spell is never chosen for the player
(`automaticPayment` returns null when two payments are legal); a player with two triggers orders them (P9b: seat 1 asked to
order two Blood Artist triggers); the active player's triggers go on the stack first and resolve last (P9b, CR 603.3b); a
trigger's targets are chosen as it goes on the stack (CR 603.3d); a commander's return is asked of its owner; "you may"
is asked; the London mulligan with the free first mulligan in a multiplayer game (CR 103.5c); scry and surveil ask; the
draw step draws before anyone has priority and, with the table's beat, on the player's click.

### 2.5 Priority automation: does it ever pass a moment a player would have acted?

Read, not found. `game/room/room.mjs` passes for a person only when `nothingToDo` holds: priority is theirs, the stack is
empty, and no spell in hand or in the command zone could be cast with the mana they could make now (mana abilities are not
"something to do" by themselves; an activated ability is). With anything on the stack the person is always asked. "Skip to
end" (`crankmagic-board.js` `skip()`) sends a pass only while the turn is the one skipped, the stack is empty and the only
question is priority; it stops itself otherwise. The one thing an experienced player will notice is not a skipped moment but
a kept one: a player holding an instant with mana open is asked at every step of every opponent's turn, with nothing to
say that this is why. A "hold priority / yield for this turn" control (the r3 Tools wireframe names one) is the usual answer.

### 2.6 Simultaneity

A board wipe decides what dies before anything moves (`destroyAll`), combat damage is computed from the board and then dealt
(`combatDamage.deal`), and `damageAll` selects first; one action's deaths are read as one moment by every look-back trigger
(`collectTriggers`). Living Death's returns and a mass bounce move one card at a time through the replacement effects,
which is right in effect for enters-tapped and counters and would differ only for an effect that watches the arrivals of
the others. The sequential sacrifice above (2.4) is the one real gap found.

### 2.7 Last known information, layers, copies

`rules/layers.mjs` derives current values from printed ones, orders a layer by timestamp with CR 613.8 dependency, runs
layer 7's sublayers in order with counters at 7d, and `lastKnown` runs the layers before a thing leaves (a 2/2 with two
counters under an anthem dies as a 5/5). Copy effects are implemented as effects that rewrite the object's copiable
values rather than as layer 1, which gives the same answer except where a copy effect and a later layer-1 effect would
interact; none of the defined cards do. Nothing wrong was found by reading; no probe was run.

### 2.8 Hidden information

No leak found. The room sends a seat its own projection and only that seat its decision (`room.mjs` `view`); the history
is public lines; a looked-at library top is shown to the looker alone (`projection.mjs` `looks`); an offer's detail names
only battlefield, stack and players, and a discard's own hand; `tests/engine-projection.mjs` plays random games looking for
any hidden card's name in any seat's view and passes here. The one place hidden cards leave the engine is the full record
of a playtest table (M8b), by design and on staging only.

### 2.9 The house pilot

It sees only its seat and is deterministic (`tests/engine-house-pilot.mjs` holds both), which is what G1 needs. As an
opponent it is weak in ways a player notices in a game: it never casts a spell whose every legal target is its own things
unless the effect is friendly, it blocks only when the block is free or the attack is lethal, it attacks the lowest life
total, it answers every trigger-order, replacement-order and "may" question with the first option, it assigns combat damage
lethal-first, and it keeps any hand with two to five lands. It plays 1,011 real cards without an exception (Part 6, probe
R), which is the point for G-D's AI seats; the LLM pilot (AI-2) is what makes "AI players" mean what Rob means.

### 2.10 The 70.0% "every mechanic built" figure, and what it does not measure

The figure counts a card as having every rule when every Forge construct its script names maps to something the engine
marks built (`game/tools/engine-constructs.mjs`). Four blind spots, each confirmed:

1. **Costs are not measured at all.** The inventory records effects, triggers, statics, replacements, keywords, options and
   counts, never cost atoms; the catalog itself lists `tapXType` (22 most-played cards), `ExileFromHand` (9), `PayEnergy`
   (4) as named or missing. Shimmer Dragon ("Tap two untapped artifacts you control: draw a card") counts as every rule
   built; its definition would be blocked.
2. **A keyword given as a parameter is invisible.** MacCready, Lamplight Mayor gives skulk, which the catalog has as missing
   (CR 702.118); its script is `Pump`, which is built, so the card counts.
3. **"Partial" counts as built.** Continuous (521 most-played cards), DelayedTrigger, ReduceCost, DamageDone and Moved are
   partial in the catalog and whole in the coverage.
4. **Only options Forge names are counted** (RememberChanged, TargetMin...), so an unnamed form of a built effect ("an order
   the player chooses mid-effect", "exiled with this", "up to N targets" before TargetMin was named) is counted as built
   until a batch finds it.

In a seeded sample of 14 of the 1,275 "definition only" cards (Part 6, probe S), 2 would be blocked at definition time.
The honest number is "about 60% of the most-played cards need nothing the engine lacks", and the plan's E1 (a
parameter-level inventory) is the right first step; Part 3, A5 says how to measure it by the smoke test instead of by
Forge's names.

**The proof behind "defined and playable" is thin.** 640 of 1,011 cards have one scenario; a scenario makes 2.29 checks on
average; 219 scenarios check nothing but which zone a card is in. Living Death's two scenarios never put a trigger on
either side of it. A card can be "defined" with its core effect right and its timing, targets, or costs wrong, and nothing
in the gate says so. That is the risk the velocity proposal's templated scenarios would deepen (Part 3, R5).

### 2.11 Performance at a real table

Twelve four-seat house-pilot games in the room (probe R) took 1.5 to 7.4 seconds each, except seeds 5 and 6: 117 and 86
seconds (62 and 41 turns). `docs/engine/PLAN.md` §5 budgets a full four-player game at under 3 seconds and names
`tests/engine-perf.mjs`, which does not exist. A Durable Object has a CPU limit per request (the plan's M5 names Workers Paid
at 10 ms), and a room that drives four house pilots through a 60-turn game inside one `start()` call is the shape that
hits it. Worth a measurement before G-D, not a rewrite: the slow games are the ones with many permanents, which points at
`characteristicsOf` being derived afresh for every object on every question (the layers run every time anything asks).

## Part 3 -- What could go wrong with the plan as written (question 1)

Ranked by likelihood times what it costs Rob. "Certain" means it is already true at the handoff head.

| # | Risk | Likelihood | Cost to Rob | Where it bites |
| --- | --- | --- | --- | --- |
| R1 | **The gates never test correctness.** G1 (zero exceptions, identical replays, no leaks) and G-B's suites pass with every wrong rule in Part 2 in place. The first person to meet them is Grok Bot in G-D or an invitee in G-E, each finding a PR, a gate run and a staging release: the plan's own "between the gates" loop at a day a finding | Certain | Weeks between G-C and G-F; a first impression of a rules engine that forgets the commander tax | G-D, G-E |
| R2 | **M5 (definitions served to the table) is last in Track E.** Until E6 nobody plays a card at staging; Rob's own feedback, the thing that found every board defect of September 30 in an afternoon, is off for the whole engine track; every batch is proven only by its scenarios (thin, 2.10) | Certain | Each week of Track E without a played game is a week of latent defects; the velocity work (E2) stores provisional definitions nobody plays | E1-E5 |
| R3 | **The order is horizontal, not vertical.** All seven decks' mechanics, then G1, then the table: the first whole deck of Rob's plays at the end of the track. D5 is 12 mechanics and 25 definitions from whole today; D7 13 and 36; D6 15 and 31 (Part 6, probe D) | Certain | The first "I played my deck" moment moves from days away to the end of E4 | Track E |
| R4 | **The estimates are the wrong shape.** "Estimates are sessions, not measured." Measured: 0 to 1,011 definitions in three days (about 340 a day); E2-E3 (bulk definitions, 3-5 sessions) are days, not the long pole. E4 (the seven decks' mechanics, 8-14 sessions) is the pole, and its constructs are the ones every batch so far skipped as "a wide, many-form construct, its own project" (RememberObjects, MayPlay, TargetMin/Max, ETBReplacement, planeswalkers): 8-14 could be 20 | High | The road to G1 is paced by E4 alone; the plan's 25-40 sessions could be 15 or 50 depending on E4 | E4 |
| R5 | **The velocity proposal deepens the thin-proof problem.** Track A trusts a drafted definition on schema, fidelity, a smoke game, templated scenarios and a second derivation. Fidelity is a string match (the ability's text is in the card's text), the smoke game proves it does not throw, a templated scenario proves an "enters trigger" fires and not what it does. None of them would have caught any of Part 2's five. Provisional definitions then play at tables (decision 6, "casual play seats compiled cards behind a label") | High | A faster way to be wrong at scale; the trust Rob needs from Grok Bot's UAT is spent on definition errors | E2, E3 |
| R6 | **Track B (axes built once) changes how existing cards behave,** held only by scenarios that check 2.29 things each. Batches 79 and 80 already corrected three cards that "faked" a random order; an axis refactor over 1,011 definitions finds more of those, silently | Medium-high | Regressions that the gate cannot see; found at tables | E4 |
| R7 | **Everything serializes on Rob.** Merges (the permission check refuses `gh pr merge`), releases (Workers Builds terminated since 05:19 UTC on October 3; the cloud container cannot deploy, its asset upload is refused with a 401), GitHub Actions (billing), the AI door's five steps, R2, the Firefox runtime, two phones, and nine decisions. Each round trip is a day of latency for the executor, which then idles or works ahead on an unmerged stack (as #571-#575 did) | Certain | Days per gate; stacks that merge in a train and get gated as one tree | Track 0, every gate |
| R8 | **The gate is one machine.** With Actions out, the only proof is `tools/local-ci.sh` on Personal-HP: 33 minutes a run, twice per PR, 272 suites run one after another, the browser suites racing under load (the Skip to end race of #571 was load). The cloud container can run it too (Part 5: it did here) but cannot merge or deploy | Certain | 45-66 minutes of Rob's machine per merge; flaky browser checks under two runs at once | every PR |
| R9 | **The first sentence's scope is the whole program.** G-A requires AI-1 through AI-6, M3, M2's data track, W1 and the A11y pass before Grok Bot plays a game. The AI items wait on the door (Rob), the eval rubric (an afternoon of Rob's), the 200-card sample (Rob's key), R2 (Rob). The sentence cannot be said for weeks for reasons that have nothing to do with whether a game can be played | Certain | G-C slips behind the AI program; the engine's correctness waits behind it | Part 7 |
| R10 | **The AI door's code is a step behind the plan.** `cloud/ai.mjs` defaults to `claude-opus-5` and its price table lacks Claude Sonnet 5.5 and Opus 5.5 (an unknown model is priced at the dearest rate, so the meter reads high, which is the safe direction); the per-feature models of AI-1 to AI-4 are not yet variables. Small, but it gates the first AI PR | Certain | A day | AI-* |
| R11 | **Provisional definitions executing as rules.** The extraction design's own bar (`docs/plan-card-extraction-skill.md`: for the engine, G1-G4, "nothing unverified may execute") is lowered by the velocity plan to "provisional, playable and marked". A learned Cyclonic Rift that bounces the wrong things is a rules error in a real game, with the label as the only defense | Medium | Trust; findings in G-D that are definition errors, not engine errors | E2, AI-3 |
| R12 | **The board is right by its suite and wrong at one size.** At 1280x720 in Table view the pile captions run into each other ("Command Exile 0", "Library 9Grave..."), below the 10px legibility floor AGENTS.md sets (Part 4). Everything else of Rob's September 30 list is built and photographs as the wireframes draw it | Certain | One PR; but it is the first thing a 1280-wide laptop shows | G-B |
| R13 | **Paying mana is manual.** A spell is cast by tapping each land, then the card; "castable now" counts the pool, not the lands (the fixture's hand reads "Creature 0/3" with three untapped lands). Arena and MTGO auto-pay; an experienced player clicks a card and expects it to be cast when the payment is unambiguous, which `automaticPayment` already decides | Certain | Every spell, every turn; the first thing an invitee says | G-E |
| R14 | **The performance budget is unmeasured.** Two of twelve house-pilot games took 86 and 117 seconds in Node (2.11); the Durable Object's CPU budget is smaller than Node's patience. No `tests/engine-perf.mjs` exists | Medium | A table that stalls or a Worker that is killed mid-game, found by Grok Bot | G-D |
| R15 | **The data track (M2) and R2 are on no critical path and could absorb sessions.** Live-first reads, a refresh Worker, `current.json`: a good design that moves nothing toward a played game | Low | Scope before G-C | Track O |
| R16 | **The phone and Firefox cells of the browser matrix are Rob's to run** and have no date; G-B lists them as its proof | Medium | G-B waits on a weekend | G-B |
| R17 | **The two first-look disagreements with wireframe r3** (Restore a backup vs Import; the phone's action bar) are an open decision on every release-acceptance run ("27 of 29") | Certain | Noise on every walk until decided | G-C |

The counter-argument the plan deserves: its shape is sound where it is cheap to be sound. The gates it has (exceptions,
replay, leaks, the browser walks, the release acceptance) are real and have caught real things, the clean-room rule is
kept, every PR carries its proof, and the Track 0 list is honest about what only Rob can do. What it lacks is a
correctness gate for the rules and a feedback loop short enough for Rob to be in it, and both are cheaper than the plan's
own E5.

## Part 4 -- The alternatives (question 3)

For each significant risk: the approach, its cost, its risk, and what it proves. "Needs Rob to change a rule" is said
where it does. The clean-room rule (ADR-001), US English and AGENTS.md hold throughout.

### A1. Fix the commander layer first (R1, Part 2.1)

One PR, about a session, before any new batch. A commander identity that survives zone changes (CR 903.3 says the
designation is an attribute of the card, not the object: carry `commanderOf: {owner, card}` across `moveObject` the way
`commander: true` already is), the tax and the damage tally keyed by it, the tally written from `combatDamage.deal`,
CR 903.9a asked of the owner after the card reaches a graveyard or exile from any path (as a state-based action, so "dies"
triggers fire first), CR 903.9b as a replacement for a hand or a library, and partner and background checked at
`readDeck` with a refusal that says what to do. Proof: Part 6's probes P1-P5 as scenarios in `tests/engine-commander.mjs`,
a break per guard, the gate. Cost: a session. Risk: the 903.9a change moves a commander's death into every
"whenever a creature dies" trigger, which is the rule; the scenarios that assumed otherwise (if any) change with it. No
rule of Rob's changes.

### A2. Serve the definitions to the table now (R2): M5 before E1

`cloud/game-room.mjs` takes `cards`; hand it the directory. The 1,011 definitions are 1.4 MB of JSON before compression
(8.4 MB with their scenarios, which the Worker does not need), inside a Worker's bundle budget once compressed, and
`tools/release-pages.mjs` `workerModules` already ships the engine's modules for wrangler to bundle: add the definitions
as one generated module, or put them in KV and read them at the table's first deck. Change deck then shows "87 of 100
known, 13 to learn" per deck (AI-5's readiness line, without the AI), and a deck seats when it is whole. Cost: one to two
sessions. Risk: the bundle grows with every batch (a KV store removes that); the table refuses the same decks it refuses
today until a deck is whole. Proves: `tests/uat/play-e2e.mjs` with a defined deck at a playtest table, and from then on
every batch is playable at staging the day it merges.

### A3. One deck whole, then the next (R3): the vertical slice

D5 Shadrix Aristocrats needs 12 mechanics (TargetMin/TargetMax "up to N" on 4 cards, CheckSVar 3, Escape 2, SVarCompare 2,
Encore, CantAttack, ThisTurnEntered) and 25 definitions; D7 Maralen 13 and 36; D6 Krenko 15 and 31 (Part 6, probe D).
Build D5's mechanics as the next batches, define its 25, play it at staging with three house pilots, and Rob plays it that
week. Then D7, D6, D4, D3, D2, D1, in the order of fewest missing mechanics. Each deck is a milestone with a played game as
its proof. Cost: the same mechanics as E4, in a different order; "up to N targets" first serves 24 cards across the seven.
Risk: the most-played list waits behind the seven decks (it does in the plan too). Proves: a real deck at a real table,
G-B's "play-journeys on the real decks" one deck at a time instead of all at once at the end.

### A4. A correctness gate beside G1 (R1, R5)

Keep E5's harness (1,400 games, zero exceptions, identical replays, no leaks: it costs little, Part 6's probe R shows the
room already does it) and add what it cannot measure: a rules-conformance suite, `tests/engine-rules-conformance.mjs`,
of situations an experienced player would check, each citing its rule by number: the five of Part 2, APNAP with two
players' triggers, a board wipe with an indestructible lord, a commander bounced by Cyclonic Rift, "each player
sacrifices", a doubler and a prevention on one hit, the legend rule with a Clone, trample over deathtouch, lifelink and
"whenever you gain life", a flashback spell countered, ward paid and not paid, an opponent's end-step instant, a London
mulligan with the free first in four seats. Forty cases, hand-written from the Comprehensive Rules (never from Forge), about
two sessions. Then invariants as properties over the harness's games: life totals move only through logged events, no
object in two zones, no token off the battlefield, every trigger on the stack has a controller still in the game, the
tally of commander damage equals the combat damage its commander dealt. Differential testing against Forge (PLAN §3.4's
`engine-diff.mjs`) is the strongest oracle for card behavior and runs only on Personal-HP; worth a bounded run on D5 once
A2 lands, adjudicating each divergence against the CR as the plan says. Needs no rule of Rob's to change; it needs
"zero exceptions" in G1's wording to become "zero exceptions and the conformance suite green".

### A5. The velocity proposal, measured by the smoke test, and proof kept whole (R4, R5, R6)

Agree with "measure first" and change the ruler. The parameter-level inventory (E1) still measures by Forge's names and
would keep the blind spots of 2.10. Measure instead by the engine: run the drafter over the 1,275 as a dry run (no
storing), and let the schema, fidelity and smoke checks say which cards pass and which construct each failure names.
The failures, grouped, are the true "what to build next" list, and the pass rate is the measured rate the plan wants
before scaling. Then:

- Keep hand-written scenarios for every card that is a commander, a wincon, or has a trigger or an activated ability;
  templated scenarios only for vanilla and keyword-only cards (1,814 and 407 of the pool in PLAN §2.3's count), which
  is where they are honest.
- A provisional definition is seated only at a playtest table until a played game or Rob confirms it (decision 6's label
  is not enough once the engine executes the script; the extraction design said so). **This narrows decision 6; Rob's
  call.**
- Build the axes (Track B) one at a time, each with its own suite and breaks as the batches have done, and run the
  conformance suite (A4) on every axis change, not only the scenarios.

Cost: the measurement is a session; the rest is the plan's own work with its proof kept. Risk: fewer definitions a day
than 50-100; the measured rate decides. Proves: a pass rate that means "plays right", not "parses".

### A6. Free, fast CI: a self-hosted runner, and a parallel suite (R7, R8)

Register Personal-HP as a self-hosted GitHub Actions runner for this private repository: self-hosted minutes are not
billed, the Tests workflow runs unchanged (`runs-on: self-hosted`), Playwright and Chromium are already on the machine so
the 5-minute install is gone, and every PR gets its green check back without the local gate's paste. Rob's step: one
registration in the repository's settings; the machine must be on. Then make `runtests.sh` run suites in parallel (the
machine has 22 cores; a worker pool of 8 with the browser suites serialized) and measure: the 33-minute run is likely under
10, and the local gate becomes a quick check again. Alternative: pay for Actions (about 22 minutes a run at list price,
roughly $0.18; 100 runs a month is under $20): simpler, still slower. Needs Rob: either the runner or the billing; the
"run twice" rule of AGENTS.md can drop to once when the runner is a fixed machine, which is Rob's rule to change.

### A7. Releases from one script on Personal-HP (R7)

Workers Builds has terminated every release build since 05:19 UTC on October 3, and the cloud container cannot upload
assets (401 under the proxy's token). The documented fallback (`git archive origin/release/pages`, `wrangler deploy`,
`release-acceptance.mjs` live) is the reliable path today: make it `tools/deploy.sh <profile>` on Personal-HP, turn the two
Workers' builds and previews off so the queue cannot terminate anything, and keep `release/*` as the record it already is.
Cost: half a session. Risk: a deploy needs Rob's machine, which it needs now anyway. Alternative: a scoped Cloudflare
token for the cloud session with Workers Scripts write, which lets the session deploy staging itself (never production
without Rob's go, as now); a security tradeoff that is Rob's.

### A8. Narrow the first sentence to a played game (R9)

Part 7's first sentence promises "the app has been tested end to end ... ready for Grok Bot ... including full game play".
A game needs the engine, the table and the board; it does not need the deck advisor, the card loader for Rob's library, the
LLM pilot or the settings panel. Split G-A: **G-A1** (the engine's correctness gate, M5, the seven decks, B-series, the
A11y pass, the harness note, AI-1 the Coach behind the door) is what the first sentence rests on; **G-A2** (AI-2 to AI-6,
M3, M2, W1) lands between G-D and G-F, where the plan already expects findings to be fixed. The AI door's five steps stay
Rob's and gate AI-1. **This changes Part 7's wording, which is Rob's**; recommended, because every item in G-A2 waits on
something only Rob can do and none of them changes whether a game plays.

### A9. The board: pay automatically when there is nothing to choose (R13), and the captions (R12)

A card in hand is cast on a click when `automaticPayment` returns the one legal payment: the room taps those sources and
casts, in one action; when two payments are legal, the board asks which, as the AGENTS.md rule allows ("an automatic answer
is only correct where the rules leave no choice"). "Castable now" then counts untapped sources, not the pool, and the hand's
type counts (item 14) read as Rob meant them. Fix the 1280x720 pile captions in Table view by shortening them to the
count with the zone named in the caption's title, or by hiding the caption below a width the suite checks. A "hold
priority for this turn" switch (the Tools wireframe's "Hold priority / Yield") answers 2.5. Cost: one session for the
three. Proves: `tests/table-board.mjs` gains the one-click cast, the captions' legibility at 1280, and the yield.

### A10. Measure the room's cost before G-D (R14)

A `tests/engine-perf.mjs` that plays the harness's games and asserts PLAN §5's budgets, skipping itself unless
`ENGINE_PERF_REQUIRED=1`, and a profile of the slow seeds (probe R: seeds 5 and 6). The likely cause is
`characteristicsOf` derived afresh for every object on every question; a per-action cache keyed by the state's hash is
the usual fix and changes no rule. Cost: a session once the number is known. Proves: a game inside a Durable Object's
budget before Grok Bot sits down.

### A11. Stop doing

- Running the whole gate twice on Personal-HP per PR once A6 lands.
- Counting coverage by Forge's names (keep the inventory for the catalog; publish the smoke-test number as "playable").
- Opening the next batch before the commander layer is right (every definition of a legendary creature is proven against
  wrong commander rules).
- Treating M2 and R2 as pre-G-C work.

### Where an alternative needs Rob to change one of his rules

| Alternative | The rule | What changes |
| --- | --- | --- |
| A4 | Part 7's G1 wording ("zero engine exceptions") | adds "and the conformance suite green" |
| A5 | Decision 6 (casual play seats compiled cards behind a label) | a provisional definition seats only at a playtest table until confirmed |
| A6 | AGENTS.md "run twice" for the local gate | once, on a fixed self-hosted runner |
| A8 | Part 7's first sentence and G-A's list | G-A split into G-A1 (a played game) and G-A2 (the rest of the AI program and operations) |
| A9 | none; AGENTS.md already allows an automatic answer where the rules leave no choice | -- |

## Part 5 -- The build and release process

**The gate.** `tools/local-ci.sh` is the Tests workflow on a machine: a clean worktree of the exact head merged with `main`,
the toolchain checked (Node 22, Playwright 1.56.0 with its Chromium, openpyxl), `runtests.sh -q` under
`GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1` and `node --test game/tests`, and a scan of what the commit adds for secrets
and personal addresses. Run here once on the handoff head:

```
local-ci: PASS
  commit    849845bf576503c71087fdbe0f12696f8b631ab0
  tested    the commit itself (main eb149397 is its ancestor), from a clean checkout
  toolchain Node v22.22.0, Playwright 1.56.0 + Chromium, openpyxl 3.1.5
  runs      1 x (runtests.sh -q: 272 suites passed; node --test game/tests), GEOMETRY_REQUIRED=1 PAGE_BUDGET_REQUIRED=1
  scan      no secrets or personal addresses added on top of main
  time      988s
```

So a cloud container can run the whole gate (16 minutes on four cores; Personal-HP's 22 cores took 2,738 seconds for two
runs because `runtests.sh` runs the 272 suites one after another). What a container cannot do is merge (the permission
check), deploy (wrangler's asset upload is refused under the proxy's token), or prove a phone, Firefox or Forge.

**GitHub Actions.** The repository is private on the free plan; the month's minutes are spent and every job is refused
within seconds (runs 2102-2104 on October 3, `failure` four to five seconds after creation, no log). The workflow is well
shaped for a scarce allowance (one run per PR when it is marked ready, a merge's repeat skipped when its tree is the PR
head's, a 45-minute stop, Chromium cached by the action) and spends about 5 of its 22 minutes installing Chromium. Part 4,
A6: a self-hosted runner on Personal-HP removes the billing, the install and the paste of PASS blocks at once.

**Releases.** `tools/release-pages.mjs` builds one commit of `main` for a profile (`pages` for crankmagic.com with Play
"Coming Soon"; `cloud-staging` with Play, the table's Durable Object and the engine's modules bundled), refuses rather
than guesses, commits the build to `release/pages` or `release/cloud-staging` as the record, and the walks prove it:
`release-acceptance.mjs` (22-23 checks), `play-e2e.mjs` under wrangler dev (20), `first-look.mjs` (27 of 29, the two r3
disagreements). Deploys were Workers Builds on a push to a release branch, and every build since 05:19 UTC on October 3 was
terminated in the queue, so production is still version 2fc36d3b of October 1 (19:59 UTC) and staging version 99f23f29 of
04:57 UTC on October 3 (the Cloudflare API, read here). The documented fallback, a `wrangler deploy` from Personal-HP, is
the path that works; Part 4, A7 makes it the path.

**Merging.** Sessions may merge on the gate (AGENTS.md, since September 19) but this session's permission check refuses
`gh pr merge`, so #571-#575 wait on Rob; the October 2 session merged batches 40-78 as one train (#526-#568) under the
same constraint, which is why one tree (`18c07644`) was gated for four PRs. Either Rob adds the permission rule ACTIVE.md
asks for or the train stays the pattern; the review has no opinion beyond "decide it once".

**The ratchets and pins.** Every served file that changes moves its `?v=` pin, then the service worker's, then the app's,
then the asset-versions fixture (`tools/bump-pins.mjs`, `tests/asset-versions.mjs --update`); UK spellings, raw hex, page
budgets and size steps only go down. They hold the quality they were built to hold and cost each UI PR four bumps; nothing
to change, and the executor should know the cost is real.

**The toolchain's one gap.** `docs/engine/PLAN.md` §5 names `tests/engine-perf.mjs` and a budget; neither exists (Part 2,
2.11).

## Part 6 -- The board and the lobby against the wireframes, and the evidence

### 6.1 The board at real sizes

`node tools/board-fixture.mjs --out <dir> --sizes 1280x720,1920x1080 --turn 9` here: a real four-seat table (the GameTable
object over `game/room/table.mjs`), Rob and three house pilots on his first four decks as the fixture's vanilla versions,
photographed in Table, Focus, Full screen and Full screen after the browser's is left, with `measure.json`. Read against
`docs/design/2026-09-25-redesign-r3/project/wf2-screens.js` (`strip`, `mat`, `counter`, `playTable`, `playFocus`,
`playFull`, `playTools`, `playCoach`) and Rob's 25 items of September 30 (`docs/plan-to-done-2026-09-30.md`, Part 1):

| Wireframe or item | Built as drawn? | Seen in the shots |
| --- | --- | --- |
| The strip, one line: ☰ · Turn · the step chip · n / 7 ▾ · Next · the pass · Skip to end · Table / Focus / Full screen · History ▾ · Tools ▾ · Panel ▸ | Yes | "Turn 9 · You · Main 1 · 4 / 7 ▾ · Next: Combat · Next step · Skip to end · You can also ▾ · ..." at both sizes; the pass reads Next step on your turn (item 10) |
| Table view: four identical 16:9 boards, 2 · 3 / 4 · 1, you bottom right, headers on the outer edge | Yes | boards 739x416 at 1920 and 419x236 at 1280, identical; Nina and Theo's headers at the top, Maya's and Rob's at the bottom |
| The pie life counter at the true center with the logo (item 9) | Yes | four slices, 40 each, the wand in the middle, at the boards' crossing |
| The row divider and the hand tray's bar (items 4, 5); card-size sliders per scope (item 6) | Yes | the bars between the rows and above the tray; "Board cards 100%" and "Hand cards 100%" sliders |
| Piles on top of their frames (item 7); the mana reminder below the Lands (item 8) | Yes | Command, Exile, Library (Rob's own card back, 89), Graveyard as card frames; "0 mana open · land drop used" under the Lands |
| The hand whole in every view (item 25); counts by type (item 14) | Yes | `measure.json`: the last card's bottom inside the window in all eight shots; "Land 0/2 · Creature 0/3 · Instant 0/0 · Other 0/0" |
| Focus: the mat the largest 16:9 beside the pane, the step ribbon, the History band between the pile pairs, the pane ending in My board · Table view · Coach | Yes | 812x457 at 1280; "Untap Upkeep Draw Main 1 Combat Main 2 End" with the past struck through; the band lists the last six lines |
| Full screen: the 44px rail, three opponents across the top 40%, the big board full bleed, the right column with vitals, the card panel, "You can also", the log | Yes | 329x280 opponents over a 994x421 board at 1280; the column reads "Hover a card to read it here; click one to keep it." |
| The Coach glyph a speech bubble with the wand (item 21); the clock for history (item 24) | Yes | the pane's Coach button and the band's clock |
| The static tabletop (item 3) | Yes | one frame, the active seat's color fan |
| **Legibility at 1280x720 in Table view** | **No** | the pile captions collide: "CommandExile 0", "Library 9Grave..."; "Battl efield" breaks mid-word; under AGENTS.md's 10px floor (R12) |
| Card art | Not here | the fixture's cards draw as plain frames with names (no network to the picture host from this container); the shapes and sizes are what the suite measures |
| Paying mana | As designed, and a gap | three untapped lands and "Creature 0/3": a spell is cast by tapping each land from "You can also ▾" (Full screen lists "Tap for mana: Plains", "Tap for mana: Mountain ×2") and then the card (R13) |

### 6.2 The lobby

Photographed at 1400x900 and 390x844 through the staging page (`tools/release-pages.mjs`'s `cloud-staging` build, the
table answered in-process as `tests/table-lobby.mjs` does). As the r3 lobby wireframe draws it: a seat per quadrant with
its sea, the state chip (Pending, Open), Choose a deck and Choose mat, Invite on an open seat, Choose its deck on the AI
seat, and the Table rules panel at the center with the host's small Edit beside the title (item 2), the rules (starting
life 40, bracket limit Any, seats, invitations a day, a dropped player 5 minutes), "Waiting on 2 seats." and Start. The
phone stacks the rules over the seats, each full width, with the footer's fan-content notice at the foot. Nothing found
to report.

### 6.3 The Play journeys through the real UI

`tests/uat/play-journeys.mjs` (two four-seat tables through the real board, the invite joined on a phone, every view at
1280, 1400, 1920 and 2560 and the phone in landscape, the Coach, the record) ran here with screenshots: **49 checks
passed**, all seven decks seated (as the fixture's vanilla versions), no frame to one person naming another's hidden card,
Rob's record without Maya's hidden cards. The phone shot (844x390) is Focus only with the 52px rail (the hand's count on
the hand button, the clock, the Coach, the gear), the pill "T6 · Upkeep · Next: Draw · Next step" and the seat strip with
its arrows, as the board's contract says. On the phone the fixture's placeholder names are a few pixels tall; with card
art they are pictures, and the suite measures the cards, not the names.

### 6.4 The evidence, as run

Every command ran in this container at the handoff head 849845bf. Scratch scripts are described, not committed; the
scenarios in them use the engine's own fixtures (vanilla creatures and a {R} 11/3 legendary "Boss" with haste as the
commander) and real defined cards (Lightning Bolt, Swords to Plowshares, Terminate, Zulaport Cutthroat, Blood Artist,
Fleshbag Marauder).

**Probes P1-P9b** (`runScenario` from `game/engine/cards/scenario.mjs`; `createController` for P7):

```
P1  Swords to Plowshares on the commander:   question pending: none; Boss is in exile; seat 0 life 51
P2  Terminate on the commander:              question pending: none; Boss is in graveyard(seat 0)
P3b Lightning Bolt kills it, owner answers "command zone", Zulaport Cutthroat on the battlefield:
                                             Boss is in command(seat 0); seat 1 life 29 (28 if the death was seen); commander damage {}
P4  Recast with one Mountain untapped:       cast Boss is offered 1 way(s), not 0   (the tax is not charged)
P5  11 combat damage, dies, returns, 11 more: seat 1 life 18; commander damage tally {}; seat 1 lost? false; commanderCasts {"45":1,"57":1}
P6  Two legendary Boss, one controller:       Boss on the battlefield: 2; question pending: none; graveyard: empty
P7  5 damage among two 2-toughness blockers:  REFUSED [1, 4]: "Assign lethal damage to the required blockers before assigning damage onward"; accepted [3, 2]
P8b Fleshbag Marauder, seat 0 answered Bear:  second question: sacrifice asked of seat 1; seat 0's graveyard already holds: Bear; Elf still on the battlefield: true
P9b Bear and Elf sacrificed on seat 0's turn: awaiting: order-triggers seat 1; stack bottom to top: [Zulaport Cutthroat (seat 0)]; pending: [Blood Artist (seat 1) | Blood Artist (seat 1)]
```

**Probe D, Rob's seven decks** (`data/live-state.json` against `game/docs/engine-inventory.json` and the card directory;
distinct nonbasic cards, the commander included):

| Deck | Distinct | Defined | Every rule | Definition only | Need a mechanic | The mechanics |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| D1 Quintorius Spirits | 83 | 25 | 53 | 28 | 30 | RememberChanged 11, MayPlay 9, RememberObjects 8, TargetMax/Min 6, CheckSVar 5, SVarCompare 3, Imprint 2 |
| D2 Chulane Value Loop | 79 | 28 | 57 | 29 | 22 | RememberChanged 8, RememberObjects 6, TargetMax/Min 5, ConditionCheckSVar 2 |
| D3 Atraxa Proliferate | 79 | 27 | 59 | 32 | 20 | TargetMax/Min 3, replaceCounters 2, CounterNum 2, etbCounter 2, counter added once, Increment, Living Weapon |
| D4 Felothar Walls | 76 | 31 | 61 | 30 | 15 | CanAttackDefender 2, TargetMax/Min 2, Partner 2, exchangeLife 2, life gained/lost this turn, investigate |
| D5 Shadrix Aristocrats | 72 | 35 | 60 | 25 | 12 | TargetMax/Min 4, CheckSVar 3, Escape 2, SVarCompare 2, Encore, CantAttack, ThisTurnEntered |
| D6 Krenko Goblins | 67 | 21 | 52 | 31 | 15 | MayPlay 3, RememberChanged 3, RememberObjects 3, CheckSVar 2, Overload 2, AlternateAdditionalCost, alterAttribute, ETBReplacement |
| D7 Maralen Exile Cast | 63 | 14 | 50 | 36 | 13 | TargetMax/Min 4, MayPlay 2, AlternateAdditionalCost 2, RememberObjects, twoPiles, UnlessCostOther, Prowl |

Across the seven: RememberChanged 24, TargetMax 24, TargetMin 24, RememberObjects 18, MayPlay 14, CheckSVar 12,
SVarCompare 7, etbCounter 5, AlternateAdditionalCost 4, Overload 4. ("TargetMax/Min" is one construct, "up to N targets".)

**Probe S, the proof's depth and a sample.** 1,011 scenario files, 1,463 scenarios; cards by scenario count {1: 640,
2: 298, 3: 67, 4: 5, 6: 1}; 2.29 checks a scenario; 219 scenarios whose every check is a zone or control listing. Of 14
seeded picks from the 1,275 "every rule built, no definition" most-played cards, two need something the catalog lists
as missing or named: MacCready, Lamplight Mayor (skulk, CR 702.118) and Shimmer Dragon ("Tap two untapped artifacts you
control", the `tapXType` cost).

**Probe R, twelve games in the room.** `startRoom` over `memoryStorage`, four house pilots, each seat a random commander-legal
definition and 56 random nonland definitions, 6 nonbasic lands and basics to 99, `passEmpty` on, seeds 1-12:

<!-- probe-R -->

**The definitions by day** (`git ls-tree` of `main` at each day's last commit): September 30, 0; October 1, 467;
October 2, 853; October 3, 999; the handoff head, 1,011.

**GitHub Actions** (`actions_list` for `tests.yml`): runs 2102, 2103 and 2104 (the heads of #575, #573, #574), created
14:05:23-14:05:40 UTC on October 3, concluded `failure` at 14:05:27-14:05:45, no job log; run 2094 on `main` the same way at
08:20.

**Cloudflare** (`GET /accounts/.../workers/scripts/<name>/deployments`, read-only): `crankmagic` deployment 22a321a5 of
2026-10-01 19:59:46 UTC at 100% on version 2fc36d3b (number 10); `crankmagic-staging` deployment 1364a406 of 2026-10-03
04:57:58 UTC on version 99f23f29 (number 118). No deployment after those.
