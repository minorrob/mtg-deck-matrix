# The simulation model, audited: what the deck simulator shares with the rules engine, and what it estimates

*Linear ROB-84, 2026-10-18. Written by Claude · Deck intelligence from the code as it stands on `main` 41997462; every
claim names its file and line. The three claims it keeps apart are the handoff's (`docs/handoff-fable-engine-2026-10-16.md`,
"Simulation model expectations"): rules conformance, deterministic replay, and statistical deck measurement with
variance. Passing one proves neither of the others, and none of them proves a deck is ready for multiplayer.*

## 1. The one-paragraph answer

CrankMagic has two things that play Magic, and they share almost nothing but the names of the cards. The **deck
simulator** (`sim-engine.js`, driven by `deck-measure.js` and `crankmagic-sim.js`) is a Monte Carlo model: it reads a
hundred cards by regular expressions over their text, plays an abstracted game against three opponents that are
damage curves rather than decks, and reports a composite score averaged over six seeds of twenty thousand games with a
standard error. The **rules engine** (`game/engine/`) plays real games by the Comprehensive Rules from scripted card
definitions, with pilots, a journal and a decision tape, deterministic to the byte. Every score the app shows is the
simulator's. Nothing the engine does flows into a score today, and nothing the simulator does touches a table. The two
agree on card identity by name (and, through the stores behind them, on Scryfall oracle ids: 1,322 of 1,322 shared
cards match) and on deck quantities; they do not share a module, a card reading, a combat, or an opponent.

## 2. The three claims, and which system makes which

| Claim | The simulator | The rules engine |
| --- | --- | --- |
| **Rules conformance** (the game plays by the rules) | No. Says so: "a Monte Carlo model of a four-player Commander game, not a rules engine" (`sim-engine.js:9-13`). No stack, no blocks, no targets, no priority; sixteen simplifications in code (§4). | Yes, for the cards it has definitions for: rules modules for turn, stack, priority, mana, cast, combat, state-based actions, triggers, layers, commander and mulligan (`game/engine/index.mjs:34-64`); "Unsupported is loud… never a no-op, never a warning" (`docs/engine/PLAN.md:257-277`); a deck naming a card it cannot define is refused by name before the game (`game/room/room.mjs:130-156`, 422 `unsupported`). |
| **Deterministic replay** (the same seed and answers give the same game) | Deterministic over **aggregates**: `createRng` (mulberry32, `sim-engine.js:128-137`) and `hashSeed` (FNV-1a, `:139-147`) seed game *i* as `hashSeed(seed, i)` (`:1859`); `tests/sim-engine.mjs:98` holds "the same seed must reproduce the same metrics exactly", and `tests/deck-measure.mjs` holds the browser path to the published score to the digit. There is no decision tape and no replay of a single game: `playGame` returns aggregates, not a journal. | Deterministic per **seed plus decision tape**: one rng (`game/engine/rng.mjs:3-29`, xoshiro128\*\*, resumable, no `Date`, no `Math.random`), a journal with a key-order-insensitive state hash (`game/engine/journal.mjs:14-25`), `replayTape` and `replayMatch` comparing fingerprints (`game/room/replay.mjs:3-40`); two all-house games replay to the same hash and byte-identical journal (`tests/engine-house-pilot.mjs:148-151`). |
| **Statistical deck measurement with variance** | Yes, and only here: six seeds of 20,000 games (`deck-measure.js:57-63`), the score's standard error from the seed-to-seed spread (`:187-190, :249`), a gap called real when it clears twice the combined noise (`data/deck-ratings.json` method; the Lab's refine, `crankmagic-lab.js:814-815`). The variance is of the **model's** randomness: it says how much the shuffle moves the number, not how far the model is from Magic. | Not built. No tool plays N seeded games and reports outcomes as data; the N-game loops are tests with a turn cap and one summary line (`tests/engine-gate.mjs`, `tests/engine-house-pilot.mjs:146-159`, `tests/engine-room-games.mjs:99-127`). A game costs 1.5 to 25 s on the container (`tests/engine-room-games.mjs:33-57`) against the simulator's ~20,000 games a second, so the published protocol is not a protocol the engine can run. |

