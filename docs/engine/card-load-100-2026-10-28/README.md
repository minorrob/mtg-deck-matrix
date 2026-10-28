# The card load to 100%: where it stands, and what 100% means (2026-10-28)

Rob, 2026-10-28: *"Pick back up the engine loading from its current state. Rationalize against the 100% load plan,
create for me the kick-off copy/paste prompt and attachment instructions for OpenAI. It will run 8 different subagents and
orchestrate all of their work into a consolidated test, confirm and merge at the end ... I want 100% accuracy, 0 errors in
the game when any given card is played, for that to be play-tested to satisfaction, and a 0 error rate on the execution of
a card mechanic."*

This folder is the package for that run:

| File | For |
| --- | --- |
| `README.md` | Everyone: the state, measured, against the plan; the gates that define 100%; the open accuracy debt |
| `KICKOFF.md` | Rob: the five attachments and the prompt to paste |
| `ORCHESTRATION.md` | The orchestrator: waves, integration, the consolidated test, merge, staging, records |
| `BRIEF.md` | Every subagent: the machine's paths, the loader's commands, the eight roles, done-means |
| `RUN.md` | The run's record, written by the orchestrator after each wave |

Measured on main `39a45706` by a Claude Code session on Personal-HP, 2026-10-28. Nothing was changed in the engine.

## The plan this is measured against

"The 100% load plan" is three documents that agree on the end and differ on the route:

- **`docs/plan-to-100.md` M7** ("Every card: the compiler and AI card reconciliation") and **`docs/engine/PLAN.md`
  phases 7 to 10**: the end state is **G7, "every Commander-legal card `verified` or `compiled`; no card refused at
  prepare for a missing construct; the fuzz harness runs ... on invariants and exceptions alone"**, after G4/G6's
  "zero exceptions across 5,000 fuzzed games".