**What a score on the deck page therefore is:** a comparison between hundreds under one model, with a standard error
that covers the shuffle and nothing else. **What it is not:** a rules-conformant result, a replayable game, or a
prediction of an evening. The Lab prints four standing `limits` sentences with every report (`crankmagic-sim.js:275-279`);
they are right and should stay.

## 3. The shared code, exactly

- **Card identity by name.** Both key on the printed name: the simulator's `lineupHash` on `name|quantity|C`
  (`deck-measure.js:135-147`) and its per-card stats by `profile.name` (`sim-engine.js:1805`); the engine by folded name
  (`game/engine/cards/definitions.mjs:9-10`, `room.mjs:144-145`). Neither passes an oracle id into play. The stores
  behind them carry Scryfall oracle ids that agree: of `data/cards.json`'s 2,367 names, 1,322 have an engine definition,
  all `verified`, with the same `oracleId` in all 1,322; 1,045 catalog cards (Abjure, Absorb, Acidic Slime, …) have no
  definition yet.
- **Deck quantities and the commander.** Simulator: `{name, quantity, isCommander}`, quantity expanded to copies and the
  first commander copy kept out of the library (`sim-engine.js:532-559`). Engine room: `commander: [names]` and a flat
  `cards: [names]` with repeats (`room.mjs:144-145`). The same hundred is representable in both by a trivial transform.
- **Scryfall upstream, two snapshots.** `data/cards.json` and `data/card-facts.json` (2026-09-28, `tools/build-card-records.mjs`)
  feed the simulator; `data/engine/oracle.json` (2026-10-04, `tools/build-engine-cards.mjs`) feeds the compiler. Different
  files, different dates, both keyed by name with oracle ids inside.
- **Nothing else.** No module is imported in both directions (`grep` for the simulator's files under `game/` and
  `cloud/` is empty, and for the engine's files in the simulator's). The simulator's optional board combat
  (`combat.js`, written from the CR, `docs/simulation-fidelity.md:245-257`) is unrelated to `game/engine/rules/combat.mjs`.
  Two unrelated modules are both called `pilot-policy`: `pilot-policy.js` (the simulator's five decisions) and
  `game/contracts/pilot-policy.mjs` (the Forge-era AI difficulty contract).

## 4. The differences, one by one

The simulator's own list (`sim-engine.js:14-31`, `SIMPLIFICATIONS`), each with what the engine does instead and whether
an unsupported effect is **silently zero**, **a stand-in**, or **refused**:

| # | The simulator | The rules engine | When the simulator meets a card it cannot read |
| --- | --- | --- | --- |
| 1 | No stack: spells resolve when cast; counterspells are generic interaction. | A stack, priority, responses (`rules/stack.mjs`, `rules/priority.mjs`). | A counterspell counts as one held answer that delays an opponent's scripted win 1.5 turns (`:1441-1444`). |
| 2 | No blocking: damage is power × a connect rate (0.70, 0.78 trample, 0.85 flying or menace); a board's defense is total toughness × 0.025 capped at 0.55, plus deathtouch and first strike deterrence (`:71-80, :1394-1398`). Board combat exists and is off (`docs/simulation-fidelity.md:105-270`). | Declared attackers and blockers, damage assignment, combat tricks (`rules/combat.mjs`). | A combat keyword the regexes do not name is nothing. |
| 3 | +1/+1 counters grow (enters-with, repeatable adders, doublers, proliferate) but never move. | Counters are state; moving them is a scripted effect. | The Ozolith is an ordinary permanent (**silently zero**). |
| 4 | Proliferate hits every own creature with a counter; no choice. | Proliferate is a choice offered to the player. | A stand-in. |
| 5 | A repeatable counter source is used every turn from the turn it lands, including that turn. | Activated abilities cost mana and timing. | An over-estimate by design. |
| 6 | No politics: opponents never team up or target each other's threats. | Pilots choose targets each; the house pilot scores them (`game/engine/pilots/`). | — |
| 7 | A tutor takes the best of the next three cards by cast priority (`:1147-1155`). | A search offers the library (`rules/search.mjs`). | A stand-in that under-rates a tutor. |
| 8 | Tokens are extra power on the maker (estimate mode); separate 2/2 bodies only under board combat (`:881-907`). | Tokens are objects. | A stand-in. |
| 9 | "Alternate win conditions and storm are scored as a large threat." **Stale in part**: storm is now a one-turn mana burst (`:1118-1121`); an alt-win card is cast at finisher priority as a body and listed in `unwatchedWinCards` (`:474-479, :1617-1624, :1850-1854`), never as a win. | "You win the game" is an effect (`rules/sba.mjs:681-690`). | **Flagged, not scored**; the Lab refuses to rank swaps on such a list without the reader's acknowledgment (`crankmagic-lab.js:845-852`). |
| 10 | Mana fixing is ideal within the colors of lands in play. | Exact pips, payment sources, mana abilities (`rules/mana.mjs`, `rules/mana-abilities.mjs`). | — |
| 11 | A fetch land enters tapped and fetches nothing; its crack cost and the land spent are not modeled. | Searches, sacrifices, taps. | A stand-in. |
| 12 | A keyword whose effect lives only in reminder text (basic landcycling, investigate) is credited with nothing, because reminder text is stripped first (`:387-389`). | The scripted definition carries the effect. | **Silently zero**, by a stated choice (`docs/simulation-fidelity.md:450-458`). |
| 13 | Defenders attack only when the deck has an effect that lets them, and deal toughness damage only when it says so. | Defender is a static ability the rules read. | — |
| 14 | A noncreature commander never fights. | A planeswalker commander is a planeswalker. | — |
| 15 | Opponents are nine archetype curves (`sim/opponents.json`: threat, interaction and wipe by turn, a scheduled win turn with jitter), weighted into a table; `mixed-pod` by default. | Opponents are decks with pilots. | — |
| 16 | The fun score is one operationalization (participation, board, pace: `:1633-1639`). | No such number. | — |

Beyond the list: **anything the regexes do not match is a vanilla card of its type and cost** (`sim-engine.js:384-385`:
"Anything the loop cannot see is, by definition, not simulated"). A card with no type line and no text is read as a
free spell; a hundred blanks "does not error. It returns a number" (`deck-measure.js:337-347`). The browser path refuses
to publish below 95% readable cards or with a blank commander (`crankmagic-sim.js:164-190`); the Node tools under
`tools/sim/` make no such check. A creature of five or more mana is a finisher whatever it does (`:491`); an unknown
body is estimated at `max(1, round(cmc × 0.9))` (`:288-303`); drain decks "should be read as an upper bound" (`:305-311`).

## 5. Each score's meaning, its variance, its limits

- **The composite score** (`sim-engine.js:1725-1788`): eight parts, each a normalized reading times a weight
  (`sim/config.json:24-33` for runs: win rate 0.35 down to fun 0.05), summed to a hundred-point scale. The parts and
  their norms: win rate (banded or 0.85·min(1, wr/0.5) + 0.15·wr), mana screw and flood against targets, commander
  cast turn against its cost plus an allowance, interaction availability on turns 3 to 7, the clock (turn 8 full, 16
  none), dead cards at turn eight, and fun. **Meaning:** how a hundred functions against three curves under the
  model; comparable only with another hundred under the same protocol and engine generation (`crankmagic-sim.js:62-91`,
  `published-v2.8-6x20000`). **Variance:** `se = sqrt(variance of the six seed scores / 6)` (`deck-measure.js:187-190`),
  typically 0.1 to 0.3 points; a swap counts when it clears twice the combined error and at least half a point
  (`crankmagic-lab.js:814-815`). **Limits:** no stack, no blocks, no politics, curves for opponents; a one-card win is
  flagged, not scored; a spellslinger list reads low because the model cannot see how it wins (`deck-measure.js:14-22`,
  a Thor list at 34.55 on a 0.8% win rate).
- **Win rate** (`:1582-1626`): the share of games where every seat reached zero life before the scheduled win turn.
  **Variance:** a within-run binomial interval `1.96·sqrt(p(1-p)/games)` (`:1794-1801`), used by the optimizer's
  holdout verdict; no between-seed error is computed for it. **Limits:** opponents lose to damage only; our deck wins
  by damage and drain only.
- **Per-card figures** (`:1909-1925`): drawn rate, cast rate when drawn, average cast turn, dead rate, win rate when
  cast, stuck rate (drawn and still uncastable at turn eight). **Variance:** none computed per card; averaged across
  seeds. **Limits:** "deadRate is exactly 1 − castRate and always was, so it ranks nothing" (`deck-measure.js:235-237`).
- **The preview and refine protocols** (one seed of 2,000; three of 4,000): a one-seed run has a standard error of
  exactly zero and must never be reported as a measurement (`crankmagic-sim.js:77-83`); refine scores are comparable
  with each other, not with published ones. The swap record (`swap-record.js`, ROB-117) refuses a one-seed measurement
  for that reason.
- **The fun and pod-fun scores**: one reasonable operationalization each; the Pod Fun rung's 75% power floor reads
  `powerScore` under separate weights (`:1902-1907`).

## 6. Stale statements found, to correct

1. `SIMPLIFICATIONS[8]` says storm and alt-wins are "scored as a large threat"; storm is now a mana burst and an alt-win
   card is flagged (`sim-engine.js:474-479, :1118-1121, :1617-1624`). The sentence should say so.
2. `deck-measure.js:87-90` says `data/cards.json` "carries no power or toughness"; 1,127 of its 2,367 rows do, and
   `hydrate` passes them through (`:115-116`).
3. `sim/opponents.json:6` says "45% of a seat's output comes at us"; the code's `AIMED_AT_US` is 0.33 (`sim-engine.js:55`).
4. `docs/simulation-fidelity.md` §1 ("No creature's printed body has ever reached the engine") and §2 ("Storm count,
   ritual chains and one-card wins — not modeled") are superseded in part by v2.5 and v2.6; the headings were not updated.
5. `game/engine/index.mjs:21` says "there is no mana and no combat"; both exist in `ENGINE_STATUS` (`:34-64`).
6. `crankmagic-sim.js packFor` names `spellsCastPerGame`, `biggestTurn` and `endTurnCounts` (`:247-248, :263`) that the
   browser `measure()` never fills (`deck-measure.js:247-300` does not average `avgSpellsPerGame`, `avgStormPeak`,
   `endTurnCounts`).

None of these changes a number; each is a sentence or a field. They are listed here so the next person does not
rediscover them. Items 1, 2, 3, 4 and 6 are corrected on `claude/deck-sim-variance` (ROB-116 steps 3 and 1,
PR #764): the sentence, the comment, the note, the two headings, and `measure()` now fills the three figures. Item 5
is in the engine lane's file and is left for it (noted on ROB-11).

## 7. What ROB-116 has to build, and what it has to ask for

The issue's three steps, read against this audit:

1. **Close the list.** Of the sixteen, the ones a card definition could remove are 3 (counter movement), 7 (tutors
   choosing), 8 (tokens as bodies, already built under board combat), 11 (fetch lands) and 12 (reminder-text keywords);
   the rest are the model's shape (no stack, no blocks, curves for opponents) and are kept and labeled. "The simulator
   reads the engine's card definitions for what a card does" is possible for the 1,322 shared cards today
   (`CrankCardScript@1` abilities carry what a card does as data, `definitions.mjs`), and is the one change that would
   make the two systems share a reading; it is also the largest.
2. **A calibration harness** needs an engine batch runner that does not exist: nothing plays N seeded games and reports
   turn of first win attempt, mana available by turn and cards drawn as data. The closest thing is the room itself:
   `startRoom({storage: memoryStorage(), matchId, cards: tableCards, pod, seed})` with four `pilot: "house"` seats plays
   a whole game in one call and exposes `status`, `view(seat).result`, `history` and `fingerprint()`
   (`game/room/room.mjs:1053, :781-883`; `tests/engine-room-games.mjs:99-118` does exactly this). Per-turn mana and
   draws would be aggregated from `GameEventManaPool` and `GameEventCardChangeZone` journal events or the turn records
   (`tests/engine-turn-records.mjs`). **The ask of the engine lane (ROB-11):** a `game/tools/play-pod.mjs` (or an export
   from the room) with roughly `playPod({pod, seeds, cards, turnLimit}) → [{seed, turns, winner, reason, refused,
   perSeat: {life, lossReason, commanderDamage, turnsTaken}, perTurn: {landsInPlay, manaProduced, cardsDrawn}}]`,
   deterministic per seed with house pilots, under a stated budget per game. The deck lane builds the comparison on it.
3. **Variance on every score the app shows** is already there for the composite score; win rate needs a between-seed
   error; per-card figures need either an error or a sentence saying they carry none.

Two facts shape the protocol: an engine game costs seconds, not microseconds, so an engine-backed measurement is tens
to low hundreds of games per hundred (a binomial error of about ±9 points on a win rate at n = 100), and only a hundred
whose every card the engine defines can be played (the room refuses the rest by name). The calibration therefore starts
with the six live decks' defined subsets and says how many cards each is short, and the comparison is distributions
(turn of first lethal attack, mana by turn, cards drawn by turn), not scores: the simulator's score has no counterpart
in a real game.

## 8. What this audit does not do

It changes no code and no number, so it carries no regression; the handoff asks for one on any formula, sampling or
ranking change, and ROB-116's first such change brings its own. It does not recommend relabeling anything on screen:
the Lab's limits sentences already say what a score is; a change to what a score means is agreed with the Workshop
before a label moves (`docs/program/workstreams/claude-deck.md`, §6).

## Sources read

`sim-engine.js`, `deck-measure.js`, `crankmagic-sim.js`, `sim-worker.js`, `pilot-policy.js`, `sim/config.json`,
`sim/opponents.json`, `tools/sim/lib.mjs`, `tools/sim/rate-decks.mjs`, `tools/sim/run-sim.mjs`, `.claude/skills/simulate-deck/SKILL.md`;
`game/engine/index.mjs`, `game/engine/rng.mjs`, `game/engine/journal.mjs`, `game/engine/cards/definitions.mjs`,
`game/engine/cards/index.mjs`, `game/engine/pilots/*.mjs`, `game/room/room.mjs`, `game/room/replay.mjs`,
`game/tools/ai-pilot.mjs`, `game/tools/match-telemetry.mjs`, `tests/fixtures/engine-game.mjs`, `tests/engine-gate.mjs`,
`tests/engine-house-pilot.mjs`, `tests/engine-room-games.mjs`, `tests/engine-rules-conformance.mjs`, `tests/sim-engine.mjs`,
`tests/deck-measure.mjs`; `docs/simulation-fidelity.md`, `docs/commander-simulator-plan-2026-09-15.md`,
`docs/engine/PLAN.md`, `docs/handoff-fable-engine-2026-10-16.md`, `game/docs/readiness-plan-2026-09-18.md` §10.