- **`docs/engine/plan-card-load-program.md`** (Rob's decisions of 2026-10-14): the route. The compiler first, the API
  backstop under 99% confidence, candidates at playtest tables, waves that review and promote. All six steps are built.
- **The gameplay-gap list** (`docs/engine/gameplay-gaps-2026-10-21.md`, Rob: *"We can't skip on any part"*): what plays
  differently from a table, the choices the engine makes for a player, and the checks that step around a card. It is
  still on an unmerged branch, in PR #834.

**Where the route changed since.** The API backstop (`game/tools/engine-compile.mjs`, step 4) was built and never run:
its 200-card sample, cost and pass rate are still unmeasured (ROB-90). Since 2026-10-19 the cards were loaded by hand
waves and candidate promotions instead: wave 4d (#843–#852), the compiler's candidates (#855), Rob's four lists (#862),
the six precons (#871) and Rob's Orzhov deck (#903). This run keeps that route, with OpenAI's subagents as the writers;
it does not run the API backstop. Forge is retired and plays no part (ADR-001).

## Where the load stands (measured 2026-10-28)

| Measure | Command | Result |
| --- | --- | --- |
| Final definitions | `node --stack-size=4000 game/tools/batch/check-cards.mjs` (95 s) | **6,430 definitions, 11,023 scenarios, 0 failed** |
| The pool not yet defined | `node game/tools/card-compiler.mjs` (39 s) | **25,616 undefined Commander cards**: 116 candidates, 2 blocked, 0 vetoed, 0 refused, 24,429 with an unknown sentence (12,080 of them one sentence short), 1,069 in another layout |
| The whole pool | the two above | about **32,046** Commander-legal, non-banned cards; **20.1% final** |
| Rob's seven live decks | `node --stack-size=4000 tools/library-engine-index.mjs --top 3239` (33 s) | **477 of 477 final** |
| Rob's library outside the decks | the same | 533 of 534 final; 1 unloaded |
| The most-played Commander cards (80% of appearances, 3,239 cards) | the same | **1,247 unloaded**, 2 candidates, the other 1,990 final or in Rob's library |
| The compiler's calibration | `node game/tools/sentence-library.mjs` (35 s) | 8,048 templates; 4,161 of 4,165 held-out translations pass (99.9%); **4 fail**: Blackblade Reforged, Contagion Clasp, Goblin Piledriver, Wayfarer's Bauble |
| Played games | `node --stack-size=4000 tools/fuzz-live.mjs --library --seeds 1-3 --replay --leaks`, and Rob's staging decks with a person in seat 0 | 3 of 3 and 1 of 1 clean, replays identical, 0 leaks (3 to 4 s a game, 14 s with a person) |

**Stale on main:** `data/engine/candidates.json` says 100 candidates over a pool of 25,641; a fresh compile says 116 over
25,616 (the library grew from 7,970 templates to 8,048). `docs/engine/coverage.md`'s scopes are not the same lists as
`library-engine-index`'s and undercount what is final; read the index tool for Rob's cards.

**What no tool measures yet** (wave 0 builds it):
- a fuzz over decks drawn from **every** final card: `fuzz-live.mjs` plays Rob's library or named decks only;
- a ledger of which final cards have ever been cast and resolved in a clean game, and which abilities have fired.

So today nobody can say that every loaded card has been played without an error. That is the first thing this run proves.

## What 100% means: the gates

Rob's four words, made measurable. The run is done when all eight hold; `RUN.md` carries each one's number after every
wave.

| Gate | Rob's words | Holds when | Today |
| --- | --- | --- | --- |
| **G-1** | every card | `card-compiler.mjs` reports **0 undefined** Commander cards (the pool is `deckCard` and not banned, in `data/engine/oracle.json`) | 25,616 undefined |
| **G-2** | none refused | 0 candidates outstanding, 0 provisional, 0 blocked; no card refused at a table for a missing rule | 116 candidates, 2 blocked |
| **G-3** | 0 error rate on a mechanic | `check-cards` 0 failed, and **every** card has scenarios of its own for each ability and its edges (a promoted candidate's observed smoke game is not enough) | 0 failed; promoted candidates' scenario depth unaudited |
| **G-4** | 100% accuracy | Calibration with **0 failures**; every card read by the verifier, independent of its writer, against its oracle text, rulings and the CR | 4 failures; no independent review of past loads |
| **G-5** | 0 errors when played | **5,000** pool-fuzz games with a person seat, every one clean: finished, 0 refusals, 0 exceptions, replayed identically, 0 leaks; plus Rob's library (50 seeds) and staging decks | no pool mode |
| **G-6** | any given card is played | every final card cast or played and resolved in at least one clean game, and every ability fired there or in a scenario (the exercised ledger) | not measured |
| **G-7** | played as at a table | the gameplay-gap list has **no open item**: no card that plays differently, no choice made for a player, no check stepping around a card, no ignore outstanding | open items below |
| **G-8** | play-tested to satisfaction | Rob has played the waves' cards on staging and signed off | none yet |

A finite number of games and scenarios proves the absence of the errors they look for, not of every error. That is why
G-3, G-4, G-6 and G-7 sit beside G-5, why Rob's playtests (and every "report a wrong card" from a playtest table) stay
the last word, and why each finding afterward reopens the gate it belongs to.

## The scale, honestly

- **Hand writing:** the last four loads wrote about 30 cards a lane a session (precons: 150 cards, five lanes; Rob's
  lists: 100, three). Seven writers make about **210 cards a wave**.
- **T2, the 1,247 most-played:** about six waves.
- **T3, the other ~24,000:** by hand alone, more than a hundred waves. The compiler is what changes that: 12,080 cards are
  one sentence short, and every sentence a wave writes completes the other cards that share it, which then arrive as
  candidates for review. T3 is ordered sentence first for that reason. How much it shortens the run is unmeasured; waves
  1 to 3 measure it, and `RUN.md` carries the rate.
- **Each wave's merge** waits on one GitHub Actions run, 45 to 60 minutes.

## Open accuracy debt (wave 0)

The gameplay-gap list of 2026-10-21, checked again against main `39a45706` on 2026-10-28 (a read-only audit by grep and
line ranges; three of its evidence lines re-read by hand: Urza's Saga, the payment caps, the token shock land). Sections 2
and 3 (Rob's decks and library refused on main) are closed: every live-deck card is final and one library card is left.
The rest is mostly still open. Paths are under `game/engine/`.

**PR #834** (a paragraph is one ability; the list itself) passed `suites` on its head `2610528a` and is now
**CONFLICTING** with main. Wave 0 lands it first.

### Defined, but plays differently (section 4): 21 open, 1 fixed, 5 unsure, 3 not gaps

| Item | Evidence on main | Wave 0 role |
| --- | --- | --- |
| Urza's Saga III finds "mana value 1 or less", not "mana cost {0} or {1}" | `cards/u/urzas-saga.json`:165 | W5 |
| Elspeth, Sun's Champion's emblem is two lasting effects, no emblem object (emblems exist, `rules/layers.mjs`:351) | `cards/e/elspeth-suns-champion.json`:94, 111 | W1 |
| Token copies of a shock land never asked "pay 2 life" | `script/effects/permanents.mjs`:656 (NAMED) | W5 |
| Innocuous Rat: a manifest-dread card that can't enter should go to the graveyard (CR 701.40f) | `script/effects/asking.mjs`:384, 453 (unsure) | W3 |
| Plumb the Forbidden copies only while it is on the stack | `asking.mjs`:1634 | W6 |
| A copy of an "up to N targets" spell keeps the original's targets ("you may choose new targets" never offered) | `asking.mjs`:1648 (NAMED) | W2 |
| Damage from a source that left the battlefield is sourceless, so protection does not stop it | `asking.mjs`:1782 (NAMED) | W4 |
| The command-zone choice when a commander goes to hand or library by a cost or effect (CR 903.9b) | `rules/commander.mjs`:43 | W3 |
| Damage doublers where nobody can be asked: the order that deals the least | `rules/replacement.mjs`:34, 576 | W4 |
| Metallic Mimic and the copiers: type asked after it enters; a copy of a copy | `replacement.mjs`:420 | W2 |
| The monarch is in the view; the board does not show it | `projection.mjs`:230 (a Play-lane request) | Requests |
| Two limited "you may play" permissions: one picked for the player | `rules/actions.mjs`:1472 | W3 |
| Alms Collector and dredge: which replacement first is not asked (CR 616.1) | `script/effects/zones.mjs`:752–760 | W7 |
| "Each player draws" in seat order, not from the active player | `zones.mjs`:280 | W7 |
| Delve not offered for an X spell; no die modifiers or "whenever you roll" | `actions.mjs`:1965; `script/effects/resources.mjs`:469 | W5, W7 |
| Cast face down from exile (Gandalf; CR 708.4, 406.4) | `actions.mjs`:1783 | W2 |
| Casts from exile or with alternative costs offered only with mana already in the pool | `actions.mjs`:1681–1685 | W5 |
| {X} or additional-cost cards cast by an effect's "pay mana": not offered | `asking.mjs`:2302 (NAMED) | W5 |
| "Up to N targets" spells cast free or by an effect: left out | `asking.mjs`:2326 (NAMED) | W2 |
| Tokens and copies of prepare cards never prepared | `script/effects/attributes.mjs`:23 | W1 |
| Convoke with Phyrexian or {2/W} symbols left to the pool | `rules/mana.mjs`:483 | W5 |
| Trample over a planeswalker (CR 702.19c) | `rules/combat.mjs`:118 | W4 |
| Unsure, to be settled by a scenario: Song of the Dryads and Sagas under ability loss; Incubator copies single-faced; Social Snub's copy; Winter's prompt and a draw-two cost under Narset | `rules/layers.mjs`:870; `permanents.mjs`:644; `actions.mjs` | V8 finds, W1/W6/W2/W7 fix |
| Fixed: Station abilities rechecked at resolution (now triggered abilities only) | `rules/stack.mjs`:343–345 | — |
| Not gaps: Vinebred Brawler and Safewright Cavalry (proved by suites, not yet at a table), Sphinx of the Second Sun (a CR 103.8a judgment), land drops in any step (Rob's house rule) | | |

### Choices the engine makes for a player (section 5): 10 open, 0 fixed

AGENTS.md: *"any decisions that takes place within the game the players should be given that option."*

| Moment | Evidence | Wave 0 role |
| --- | --- | --- |
| Trample blocked by one creature: exactly lethal assigned, the attacker's controller not asked (CR 702.19b) | `rules/combat.mjs`:781–790 | W4 |
| Two damage replacements where nobody can be asked | `rules/replacement.mjs`:34 | W4 |
| Counter replacements (Hardened Scales with a doubler) | `rules/statics.mjs`:849, 911 | W6 |
| Token replacements outside a resolution | `statics.mjs`:570 | W6 |
| Destruction replacements in nested effects (shield, then Auras in attach order) | `script/effects/zones.mjs`:864 | W3 |
| A token put onto the battlefield attacking attacks the first player in turn order | `script/effects/permanents.mjs`:270 | W4 |
| Entering replacements applied in the order found | `replacement.mjs`:579 | W6 |
| Zone-change replacements (Liesa): the question is raised, the move does not wait | `replacement.mjs`:35 | W3 |
| Ways to pay capped: 24 tap choices, 12 payments | `rules/actions.mjs`:1703; `rules/mana.mjs`:254 | W5 |
| Draw replacements where nobody can be asked: the first player in turn order | `zones.mjs`:672 | W7 |

### Checks that step around a card (section 7): 10 open, 1 fixed

| Check | Evidence | Wave 0 role |
| --- | --- | --- |
| The scenario runner: `settle` takes the first legal answer (3,547 scenario files use it), `optional` skips a move not offered silently, `targets: "any"` takes the first aim | `cards/scenario.mjs`:24–25, 235 | V8 (the runner); each card that turns red → its theme |
| A compiler candidate passes its smoke game without the card ever being played (`played` recorded, not required) | `game/tools/card-compiler.mjs`:75, 79 | W7 |
| Calibration trusts a template seen on one card (`minimumCount: 1`) | `card-compiler.mjs`:89 | W7 |
| Candidates have no scenarios of their own (now 100–116, was 2,643) | `cards/candidates.mjs` header | the writers, as they promote |
| `tools/fuzz-live.mjs`: a definition that throws is left out silently; commanders are legendary creatures only | `tools/fuzz-live.mjs`:103, 106 | V8 |
| `tests/engine-room-games.mjs`: seeds 3 and 5 left out, the deal frozen at `e243ccde`, refusals logged not failed | :16, :31, :115 | V8 |
| `tests/engine-x11-leave-questions.mjs`: refused pilot answers replaced, not failed (except a concession's) | :481, :518, :529 | V8 |
| Coverage counts seven partial constructs as built, so `coverage.md`'s shares read high | `game/tools/engine-constructs.mjs`:345–396 | V8 |
| `engine-compile`'s held-out smoke skips 36 cards | `tests/engine-compile.mjs`:66 | not this run (the API backstop is not run); stays named |
| `data/engine/support.json`: every one of 32,116 rows "unsupported" since 10-04 (the frozen local host's ledger) | the file | stays named; retiring it is M9's |
| Fixed: Six and Ichor Elixir are defined, the locks retargeted | `tests/engine-costs-activations-4b.mjs`:234; `tests/engine-libload-l6.mjs`:80 | — |

### Rules not built (section 8): 10 rows fixed, 4 partial, 10 open

- **Fixed (defined now):** Nethroi (mutate), Boromir (the Ring), Bludgeon Brawl, Ichor Elixir and Fractured Powerstone
  (planar dice), Mox Diamond, The Earth Crystal, Sylvan Library, Arena of Glory, Six, Ragavan and Birgi, Chord of Calling.
- **Partial:** emblems (Daretti, a second Teferi and Elspeth's emblem object left); Endurance; Valgavoth; The Legend of
  Kyoshi.
- **Ruled by Rob, 2026-10-28:** cards from outside the game (Cunning Wish, Extrapolate the Impossible; CR 400.11, 903.11)
  are **refused at the table for now**: a deck holding either is illegal in Play, refused by name with the reason and the
  way out (remove the card), as the table already refuses a card it cannot play (`game/room/table.mjs`, `readDeck`;
  `game/engine/cards/index.mjs`). The two are **exempt from G-1 and G-2** until the Decks wishboard is built (Linear
  ROB-198, after the load): each deck lists the cards its wishes may fetch, in the commander's colors and under
  903.11a's name limits.
- **Open:** blocker-side
  requirements and battles (ROB-149); draw replacements (Notion Thief, Abundance, Underrealm Lich); "exiled with", mana of
  any type, ability cost reduction (Nightveil Specter, Dire Fleet Daredevil, Forensic Gadgeteer); Purphoros,
  Bronze-Blooded; Sanctuary Warden (shield counters are built, the card is not); Nulldrifter; The Lord of Pain, Decree of
  Pain, Dismantling Wave; Jadar; **remembered objects** (`RememberObjects` 55 library cards, `RememberChanged` 43, `MayPlay`
  25, Imprint, Wither, ChoosePlayer, FlipCoin).
- **The named cards of the last nine rows:** 13 of 84 defined. These are ordinary cards now: they enter the waves' lists by
  their theme and demand, not wave 0.

### And the compiler's four calibration failures

Each is a template that translates another card wrongly, so it is wave 0's: Blackblade Reforged ("equip legendary
creature": a non-legendary creature is offered nothing; W4), Goblin Piledriver (the Goblins left home are counted; W4),
Contagion Clasp (no target for proliferate after the Bear dies; W6), Wayfarer's Bauble ("Invalid selection"; W5).
