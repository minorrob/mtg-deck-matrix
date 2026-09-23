# CrankMagic rules engine: the plan to deprecate Forge

Written 2026-09-20 by Claude (Fable 5.1) from a read of `C:\Users\robmi\CrankMagic\repo` at `main` = `ca4aca0`
and the Forge checkout at `58bcd59062a3b44019195a3c25d6ab41a7fe2f61`. Every count below was measured on
this machine on that date; the measuring script is in section 12 and becomes `game/tools/engine-inventory.mjs`
in the first PR. Nothing here was taken from memory.

This file is for the session that executes the work. Section 0 is the prompt to give that session. Sections 1
to 11 are the plan. Section 12 holds the appendices it will need (contracts, primitive map, inventory script).

---

## 0. The prompt for the executing session

> Pick up CrankMagic at `C:\Users\robmi\CrankMagic\repo` (the only clone you may run git in). Read, in this order,
> before doing anything: `AGENTS.md`, `docs/ACTIVE.md`, `docs/handoff-fable-2026-09-20.md` (section 4 especially),
> `game/docs/readiness-plan-2026-09-18.md` (sections 10 and 12), `game/README.md`, then this plan in full
> (`docs/engine/PLAN.md`).
>
> Do not open an engine PR until I confirm that Track V is fully live and live games are 100% operational on it.
> Until then, your only permitted act under this plan is to restate it back to me.
>
> Then restate to me, before touching anything: the objective (a deterministic, plain-JavaScript Commander rules
> engine under `game/engine/` that replaces Forge behind the existing bridge, journal and pod contracts, that plays
> any hundred Commander-legal cards a player brings, going live on the top-40-primitive vocabulary and reaching the
> rest in two enhancement phases, and the removal of Forge from the product at go-live), the rules you are working
> under, the seven settled decisions in section 9 as you understand them, and what "done" looks like for the first
> PR you will open. If anything is wrong I will stop you; otherwise carry on.
>
> Licensing rules you follow without exception: everything you write under `game/engine/` is mine outright and
> carries the header in section 12.5; nothing from Forge enters the repository in any form; card text stays in the
> card directories by convention so Wizards' content can be disentangled from my IP by path if I ever need to, at
> no extra cost; the Claude API key is read from Windows Credential Manager and never appears in a file, page, URL,
> log or commit; you confirm the credential name and the Anthropic terms with me before the first compile run.
>
> Work the phases in section 6 in order. One PR per topic. A test that was red first for every change, named in
> the commit. The full suite with `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q`, browser suites
> driving Chrome through `UAT_PLAYWRIGHT` and `UAT_CHROME` (memory note and `docs/ACTIVE.md`). Every visible
> change rendered for me in chat, before and after, with `node tools/render-routes.mjs`. Never touch
> `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/` or `data/deck-guides.json`. American English
> only; the ratchet in `tests/feature-wiring.mjs` fails you if you add a UK spelling. Never copy, translate or
> paraphrase a Forge card script or Forge source into this repository; Forge is a behavioral test oracle only
> (section 9, decision 1). Branch as `claude/engine-<topic>`, push before you stop, update `docs/ACTIVE.md` as your
> last act, merge to `main` only on a CI result you just read, and treat pending as not green. Tell me plainly
> when you are wrong. At 95% of your usage, stop building: update this plan's status table (section 6), commit,
> merge what is green, and leave the next model a clean start.

---

## 1. Objective and the recommendation

**Objective.** Replace Forge with CrankMagic's own rules engine and retire every dependency Forge brought with it:
the GPL-3 Java adapter under `game/engine-adapter/`, the pinned Forge checkout, the JDK 17 and Maven runtime, the
Swing window that still opens behind the browser table, the native Forge AI, and the Forge card-script index that
setup and the doctor read.

**The finish line (Rob, 2026-09-20).** The engine supports any hundred Commander-legal cards any player brings, not
only the cards in the library today. "Done" therefore means the whole Commander-legal pool (roughly 28,000 to
30,000 oracle-unique cards; the exact count is fixed by the Scryfall pull in PR 0.3) has a definition, every card's
support status is visible at prepare time, and new printings and banned-list changes arrive through a refresh
workflow rather than a session. The three tiers below are the build order that gets there, not three finish lines.

**How it goes live (Rob, 2026-09-20, later).** The pool is reached in three vocabulary tiers, and the engine goes
live after the first: the 40 most-used primitives, then the next 40 as the first enhancement phase, then the
remaining 112 as the second. Section 2.3 measures what each tier closes over; the go-live vocabulary reaches 80.5%
of the pool, the first enhancement 94.3%, the second all of it. Forge leaves the product at go-live; its checkout
stays on Personal-HP as a local-only test oracle for the enhancement phases and is deleted after the last.

**Recommendation.** Build the engine as plain ECMAScript modules with no build step and no npm dependency, exactly
like the rest of the repository. Make it deterministic, seat-projected and journaled from the first commit. Put it
behind the contracts that already exist (the seat `view` and `action` envelope, the choice modes, the
`CommanderProbeEvent@1` journal, the `CommanderPodPack@1` pod) so that the table broker, the lobby, the guest gateway,
the API pilots, force-advance, match telemetry and match reports keep working without a rewrite. Run it in a
worker thread inside the existing host first; the same module later runs in a Web Worker on the static site. Use
Forge only as a behavioral oracle during the transition (same pod, same seed, same decisions, compare state), then
remove it. Build the rules surface in measured order: the seven live decks first, the 2,367-card library second,
the whole Commander-legal pool third. At pool scale, card definitions cannot be hand-written one by one; they come
from a deterministic template parser for the common shapes, a model-driven compiler for the rest, a support ledger
that records how much each definition has been proven, and a fuzzing harness that plays random legal decks on both
engines to find the divergences no human game would reach (section 3.4). Measured play requires verified cards;
what casual play may allow is decision 6.

**Why leave Forge.** Each of these is on record in the repository, not an opinion:

| Cost of staying on Forge | Where it shows |
| --- | --- |
| The adapter is GPL-3.0-or-later and cannot be relicensed; the repository's own license is source-available with all commercial rights reserved | `THIRD-PARTY-NOTICES.md`, `LICENSE` §4 |
| A Java 17 JVM at `-Xmx2g`, Maven 3.9.11, a Swing desktop profile, and a four-minute launch deadline stand between "Launch game" and a board | `game/tools/local-game-launcher.mjs`, `game/server/local-table-runtime.mjs` |
| Any decision the bridge cannot represent falls back to "finish this choice in the engine window" | `ForgeBrowserBridge.java` `DELEGATE` path |
| Native AI is uncertified: source inspection found paths that read unrevealed opponent libraries; `AI:RemoveDeck:All` silently sidelines 13 of the pod's cards | `game/docs/c0-evidence.md`, `game/docs/ai-card-support.md` |
| Nothing that touches Forge can be proven by a cloud session or by CI; the readiness plan calls this the gap the project has been "over-trusting green suites" across | `AGENTS.md` table, `game/docs/readiness-plan-2026-09-18.md` §12 |
| Pausing mid-game is not a save; recovery exists for the opening choice only | `game/README.md`, C0 evidence |
| The static site cannot play at all; play needs a Windows host with the JDK | `game/README.md` |
| Two library cards already have no Forge script (`Baldin, Century Herdmaster`, `Notorious Sliver War`) and the pin drifts further every set | measured, section 2 |

### 1.1 Start condition and release shape (Rob, 2026-09-20)

- **OVERRIDDEN BY ROB, 2026-09-22.** He authorized phases 0 and 1 after reading
  `docs/engine/PIVOT-OR-PERSIST.md`, so the condition below no longer gates this work. It is kept
  as written because it is what was agreed on 2026-09-20 and the change should be visible.
- ~~**Nothing here starts until Track V is fully live**~~: the Gallery redesign through V.5 (Play) shipped, and live
  games 100% operational on it. The executing session confirms that with Rob before its first PR.
- **This plan and the cloud-host migration are one major product release.** The cloud migration is scoped
  separately and its plan will be updated to reflect this one. The engine is built for the local host first
  (decision 2) and must not assume it stays there (section 3.8). The go-live gate G4 and the cloud cutover are
  planned as the same release; the phases here stay in their order either way.
- **Ownership.** Rob owns the totality of CrankMagic, the play engine included, under the repository's
  Source-Available License, for personal use now and potential sale later. That license already vests everything
  in him; the one part of the product it cannot vest today is the GPL adapter, and this plan removes it. "Product
  enhancements" in this plan mean CrankMagic product releases, not engine-only drops. Section 12.5 is the
  licensing appendix: what the executing session changes in `LICENSE`, `THIRD-PARTY-NOTICES.md` and the file
  headers, and the one external constraint (Wizards' Fan Content Policy on card content) that ownership of the
  software does not remove.

**What this is not.** It is not a rewrite of the table, lobby, gateway, pilots or Play page. It is not a
translation of Forge into JavaScript. It is not a promise that every one of 30,000 cards is bug-free on day one:
correctness across a pool that size is reached asymptotically, and the plan's answer to that is a ledger that says
exactly how far each card has been proven, a harness that keeps finding the residue, and a gate that keeps
unproven cards out of measured play instead of hiding them.

---

## 2. What Forge does for CrankMagic today, measured

### 2.1 The seams

| Seam | Today | After |
| --- | --- | --- |
| Launch | `launchLocalGame(pod)` compiles three Java sources against the Forge jar and spawns `java` with the desktop module flags; writes `pod.json`, `manifest.json`, `card-mechanics.json`; polls `live-status.json` | `game/server/engine-runtime.mjs` exports the same six functions (`launchLocalGame`, `liveStatus`, `livePod`, `browserBridgeForSeat`, `resumeLocalGame`, `closeLocalGame`) and writes the same files, with the engine in a `worker_threads` Worker |
| Seat bridge | loopback HTTP per seat with a token in `browser-bridge.json`; `GET /view`, `POST /action`, `POST /concede` | in-process calls with the identical JSON envelope; `browser-bridge.json` kept as a marker for `resumeLocalGame` |
| Journal | `events.ndjson` of `CommanderProbeEvent@1`, kinds named after Forge event classes; `rng.json` tape; `final-projection.json`, `seat-N.json`, `summary.json` | same files, same kinds (the names become the contract, documented as such), plus a full serializable checkpoint |
| Card knowledge | `forge-card-index.mjs` reads 33,821 scripts; `check-my-decks.mjs`, `setup-catalog.mjs`, `doctor.mjs` depend on it | `game/engine/cards/index.mjs` reads CrankMagic's own definitions; same `resolve` and `suggest` shape |
| AI seats | `native-ai` seats are `LobbyPlayerAi` with a Forge profile; `browser` seats are human or API pilots | `house-pilot` seats: a built-in pilot that only sees its seat projection; API pilots unchanged |
| Legality | `GameType.Commander.getDeckFormat().getDeckConformanceProblem` at load | `game/engine/commander/legality.mjs` at prepare time, so a bad deck is refused before Ready Up |
| Proofs | `RulesProbe.java` (19 loss-rule assertions), `HiddenSelectionCheck`, `BridgeProtocolCheck`, `CombatAssignmentCheck`, `ShuffleAudit` | Node suites under `tests/engine-*.mjs` covering the same assertions, runnable in CI |

### 2.2 Files that name Forge, Java or the runtime (the removal list, section 10)

Adapter (9 Java files, 1,288 lines, about 115 KB): `ForgeBrowserBridge`, `ForgeLocalGame`, `ForgeProbe`, `RulesProbe`,
`HiddenSelectionCheck`, `BridgeProtocolCheck`, `BrowserContractScenario`, `CombatAssignmentCheck`, `ShuffleAudit`.

Node and scripts: `game/tools/local-game-launcher.mjs`, `build-forge.ps1`, `run-forge-probe.mjs`, `run-forge-rules.mjs`,
`verify-forge-probe.mjs`, `phase-a-engine-proof.mjs`, `phase-a-api-host.mjs`, `check-forge-hidden-selection.mjs`,
`check-bridge-parity.mjs`, `check-my-decks.mjs`, `doctor.mjs`, `setup-catalog.mjs`, `ai-compatibility.mjs`,
`export-live-pod.mjs`, `build-probe-review.mjs`, `game/contracts/forge-card-index.mjs`, `game/engine-adapter/forge.lock.json`,
`game/docs/ai-compatibility.json`, `game/evidence/c0-proof.json`.

Documents: `AGENTS.md` (the "can prove" table and the "where things are" paragraph), `THIRD-PARTY-NOTICES.md`,
`game/README.md`, `game/docs/HOW-TO-START-CRANKMAGIC-ONLINE.md`, `game/docs/readiness-plan-2026-09-18.md`,
`game/docs/ai-card-support.md`, `game/docs/c0-evidence.md`, `docs/commander-simulator-plan-2026-09-15.md`.

Machine: `C:\Users\robmi\CrankMagic\forge`, `C:\Users\robmi\CrankMagic\runtime` (JDK, Maven, `m2`), the user-level
variables `CRANKMAGIC_FORGE_ROOT` and `CRANKMAGIC_JDK_ROOT`. Agents do not delete directories they did not create;
these are Rob's to remove at gate G5.

### 2.3 The rules surface the decks and the library actually use

Measured by resolving every card to its Forge script and reading the script's ability lines. The Forge vocabulary is
used here only as a ruler; the engine's own primitive set is in section 12.2.

| Pool | Cards | Effect primitives | Trigger kinds | Static modes | Replacement events | Keywords | Cost atoms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| The seven live decks (`data/live-state.json`) | 477 distinct (all resolve) | 64 | 22 | 12 | 5 | 53 | 39 |
| The library (`data/cards.json`) | 2,367 (2 unresolved) | 112 | 49 | 23 | 15 | 124 | 106 |
| All of Forge (a proxy for the Commander-legal pool until PR 0.3 fixes the count) | 33,821 scripts | 192 | 138 | 77 | 34 | 216 | 436 |

Coverage by primitive frequency (a card counts as covered when every primitive it uses is implemented):

| Primitives implemented, most used first | 10 | 20 | 30 | 40 | 50 | 60 | 80 | 100 | 120 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Deck cards covered (of 477) | 277 | 385 | 427 | 449 | 463 | 473 | 477 | 477 | 477 |
| Library cards covered (of 2,365) | 1,062 | 1,622 | 1,908 | 2,078 | 2,172 | 2,244 | 2,321 | 2,353 | 2,365 |

The whole pool, same measure: top 20 primitives cover 23,513 of 33,821 scripts (70%), top 40 cover 28,637 (85%),
top 80 cover 32,109 (95%), top 120 cover 33,408 (98.8%), top 160 cover 33,768 (99.8%). Forty-three primitives serve
five cards or fewer each and 74 serve twenty or fewer; that is the long tail the fuzz harness exists for. Keywords
behave the same way: top 40 keyword families cover 30,511 scripts (90%), top 100 cover 32,407 (96%), and 21
keywords appear on five cards or fewer. Of the 33,821 scripts, 407 are vanilla and 1,814 are keywords only.
Forge's folder also holds cards that are not Commander-legal (silver-border, conspiracies, Vanguard, Planechase);
PR 0.3 filters the pool by Scryfall's `legalities.commander`, which removes those and their one-off constructs.

**The three vocabulary tiers.** A primitive tier alone does not bound the work, because the cards inside the top
40 primitives still touch 126 trigger kinds, 71 static modes and 211 keywords between them. A tier is therefore a
closed vocabulary across all five dimensions, and a card is in the tier when everything it uses is in the
vocabulary. Measured on the whole pool:

| Tier | Primitives | Triggers | Statics | Replacements | Keywords | Cards fully inside | Share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Go-live: top 40 primitives plus every other family used by 20 or more cards | 40 | 41 | 20 | 9 | 117 | 27,218 | 80.5% |
| Enhancement 1: top 80 primitives plus every family used by 5 or more cards | 80 | 69 | 37 | 16 | 200 | 31,878 | 94.3% |
| Enhancement 2: everything the legality filter keeps | 192 | 138 | 77 | 34 | 216 | 33,821 | 100% |

The go-live 40, in order: ChangeZone, Pump, Draw, Token, PutCounter, Cleanup, DealDamage, Mana, Effect, GainLife,
Destroy, Tap, LoseLife, Discard, PumpAll, Animate, Dig, Sacrifice, Charm, ChangeZoneAll, Mill, Counter, Untap,
DelayedTrigger, Scry, DamageAll, ChooseCard, CopyPermanent, DestroyAll, RepeatEach, GainControl, Play,
ImmediateTrigger, PutCounterAll, SetState, Regenerate, Attach, CopySpellAbility, Surveil, RemoveCounter. The
enhancement-1 40: MakeCard, ChooseType, Clone, DigUntil, PeekAndReveal, ReplaceEffect, GenericChoice, Fight,
Investigate, AnimateAll, ChooseColor, RollDice, SacrificeAll, UntapAll, ChoosePlayer, AlterAttribute, PreventDamage,
Branch, Seek, Proliferate, NameCard, Reveal, FlipCoin, RevealHand, TapAll, Amass, StoreSVar, Goad, ChooseSource,
Shuffle, AddTurn, DamageResolve, BecomeMonarch, Repeat, AddPhase, ChooseNumber, Phases, MultiplyCounter,
Protection, Connive. Note that Proliferate (D3 Atraxa) and ManaReflected (in the decks) sit outside the go-live 40
by pool frequency; tier 0 implements them anyway because the seven decks need them, and the go-live vocabulary is
"the 40 plus whatever tier 0 already built". The inventory tool prints all three lists and the closure counts.

The seven decks: D1 Quintorius Spirits, D2 Chulane Value Loop, D3 Atraxa Proliferate, D4 Felothar Walls,
D5 Shadrix Aristocrats, D6 Krenko Goblins, D7 Maralen Exile Cast. Their 64 primitives, by use:
ChangeZone 100, Mana 97, Draw 69, Token 67, Tap 55, Cleanup 41, Destroy 41, PutCounter 30, GainLife 28,
LoseLife 27, DealDamage 24, Pump 23, Proliferate 21, Charm (modal) 20, PumpAll 19, Effect (until end of turn) 16,
Dig 12, Scry 11, Discard 7, ChangeZoneAll 7, Animate 7, Counter 7, Untap 6, PutCounterAll 6, DelayedTrigger 5,
then 39 more used four times or fewer. Their trigger kinds: ChangesZone 138, Phase 23, Attacks 16, SpellCast 14,
ChangesZoneAll 8, DamageDone 5, Discarded 3, and 15 more used twice or once. Statics: Continuous 45,
CombatDamageToughness 5, CantAttack 3, Panharmonicon 2, CanAttackDefender 2, and seven singletons.
Replacements: Moved 53, Counter 2, Untap 1, AddCounter 1, Proliferate 1. Keywords: Flying 52, Defender 24,
Flash 15, Vigilance 14, Lifelink 8, Equip 8, Haste 6, Flashback 5, First strike 5, Trample 5, and 43 rarer.

The library adds 48 primitives the decks never use (AddPhase 11, WinsGame 10, DigUntil 10, Regenerate 9, Clone 7,
LosesGame 6, ChooseColor 6, RollDice 5, ReplaceToken 5, Goad 5, and 38 used four times or fewer), 27 trigger kinds,
11 static modes, 10 replacement events and 71 keywords.

### 2.4 The decision surface

The bridge today represents 20 Forge decision methods as 11 choice modes (`one`, `many`, `order`, `boolean`,
`index`, `integer`, `text`, `amount`, `damage`, `draw`, `ack`) plus the button and selection channel
(`ok`, `cancel`, `card`, `player`) and a payment block. Forge's full `PlayerController` has 110 abstract decision
methods; that list is a useful checklist of decision points a controller must be able to answer (section 12.3),
and nothing more.

---

## 3. Architecture

### 3.1 Layout

```
game/engine/
  index.mjs                 createGame(pod, {seed}) -> Game; the only public entry
  rng.mjs                   seeded PRNG (splitmix32 seeding xoshiro128**), tape record and replay
  state/                    objects, zones, players, counters, mana pool, attachments, control, timestamps
  rules/                    turn.mjs phase.mjs priority.mjs stack.mjs mana.mjs cost.mjs target.mjs
                            sba.mjs layers.mjs replacement.mjs trigger.mjs combat.mjs copy.mjs commander.mjs mulligan.mjs
  script/                   schema.mjs (CrankCardScript@1), compile.mjs, filter.mjs (selector grammar), effects/*.mjs
  keywords/                 one module per keyword family (evasion, combat, cost, cast, counters, zones)
  cards/                    index.mjs plus <letter>/<slug>.json definitions and <slug>.scenarios.json tests
  projection.mjs            seat-filtered view (CommanderProbeProjection@1) from one visibility function
  controller.mjs            the decision loop: offers choices, validates answers, receipts, revisions
  journal.mjs               CommanderProbeEvent@1 writer, state hashes, checkpoints
  pilots/                   random-legal.mjs (tests), house-pilot.mjs (the built-in AI), tape-pilot.mjs (replay)
game/server/engine-runtime.mjs   worker host; same exports as local-game-launcher.mjs
game/tools/engine-inventory.mjs  section 12.4, local-only, output committed
game/tools/engine-coverage.mjs   which cards have definitions and tests, per deck and for the library
game/tools/engine-diff.mjs       Forge differential runner (transition only)
tests/engine-*.mjs               kernel, script, cards, properties; discovered by runtests.sh
data/engine/                     oracle.json (Scryfall subset), tokens.json, banned-<date>.json
docs/engine/                     PLAN.md (this file), ADR-001-own-engine.md, divergences.md, rules-map.md
```

### 3.2 Principles the code must keep

1. **Deterministic.** All randomness goes through `rng.mjs`. Same pod, same seed, same decisions produce the same
   journal and the same state hashes. A test in the first kernel PR proves it and stays forever.
2. **One state, many projections.** The engine holds one authoritative state. Every seat, every pilot and every
   report reads through `projection.mjs`, which decides visibility from one function. No caller ever receives an
   engine object.
3. **Every decision is an offered choice.** The engine never asks a controller anything except through a choice
   record with an id, a mode, bounds and labeled options; it validates the answer against the record before
   applying it; receipts make retries idempotent. This is the existing contract; section 12.1 pins it.
4. **Checkpointable.** Game state is plain data. A checkpoint is `structuredClone(state)` plus the RNG position and
   the pending choice. Resume from any decision is a first-class feature, not a recovery hack.
5. **Rules by the Comprehensive Rules, cards by oracle text.** Each rules module cites the CR section it
   implements in its header comment. Each card definition is written from Scryfall oracle text and carries the
   text it was written from, so a definition can be re-checked when the text changes.
6. **Unsupported is loud.** A card without a definition, or a definition that declares a construct the engine does
   not implement, blocks measured play at prepare time (readiness plan §10.5). Never a no-op, never a warning.
7. **No build step, no dependency, both runtimes.** Plain ESM that runs in Node 22+ and in a browser Worker.
   `node:crypto` and WebCrypto are abstracted in one file; nothing else is platform-specific.

### 3.3 The kernel (CR sections to implement, in order)

| Module | CR sections | Notes |
| --- | --- | --- |
| objects, zones, characteristics | 108 to 110, 400 to 406, 110.5 tokens, 111 copies | stable object ids, timestamps, zone-change replaces the object (400.7) |
| turn structure | 500 to 514 | untap, upkeep, draw, main, combat steps, end, cleanup; extra turns and phases |
| priority and the stack | 117, 405, 601, 608 | APNAP for simultaneous triggers (603.3b), split second and flash later |
| mana and costs | 106, 107, 118, 601.2, 605 | mana abilities do not use the stack; cost atoms in 12.2; payment offered as one choice with automatic legal payment (matches the existing `payment.automaticEligible`) |
| targeting | 115, 601.2c, 608.2b | illegal targets on resolution; partial fizzle |
| state-based actions | 704 | the loss conditions the Java `RulesProbe` asserted, ported red-first |
| triggered abilities | 603 | leaves-the-battlefield look-back (603.10), intervening if |
| replacement and prevention | 614, 615 | affected object's controller orders (616.1) |
| continuous effects and layers | 611 to 613 | the layer system with timestamps and dependency (613.8) |
| combat | 506 to 511 | multiple defenders, planeswalkers as defenders, damage assignment order, trample, first and double strike, lifelink, deathtouch, infect, wither |
| copy and tokens | 707, 111 | token definitions from `data/engine/tokens.json` |
| commander | 903 | command zone, tax, color identity, 21 combat damage from one commander, partner, the command-zone replacement choice |
| mulligan | 103.4 | London mulligan, four players |
| keywords | 702 | as needed by the tier |

### 3.4 The card script

`CrankCardScript@1` is a JSON document per card, validated by `game/engine/script/schema.mjs`:

- `identity`: name, oracle id, faces, types, mana cost, colors, color identity, P/T or loyalty or defense.
- `abilities[]`: `spell`, `activated`, `triggered`, `static`, `replacement`, `keyword`, each with `cost`, `targets`,
  `condition`, `effects[]`, `zones`, `optional`, `text` (the oracle sentence it implements).
- `effects[]`: a primitive name from section 12.2 with typed parameters; `modal` and `sequence` and `repeatFor`
  compose them; `until` durations; `x` bindings.
- `selectors`: a small grammar for "creature you control", "another target creature", "each opponent", "token",
  "with mana value 2 or less", compiled by `filter.mjs` and tested on its own.
- `reveals`: what information this card's effects expose and to whom, so the projection can be checked.

**Where definitions come from, at pool scale.** Tier 0 definitions are authored by the executing session from oracle
text, one batch per PR, each with a scenario test (`<slug>.scenarios.json`: a starting position, a sequence of
decisions, and assertions on the resulting projection). That is how the primitive set and the schema get shaped by
real cards. It does not scale to 30,000 cards, so from tier 1 onward definitions come from a pipeline. Rob's
decision (2026-09-20): **the compiler is the default path for every card, and a hand-authored definition wins
wherever one exists.** The parser is a free pre-pass that feeds the compiler, not a competing path.

1. **Model compiler** (`game/tools/engine-compile.mjs`), the default. It calls the Claude API with the schema as a
   tool definition, the oracle text, the parser's pre-pass result and the primitive catalog, and receives a script.
   Every result is schema-validated, smoke-tested (the card can be cast or activated in a fixture game without
   throwing, and its declared reveals match what the projection shows) and, while Forge exists,
   differential-checked in fuzzed games. The key is read from Windows Credential Manager through
   `read-windows-credential.ps1`, the way the OpenAI pilot's is; the plan assumes the generic credential is named
   `crankmagic_anthropic_api` and the executing session confirms the name with Rob before the first call. Cost and
   pass rate are measured on a 200-card sample before the pool run and reported to Rob.
2. **Template pre-pass** (`game/engine/script/parse.mjs`), deterministic, from oracle text. Magic's oracle text is
   heavily templated: keyword lines; "When/Whenever/At [event], [effect]"; "[cost]: [effect]"; "[selector] get
   +N/+N"; "as long as"; "you may"; "unless"; "instead". Its partial result goes to the compiler as a hint. For
   keyword-only and vanilla cards (1,814 and 407 in Forge's count) the pre-pass result is complete and no API call
   is made; the ledger records those as source `parser`.
3. **Hand-authored**, which wins over a compiled definition whenever it exists. Sources: Rob's uploads (dropped
   into `data/engine/hand/<oracle-id>.json`, picked up by the coverage tool), definitions worked out with Claude in
   chat and committed by the session, the residue the compiler cannot make pass, and every adjudicated divergence.
   The ledger records source `hand` and the evidence that came with it.

**The support ledger** (`data/engine/support.json`) records, per oracle id: `status` of `verified` (a scenario test
or adjudicated differential evidence), `compiled` (schema-valid and smoke-tested, no behavioral evidence), or
`unsupported` (no definition, or a construct the engine does not implement); the oracle-text hash it was compiled
from; the source (parser, compiler, hand); and pointers to its evidence. Prepare shows each card's status. Measured
play requires every card `verified`; which statuses casual play may seat is decision 6. A card whose oracle text
hash changes is demoted to `unsupported` until recompiled.

**The fuzz harness** (`game/tools/engine-fuzz.mjs`) builds random legal decks from the pool (singleton, color
identity, a random commander), plays seeded games with random-legal pilots, and, while Forge exists, replays the
same decisions on Forge through the tape pilot. Every exception and every divergence is filed automatically with a
minimized reproduction (pod, seed, decision tape) into `docs/engine/divergences.md` for adjudication. No human
plays 30,000 cards; this is what does.

**Set refresh** (`.github/workflows/engine-cards.yml`, modeled on `live-load.yml`) pulls the Scryfall bulk, diffs
oracle ids and oracle-text hashes, updates the banned-list snapshot, marks changed cards `unsupported`, commits the
data, and lists what needs compiling. Where the compile step runs is decision 7.

The coverage tool reports, per deck and for the pool: definition present, status, primitives supported.

### 3.5 The controller contract

Unchanged from today's bridge so that `crankmagic-game.js`, `game/ui/*`, `ai-pilot.mjs`, `api-choice-provider.mjs`,
`force-advance.mjs`, `table-broker.mjs`, `guest-gateway.mjs`, `match-telemetry.mjs` and `match-report.mjs` do not
change in the transition. Section 12.1 pins the envelope. Two additions: `view()` gains `engine: "crank"` and a
`checkpoint` revision; `action` gains kind `resume` for the host only.

### 3.6 The pilots

- `random-legal`: picks uniformly from enumerated legal actions; used by the termination and determinism tests.
- `house-pilot`: replaces native Forge AI. It sees only its seat projection (by construction: it is handed the same
  `view` a browser seat gets). It enumerates candidates exactly as `buildPilotCandidates` does today, scores them
  with `card-classify.js` roles, the deck's graph strategies and `pilot-policy.mjs` budgets, and spends its
  `rolloutLimit` on short deterministic rollouts against the engine in the same worker. Difficulty changes search
  effort, never information.
- API pilots: unchanged; they already consume the `view` contract.
- `tape-pilot`: records and replays decisions by choice id and option label; used by the differential runner.

### 3.7 Hosting

The host keeps `serve-review.mjs`, the broker and the gateway. `engine-runtime.mjs` starts one Worker per match,
streams the journal to the same game directory, and answers `browserBridgeForSeat(seatId, op, body)` by posting to
the worker. `CRANKMAGIC_ENGINE=forge|crank` selects the runtime until gate G4; the default flips at G4 and the
flag is removed at G5. Later (phase 11), the same engine module loads in a Web Worker from `crankmagic-game.js` so
the static site can run a solo table with house pilots and no host.

### 3.8 Cloud-host readiness

The engine is built on the local host first and moves to the cloud in the same release. So that the migration plan
finds nothing to undo, the engine keeps these constraints from the first commit, each held by a test:

- No filesystem assumption inside `game/engine/`. The journal, checkpoints and the card index go through one
  storage adapter (`game/engine/storage.mjs`) whose local implementation writes the game directory and whose cloud
  implementation is the migration plan's to supply.
- No Windows-only path, credential or process call inside the engine or the runtime; those stay in `game/tools/`.
- A match is a value: pod, seed, decision tape and checkpoint. A match can be moved between hosts by copying those
  four things, and a test proves a checkpoint taken on one process resumes identically on another.
- The bridge envelope is the only interface; the runtime never exposes engine objects, so a network boundary can
  be inserted at `browserBridgeForSeat` without touching the page layer.
- Seat visibility is enforced inside the engine, not by the host, so a cloud host that serves many tables cannot
  leak a hand by a routing mistake.
- Everything the fuzz and differential tooling needs from Personal-HP (Forge, the JDK) stays in `game/tools/` and
  the oracle folder, never in the runtime.

---

## 4. Data and knowledge required

| Need | Source | Where it lands | Notes |
| --- | --- | --- | --- |
| Oracle data with faces, layouts, loyalty, defense, produced mana, `all_parts` token links, legalities, for every Commander-legal card | Scryfall bulk `oracle_cards` (fetched by `tools/build-engine-cards.mjs`, cached under `game/.local/`), filtered by `legalities.commander` | `data/engine/oracle.json` (whole pool; tens of megabytes, so stored compact and loaded lazily by the index), `data/engine/support.json` | `data/cards.json` already has `oracleText`, `keywords`, `typeLine`, `manaCost`, `colorIdentity`, `mechanics`, `roles`, `causes`, `produces`, but not faces, layout, loyalty or token parts, and only 2,367 cards |
| Token definitions for the whole pool | Scryfall token objects reached through `all_parts` | `data/engine/tokens.json` | 67 deck cards and 316 library cards create tokens; the pool count comes from the pull |
| A primitive catalog the compiler can read | generated from `game/engine/script/effects/*.mjs` headers | `data/engine/primitives.json` | the compiler's tool definition; regenerated by a test when an effect module changes |
| The oracle-text templates the parser must know | the Comprehensive Rules glossary (CR 702 keyword actions and abilities, 701 keyword actions) and the pool's own text, mined by a frequency tool | `docs/engine/templates.md` | written before `parse.mjs`, red-first, from the pool's most frequent sentence shapes |
| Comprehensive Rules | WotC's published text, pinned by URL and effective date in `docs/engine/rules-map.md` | not committed (WotC copyright); the map lists the sections each module implements | the executing session reads it at build time |
| Commander rules and banned list | Commander Rules Committee text, dated | `data/engine/banned-<date>.json` | legality check at prepare time |
| The seven decks and the library | `data/live-state.json`, `data/cards.json` | unchanged | the scope ladder |
| Deck strategies, loops, roles for the house pilot | `data/graph.json`, `crankmagic-loops.js`, `crankmagic-strategies.js`, `card-classify.js` | unchanged | reused, not rewritten |
| Existing proofs to port | `RulesProbe.java` assertions, `HiddenSelectionCheck`, `BridgeProtocolCheck`, the seed-42 pod (Chulane, Krenko, Atraxa, Shadrix) | `tests/engine-loss-rules.mjs`, `tests/engine-hidden-info.mjs`, `tests/engine-bridge-contract.mjs`, `game/fixtures/` | red-first ports |
| Forge as oracle (transition only) | the pinned checkout and JDK | `game/tools/engine-diff.mjs` | behavior comparison only; no script or source is read into the repository |
| Rules knowledge the session must hold | layers and timestamps (613), replacement ordering (616), APNAP (603.3b), look-back triggers (603.10), copy rules (707), commander (903), damage assignment (510) | `docs/engine/rules-map.md` | each module's header cites its sections |

---

## 5. Technical infrastructure

| Item | Today | Needed |
| --- | --- | --- |
| Runtime | Node 24 on Personal-HP (codex bundle), Node 22 in CI; no npm anywhere | same; the engine is ESM with zero dependencies |
| Test discovery | `runtests.sh` runs `tests/*.mjs` and `game/tests/*.test.mjs`; CI runs both | new suites named `tests/engine-*.mjs`; engine card scenarios run through one suite that loads `cards/*/*.scenarios.json` |
| CI | `.github/workflows/tests.yml`, Ubuntu, Playwright for the browser suite | engine suites run in CI for the first time; the Forge differential runner is local-only and its output is committed as evidence |
| Host | `serve-review.mjs` on port 8768, `start-crankmagic.ps1`, `doctor.mjs` | `engine-runtime.mjs` behind the flag; doctor gains an "engine cards" check and drops Java and Forge checks at G5 |
| Concurrency | none in the engine path (Java process) | `worker_threads` in Node, `Worker` in the browser; message envelope = the bridge envelope |
| Randomness | Forge `MyRandom` replaced by `TapeRandom` | `rng.mjs` with a recorded tape and replay; `crypto.getRandomValues` for the match seed |
| Hashing | SHA-256 via Java | `node:crypto` or WebCrypto through one adapter |
| Persistence | game directory files listed in 2.1 | same files plus `checkpoint.json` at each pending choice |
| Rendering proof | `node tools/render-routes.mjs`, `screens/*.dc.html` at 1280 px | unchanged; the Play page must render identically on both engines during the transition |
| Performance budgets (enforced by a test) | Forge: tens of seconds to boot | engine boot under 200 ms with the pool index loaded lazily; `view()` under 2 ms; legal-action enumeration under 5 ms; a full four-player game with random-legal pilots under 3 s headless; 64 house-pilot rollouts per decision under 300 ms; the fuzz harness at 1,000 games per hour on Personal-HP |
| Schema registry | `schema/index.mjs`, `schema/validate.mjs` | entries for `data/engine/*.json` and `CrankCardScript@1` |
| Compile pipeline | none | `engine-compile.mjs` calling the Claude API with the key from Windows Credential Manager (Rob has stored it; assumed name `crankmagic_anthropic_api`, confirmed before the first call) through `read-windows-credential.ps1`, never a key in a file, a page, a URL or a log; batch, resumable, idempotent by oracle-text hash; the `claude-api` skill is read before the first call for model ids, tool use and pricing |
| Fuzz and differential runs | none | `engine-fuzz.mjs` and `engine-diff.mjs` as a scheduled local task (Task Scheduler on Personal-HP) while Forge exists; results committed as evidence, never as a green claim |
| Set refresh | `live-load.yml` (workbook) as the pattern | `engine-cards.yml`, manual dispatch, commits data and the list of cards needing compilation |

---

## 6. Phases, PRs and gates

Status column is for the executing session to keep current. Estimates are in agent sessions ending at the 95% usage
pivot; they are estimates.

| Phase | PRs (one topic each) | Gate to leave the phase | Est. sessions | Status |
| --- | --- | --- | ---: | --- |
| **0. Decisions and scaffolding** | 0.1 `docs/engine/ADR-001-own-engine.md` (this plan is already at `docs/engine/PLAN.md`), `CRANKMAGIC_ENGINE` flag read by `serve-review.mjs` (default `forge`), `game/engine/` skeleton with `createGame` throwing "not implemented", `tests/engine-skeleton.mjs`. 0.2 `game/tools/engine-inventory.mjs` and its committed output `game/docs/engine-inventory.json`. 0.3 `tools/build-engine-cards.mjs`, `data/engine/oracle.json` and `tokens.json` for the whole Commander-legal pool (the count is fixed here), a whole-pool `support.json` with every card `unsupported`, schema entries. | Rob has answered the seven decisions in section 9; suite green in CI with the new suites | 1 to 2 | | **DONE 2026-09-22** — PR #353. 0.1 scaffold + ADR-001 + CRANKMAGIC_ENGINE flag (default forge) + engine-skeleton/engine-headers suites; 0.2 inventory moved to game/tools/ with paths resolved, output reproduced exactly; 0.3 pool fixed at **31,830** Commander-legal cards, 1,091 tokens, every row unsupported. 110 suites green. |
| **1. Kernel without cards** | 1.1 rng, state, zones, objects, players, journal, hashes, determinism test. 1.2 turn structure, priority, stack, controller loop with the section 12.1 envelope, `random-legal` pilot, termination test on basic lands and vanilla creatures. 1.3 mana, costs, payment choice. 1.4 combat with multiple defenders and damage assignment (`damage` mode). 1.5 state-based actions and the loss rules ported from `RulesProbe.java`. 1.6 triggers with APNAP and look-back. 1.7 replacement and prevention. 1.8 layers. 1.9 commander rules and London mulligan. 1.10 projection and the hidden-information property test. | a four-player game of vanilla creatures and lands with commanders runs to completion for 1,000 seeds with no exception, same hash on replay, no hidden card in any seat projection | 4 to 6 | | **IN PROGRESS** on `claude/engine-scaffolding`. 1.1 done: `rng.mjs` (splitmix32 seeding xoshiro128**, rejection sampling, downward Fisher-Yates, resumable checkpoint), `journal.mjs` (`CommanderProbeEvent@1` with the `eventId` and `visibility` the existing readers key off, key-order-blind state hash), `state/` (one object in one zone; a zone change makes a new object, CR 400.7). 1.2 done: `rules/turn.mjs` (CR 500-514, Forge's phase names, CR 103.8a as a two-player rule, CR 506.5 skipping unattacked combat steps), `rules/stack.mjs` (CR 405, 608; the card really is in the stack zone, an ability is not its source), `rules/priority.mjs` (CR 117; consecutive passes, active player after a resolution, the dead never waited for), `controller.mjs` (the §12.1 envelope ported validator for validator, receipts, revisions), `rules/actions.mjs` + `pilots/random-legal.mjs` (enumerated legality; a four-player forty-turn game of lands terminates, replays to the same hash and a byte-identical journal). 1.3 done: `rules/mana.mjs` (CR 106, 107, 202.3; the three hybrids that do not pay alike, {C} as a requirement rather than a generic symbol, X zero off the stack, and no automatic payment when more than one is legal) and casting in `rules/actions.mjs` (CR 601.2, 605.3a, 307.1, 304.1; a mana ability that never touches the stack, sorcery speed and instant speed as two separate tests). A four-player thirty-turn game with creatures terminates, casts, resolves and replays exactly. 1.4 done: `rules/combat.mjs` (CR 506-511; every attacker chooses its own defender, summoning sickness as control rather than entering, CR 510.1c damage assignment through the ported `damage` validator, simultaneous damage). 1.5 done: `rules/sba.mjs` (CR 704, 903.10; the Java RulesProbe's Commander loss assertions carried across -- two commanders not pooled, life gain not erasing the tally, noncombat commander damage not counting, an empty library not a loss until you draw). 1.6 done: `rules/trigger.mjs` (CR 603; a trigger waits for priority, APNAP puts the active player's on first so it resolves last, a player orders their own, the intervening "if" is checked when it would trigger, and the leaves-the-battlefield look-back falls out of the event envelope rather than needing a shadow board). Next: 1.7 replacement and prevention. |
| **2. Card script and compiler** | 2.1 schema, filter grammar with its own tests. 2.2 effect primitives for the top 25 deck primitives. 2.3 keyword families for the 53 deck keywords. 2.4 `engine-coverage.mjs`, scenario runner suite, `cards/index.mjs` with `resolve` and `suggest`. | the primitives and keywords the seven decks need exist and each has a unit test; the coverage tool runs | 2 to 3 | |
| **3. Tier 0, the seven decks** | one PR per batch of 40 to 60 cards, ordered by primitive frequency; each card with a scenario test; `check-my-decks.mjs` gains an engine mode | **G1**: all seven decks load; 100 seeded full games per deck against three house pilots and 100 against random-legal pilots, zero engine exceptions, every game terminates; determinism holds; hidden-information test passes on these decks | 4 to 8 | |
| **4. Host integration behind the flag** | 4.1 `engine-runtime.mjs` with the six launcher exports and the game directory files. 4.2 `house-pilot` seats replacing `native-ai` in `setup-catalog.mjs` and the pod. 4.3 doctor, check-my-decks, setup catalog and prepare legality on the engine index. 4.4 Play page rendered on both engines, before and after; a real table to turn 3 with a saved journal (readiness §10.3) | **G2**: one human plus three house pilots to a finished game in the browser; a four-seat lobby game through the guest gateway; match report and telemetry produced from the engine journal | 2 to 3 | |
| **5. Differential verification** | 5.1 `tape-pilot`. 5.2 `engine-diff.mjs`: same pod and seed on both engines, decisions recorded on one and replayed on the other, per-priority normalized state compared. 5.3 `docs/engine/divergences.md` with every divergence adjudicated against the CR (Forge can be wrong too). 5.4 port `HiddenSelectionCheck` and `BridgeProtocolCheck` | **G3**: at least 30 seeded games per deck with every divergence adjudicated and the engine-side ones fixed | 2 to 3 | |
| **6. Tier 1, the library, and the pipeline** | 6.1 `docs/engine/templates.md` from a frequency tool over the pool's oracle text. 6.2 `parse.mjs` red-first against the templates, measured by how many library cards it fully parses. 6.3 the primitive catalog and `engine-compile.mjs` on a 200-card sample, with cost and pass rate reported. 6.4 the support ledger and its display at prepare; Game setup shows engine status instead of Forge AI warnings. 6.5 `engine-fuzz.mjs` with automatic filing. 6.6 the remaining library primitives (48), triggers (27), statics (11), replacements (10), keywords (71), in batches by usage | **G4a**: every library card is `verified` or `compiled`, none `unsupported` except the two Forge also lacks; the parser's share and the compiler's pass rate are reported; 500 fuzzed library games with every divergence adjudicated | 4 to 7 | |
| **7. Go-live vocabulary over the pool** | 7.1 the whole-pool support ledger, every card `unsupported`, each carrying the constructs it needs so prepare can name what is missing. 7.2 the go-live vocabulary closed: the top 40 primitives (plus what tier 0 built), the 41 trigger kinds, 20 static modes, 9 replacement events and 117 keyword families used by 20 or more cards, one PR per family, red-first. 7.3 parser and compiler runs over every card inside the vocabulary, in batches by frequency, each batch a PR carrying its ledger delta. 7.4 nightly fuzz and differential runs over random decks drawn from the in-vocabulary set; the residue and every divergence hand-authored. 7.5 `engine-cards.yml` set refresh, exercised on one real release | **G4**: every in-vocabulary card (about 27,200) is `verified` or `compiled`; every other card is refused at prepare with the construct it needs named; the `verified` share is reported and Rob accepts it (decision 6); zero exceptions across 5,000 fuzzed random-deck games; a set refresh has run end to end; default flag flips to `crank` | 5 to 10 | |
| **8. Cutover: Forge leaves the product** | 8.1 a game night on the new engine (Rob), including one deck nobody at the table has played before. 8.2 the GPL adapter and the Forge tools move out of the repository to `C:\Users\robmi\CrankMagic\forge-oracle\` (local-only, not a git remote of this repository), keeping `engine-diff.mjs` working from there; the section 10 list is removed from the product in one PR; notices, README, AGENTS, doctor and CI updated. 8.3 the JDK stays on the machine only for the oracle | **G5**: no Forge or Java reference in the repository outside history documents; suite green in CI; doctor green with no JDK on the PATH; the differential runner still runs from the oracle folder | 1 to 2 | |
| **9. Enhancement 1** | the next 40 primitives and every trigger, static, replacement and keyword family used by 5 or more cards, one PR per family; parser and compiler runs over the newly in-vocabulary cards; fuzz and differential against the oracle folder | **G6**: about 31,900 cards (94.3%) `verified` or `compiled`; zero exceptions across 5,000 fuzzed games from the enlarged set | 3 to 6 | |
| **10. Enhancement 2** | the remaining 112 primitives and every remaining family the legality filter keeps; many of the 112 are one-card constructs and each gets a scenario rather than a parser rule; the last differential runs; then Rob deletes `forge`, `runtime` and `forge-oracle` | **G7**: every Commander-legal card `verified` or `compiled`; no card refused at prepare for a missing construct; the fuzz harness runs without Forge on invariants and exceptions alone | 4 to 8 | |
| **11. Static-site play (after)** | engine in a Web Worker from the Play page; solo table without the host; save and resume; the pool index loaded on demand | a game on GitHub Pages with no host running | 2 to 3 | |

To go-live (phases 0 to 8): 24 to 43 sessions. Enhancements 1 and 2: 7 to 14 more. Phase 11 optional. Phase 7 is
the widest range because it depends on the parser's share and the compiler's pass rate, both of which phase 6
measures before phase 7 starts. That measurement is the first point at which this estimate should be replaced by
a better one.

---

## 7. Testing strategy

| Layer | What | Where | Red-first rule |
| --- | --- | --- | --- |
| Kernel units | one suite per rules module, each test naming the CR clause it proves | `tests/engine-<module>.mjs` | the clause is asserted before the module implements it |
| Script units | schema validation, selector grammar, each effect primitive in isolation | `tests/engine-script.mjs`, `tests/engine-effects.mjs` | |
| Card scenarios | a starting position, decisions, assertions; at least one per card, more for commanders and engines | `game/engine/cards/<letter>/<slug>.scenarios.json`, run by `tests/engine-cards.mjs` | a card's definition PR adds its scenarios first |
| Properties | determinism (same seed, same hash), termination (random-legal games end), hidden information (no invisible card in any projection), legality (no action outside the enumerated set is ever accepted), receipts (a retried action applies once) | `tests/engine-properties.mjs` | |
| Contract | the `view` and `action` envelope, the 11 choice modes, the event kinds consumed by reports | `tests/engine-bridge-contract.mjs`, existing `bridge-parity` and `decision-ui` suites | |
| Differential | Forge versus engine on recorded decisions | `game/tools/engine-diff.mjs`, local only, evidence committed | |
| Fuzz | random legal decks from the pool, seeded games, random-legal pilots; exceptions, invariant violations and (while Forge exists) divergences filed with a minimized reproduction | `game/tools/engine-fuzz.mjs`, scheduled locally, results committed | a filed reproduction becomes a red scenario before its fix |
| Compiler | schema validity, smoke test, declared reveals versus projection, pass rate on the 200-card sample | `tests/engine-compile.mjs` over committed fixtures; the live API call is never in the suite | |
| Existing suites | the 71 suites in `tests/` and 29 in `game/tests/` keep passing; `feature-wiring` ratchets hold | `runtests.sh` | |
| Live | a real table to turn 3 with a journal; a full game; a four-seat lobby | readiness plan §10 and §12 | |
| Performance | the budgets in section 5, asserted in a suite that skips itself only when `ENGINE_PERF_REQUIRED` is unset | `tests/engine-perf.mjs` | |

---

## 8. Risks

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Rules long tail: layers, replacement ordering, copy effects, control changes | wrong outcomes that look plausible | CR-cited units; differential runner; adjudicated divergence log; unsupported constructs refuse at prepare |
| Thirty thousand cards cannot all be right at once | a player brings a card that misbehaves | the support ledger makes the residue visible per card at prepare; measured play needs `verified`; the fuzz harness keeps finding the residue after Forge is gone; a misbehaving card is demoted, reproduced and fixed, not argued about |
| The compiler produces plausible, wrong scripts | silent misbehavior at scale | schema, smoke test, declared reveals checked against the projection, differential fuzzing against Forge while it exists, and `compiled` never counts as `verified` |
| Forge is not ground truth either | a divergence adjudicated the wrong way | every divergence is adjudicated against the Comprehensive Rules and logged with the clause; agreement with Forge is evidence, not proof |
| The card script grows into a second Forge | unbounded scope | the primitive set is closed per tier and listed in 12.2; a new primitive needs a test, a catalog entry and a fuzz pass; constructs the legality filter removes are never implemented |
| License contamination by copying Forge | undermines the reason to leave | decision 1; the executing prompt forbids reading Forge scripts into the repository; the inventory tool reads Forge only to count |
| Game nights depend on the Forge path meanwhile | a broken Thursday | the flag keeps Forge default until G4; both paths render the same Play page |
| Two sessions in the repository at once (Track V and this) | conflicting branches and a contested baton | decision 3; the engine work touches `game/engine/`, `game/server/`, `game/tools/`, `tests/engine-*`, `data/engine/`, `docs/engine/` and nothing in the page layer until phase 4.4 |
| House pilot weaker than Forge's native AI at first | worse practice games | difficulty budgets already exist; rollouts are cheap in a JS engine; API pilots remain available |
| Performance in the browser Worker | phase 8 stalls | budgets asserted from phase 1; state is plain data |
| Estimate error | the schedule slips | gates are behavioral, not calendar; the status table is updated at every pivot |

---

## 9. Decisions, all answered by Rob on 2026-09-20

The executing session works under these as settled. It does not reopen them.

1. **License: full ownership of the whole of CrankMagic, the play engine included.** Everything is Rob's under
   the repository's Source-Available License, for personal use now and potential sale later; the engine and its
   card definitions join that whole and never carry anyone else's license. Clean room: written from the
   Comprehensive Rules and Scryfall oracle text; Forge is a behavioral oracle only; no Forge script, source or data
   is copied, translated or paraphrased into the repository; the GPL exception in `LICENSE` §4(a) is removed at
   go-live when the adapter leaves the product. Section 12.5 has the exact edits and the constraint that survives.
2. **Local host first, then the cloud.** The cloud-host migration is scoped separately, its plan will be updated to
   reflect this one, and the two ship as one major release. Section 3.8 keeps the engine ready for it.
3. **Sequencing: Track V fully live first.** The Gallery redesign through Play ships and live games run 100%
   operational on it; then this plan and the cloud migration kick off together. No engine PR opens before Rob
   confirms that.
4. **Forge's fate: out of the product at go-live, kept as a local-only oracle until enhancement 2 ends.** At G5
   the GPL adapter and the Forge tools leave the repository for `C:\Users\robmi\CrankMagic\forge-oracle\`, so the
   product carries no GPL code while the differential runner still works for the enhancement phases. After G7 Rob
   deletes `forge`, `runtime` and `forge-oracle`; agents do not delete directories they did not create.
5. **Card definitions: the compiler is the default; hand-authored definitions win wherever one exists.**
   Hand-authored input arrives by Rob's uploads, by work with Claude in chat, and from the session's own residue
   and divergence fixes (section 3.4). Tier 0 is hand-authored because it shapes the schema. The compiler's cost
   and pass rate are measured on a 200-card sample in PR 6.3 before any pool run, and the number is brought to Rob
   before it is spent.
6. **What may sit at a table.** Measured play requires every card `verified`; casual play seats `compiled` cards
   behind a visible per-card label; `unsupported` always blocks. Rob sets the `verified` share he wants before the
   default flag flips at G4. (Recommended defaults, standing until Rob changes them.)
7. **The API key is in Windows Credential Manager.** Compilation runs on Personal-HP reading it through
   `read-windows-credential.ps1`; the refresh workflow on GitHub commits data and lists what needs compiling but
   never compiles. The credential's generic name is confirmed with Rob before the first call.

Also decided: the finish line is any Commander-legal hundred (section 1); go-live on the top 40 primitives, the
next 40 as enhancement 1, the remaining 112 as enhancement 2 (sections 2.3 and 6).

Still open, small: the pooled commander damage house option from the 2026-09-15 plan is implemented as a labeled
rules option in `commander.mjs` or dropped. Default: dropped until asked.

---

## 10. Removal checklist (phase 8, one PR)

- Move to `C:\Users\robmi\CrankMagic\forge-oracle\` (the differential runner needs them until G7): `game/engine-adapter/`
  (all nine Java files, `forge.lock.json`), `game/tools/build-forge.ps1`, `run-forge-probe.mjs`, `run-forge-rules.mjs`,
  `verify-forge-probe.mjs`, `game/contracts/forge-card-index.mjs`, and `engine-diff.mjs` itself, with a README saying
  the folder is GPL-derived, local-only, and not part of the product. The move is a file copy plus a git deletion;
  the folder is never a remote of this repository.
- Delete from the repository: `phase-a-engine-proof.mjs`, `phase-a-api-host.mjs`, `check-forge-hidden-selection.mjs`,
  `check-bridge-parity.mjs` (ported), `build-probe-review.mjs`, `ai-compatibility.mjs`, `export-live-pod.mjs` (or
  repoint), `game/docs/ai-compatibility.json`, `game/tests/forge-card-index.test.mjs` (replaced by the engine index
  test).
- Replace in `local-game-launcher.mjs` (deleted; `engine-runtime.mjs` is the launcher), `doctor.mjs` (no Java, no
  Forge database checks), `check-my-decks.mjs` (engine index only), `setup-catalog.mjs` (engine index only),
  `serve-review.mjs` (flag removed).
- Documents: `THIRD-PARTY-NOTICES.md` (Forge section becomes a historical note that no GPL code remains),
  `AGENTS.md` (the "can prove" table loses the Forge and Java rows; the "where things are" paragraph loses `forge`
  and `runtime`), `game/README.md` rewritten, `HOW-TO-START` rewritten, `readiness-plan` §12 steps 2 and 3 replaced,
  `docs/engine/` gains the closing status.
- Environment: `CRANKMAGIC_FORGE_ROOT`, `CRANKMAGIC_JDK_ROOT` no longer read by the product; the oracle folder reads
  them until G7, after which Rob removes the variables and the `forge`, `runtime` and `forge-oracle` directories.
- CI: no change needed; the engine suites already run. `tests.yml` comment updated.
- Memory: the `mtg-crankmagic-dev-topology` note is updated by whoever does the removal.

---

## 11. Execution rules (restating Rob's standing rules for this work)

- Read `AGENTS.md`, `docs/ACTIVE.md`, the Fable handoff §4 and this plan before anything.
- Branch `claude/engine-<topic>`; one PR per topic; draft PR when handing off; push before stopping.
- Every change starts with a test that was red, named in the commit message.
- Full suite before every push: `PAGE_BUDGET_REQUIRED=1 GEOMETRY_REQUIRED=1 bash runtests.sh -q`, with Chrome through
  `UAT_PLAYWRIGHT` and `UAT_CHROME`; gate on the exit code, never chain a commit after the run.
- Merge only on a CI result read after the run; pending is not green; merge commit or rebase, not squash.
- Render every visible change before and after with `node tools/render-routes.mjs`, beside `screens/*.dc.html` at
  1280 px, and show it in chat.
- Never touch `data/deck-ratings.json`, `data/simulation-summary.json`, `sim/`, `data/deck-guides.json`.
- American English everywhere; the ratchet in `tests/feature-wiring.mjs` only goes down.
- Never copy, translate or paraphrase Forge scripts or source. Reading them to count is the only permitted use.
- Every engine file carries Rob's copyright header (section 12.5); card text stays in the card directories by
  convention, at no extra cost; the API key is read from Windows Credential Manager only.
- No engine PR before Rob confirms Track V is fully live and operational (section 1.1).
- Prove Forge claims on this machine only; say "unproven" for anything a cloud session did.
- At 95% usage: update section 6's status table, commit, merge what is green, update `docs/ACTIVE.md` last.

---

## 12. Appendices

### 12.1 The controller contract (pinned; today's bridge, kept)

`GET view` returns:

```
{ viewerSeatId, viewerPlayerId, revision, engine,
  state: CommanderProbeProjection@1 { schema, turn, turnPlayerId, priorityPlayerId, phase,
         players[{ playerId, name, life, health{...commander damage, poison}, counters, mana[], zones{Library,Hand,Battlefield,Graveyard,Exile,Command:{count,hiddenCount,cards[]}} }],
         combat{attackingPlayerId, defenders[], attacks[{attacker, defender, blocked, blockers[]}]} | null,
         stack[{stackId, abilityId, cardId, name, faceDown, playerId, kind: spell|trigger|ability, stage, targets[]}], stackSize, gameOver },
  ui: { prompt, ok, cancel, okEnabled, cancelEnabled, selectables[], selectableCards[{cardId,name,faceDown}],
        choice: null | { id, title, mode, min, max, options[{index,label,...}], selectedIndices?, initial?, numeric?, choiceKind?, toTop?, toBottom?, toAnywhere?, cardId?, autoSelect?, total?, minEach?, overrideOrder?, divide?, maySkip? },
        nativeFallback: "" (always empty on the engine), inputType, payment: null | {abilityId, sourceId, triggered, automaticEligible},
        cardActions{cardId: description}, highlightedPlayers[], highlightedCards[], actionInFlight, lastAction } }
```

Choice modes: `one`, `many`, `order`, `boolean`, `index`, `integer`, `text`, `amount`, `damage`, `draw`, `ack`.

`POST action` body: `{ actionId (uuid), revision, kind: ok|cancel|card|player|answer, targetId?, choiceId?, indices?, value?, amounts?, skip?, text?, cancel? }`;
validated against the pending choice exactly as `ForgeBrowserBridge.action` does (revision match, choice id match,
bounds, damage assignment order, generic amounts, manipulate order); receipts keyed by `actionId`.

`POST concede`: `{accepted, conceded}`.

Journal kinds consumed by `match-report.mjs`, `match-telemetry.mjs` and the pilots, kept by name:
`GameEventSpellAbilityCast`, `GameEventSpellResolved`, `GameEventTurnPhase`, `GameEventPlayerPriority`,
`GameEventPlayerDamaged`, `GameEventPlayerPoisoned`, `GameEventPlayerLivesChanged`, `GameEventManaPool`,
`GameEventCardChangeZone`, `GameEventAttackersDeclared`, `GameEventBlockersDeclared`, `GameEventCombatUpdate`,
`GameEventShuffle`, `GameEventLandPlayed`, `GameEventCardDamaged`, `GameEventCardTapped`, `GameEventCardCounters`,
`GameEventGameOutcome`, plus the bridge's own `browser-choice-offered`, `browser-choice-answered`,
`browser-action-submitted`, the cast-canceled kind (its identifier in the code carries the legacy UK spelling; do not
write it out in prose or the ratchet counts it, and rename it to `browser-cast-canceled` in phase 8 once the engine
owns the kind names), `browser-seat-conceded`, `combat-damage-assigned`,
`effect-choice-completed`, `mechanic-choice-completed`, `combat-state`, `projection`, `manifest`.

### 12.2 The engine's primitive set

Tier 0 (the seven decks), grouped, with the Forge ruler in parentheses only to show the measurement:

- Zones: `moveZone` (ChangeZone), `moveZoneAll` (ChangeZoneAll), `draw`, `discard`, `mill`, `shuffle`, `dig` (look at
  top N, choose, rest to bottom or graveyard), `surveil`, `scry`, `peekAndReveal`, `sacrifice`, `sacrificeAll`,
  `destroy`, `destroyAll`, `exileUntil`, `returnToHand`, `play` (cast or play without paying), `discover`.
- Mana and cost: `addMana`, `addManaReflected`, `tap`, `untap`, `untapAll`, `costReduction`, `alternativeCost`.
- Life and damage: `gainLife`, `loseLife`, `dealDamage`, `damageEach`, `damageAll`, `exchangeLife`, `fight`.
- Counters: `putCounter`, `putCounterAll`, `removeCounter`, `proliferate`, `multiplyCounters`, `moveCounters`,
  `replaceCounters`, `amass`.
- Permanents: `createToken`, `copyPermanent`, `animate`, `animateAll`, `attach`, `gainControl`, `setState` (transform,
  flip), `phaseOut`.
- Modifiers: `pump`, `pumpAll`, `alterAttribute`, `effectUntil` (a temporary static), `grantKeyword`.
- Flow: `modal` (Charm), `sequence`, `repeatFor` (RepeatEach), `branch`, `delayedTrigger`, `immediateTrigger`,
  `counterSpell`, `copySpell`, `addTurn`, `chooseCard`, `chooseType`, `genericChoice`, `twoPiles`, `connive`,
  `investigate`, `cleanup` (end-of-effect bookkeeping, not a card-visible primitive).
- Triggers: zone change (enters, dies, leaves, exiled), phase and step, attacks, attackers declared, blocks, spell
  cast, damage dealt (and once), discarded, drawn, land played, becomes target, sacrificed, counter added (and once),
  life gained, token created (once), becomes monstrous.
- Statics: continuous characteristic changes, combat damage by toughness, can't attack, can attack as though no
  defender, attack restriction, can't be cast, can't be blocked by, must attack, cost reduction, alternative cost,
  activate as though haste, Panharmonicon-style trigger doubling.
- Replacements: zone move (enters tapped, enters with counters, exile instead, command zone instead), counter,
  untap, add counter, proliferate.
- Cost atoms: mana, generic, `{T}`, `{Q}`, sacrifice (with selector), remove counters, add counters, discard, exile
  from graveyard, tap X untapped of a type, reveal, pay life, remove any counter, blight (a Forge-only term;
  ours names the actual card effect), mill, draw, return to hand.
- Keywords (53): flying, defender, flash, vigilance, lifelink, equip, haste, flashback, first strike, trample,
  enters with counters, overload, reach, enchant, deathtouch, indestructible, enters-the-battlefield replacements,
  alternate additional cost, menace, changeling, class, cycling, echo, crew, hexproof, partner, double strike,
  escape, protection, unearth, rebound, evoke, hideaway, landwalk, living weapon, escalate, multikicker, evolve,
  backup, convoke, cumulative upkeep, infect, flanking, umbra armor, encore, afterlife, storm, saga chapters, mentor,
  prowl, ascend, and the "increment" counter helper.

Tier 2 (the pool) is delivered as the three vocabularies of section 2.3: the go-live vocabulary in phase 7 (the top
40 primitives plus the families used by 20 or more cards, which with tier 0's additions closes over 80.5% of the
pool), enhancement 1 in phase 9 (the next 40 and the families used by 5 or more, 94.3%), enhancement 2 in phase 10
(the remaining 112 primitives and every remaining family the legality filter keeps). Each family arrives as its
own red-first PR; the one-card constructs in enhancement 2 get a scenario each rather than a parser rule.

Tier 1 adds (library-only): extra combat phases and steps (AddPhase), win and lose the game, dig until, regenerate,
clone, choose color, roll dice, replace token creation, goad, choose player, flip coin, the Ring tempts you,
earthbend, recruit, poison, protection grants, vote, fog, manifest and manifest dread, change targets, replace mana,
tap all, tap or untap, choose number, remove all counters, take the initiative, must block, reveal, choose even or
odd, add or remove counter, radiation, venture, drain mana, repeat, name a card, rearrange top of library, day and
night, exchange control, reveal hand, dig multiple; 27 more trigger kinds; static modes for cost raising, cast with
flash, can't sacrifice, unspent mana, optional costs, min and max blockers, untap during another player's untap;
replacement events for damage, draw, create token, gain life, produce mana, attached, lose mana, begin phase, begin
turn, copy spell; 71 more keywords.

### 12.3 Decision points a controller must answer

Forge's `PlayerController` declares 110 abstract decision methods. Used here as a checklist of moments the engine
must offer a choice at, grouped: starting player and mulligan (keep, bottom, tuck); play or activate (which ability,
optional costs, X, modes, targets, targets on copy, convoke and improvise, splice, delve); pay (mana from pool and
sources, assist, combat costs, cost during roll, cost to prevent effect); order (simultaneous triggers, costs,
attackers, blockers, moves to a zone, top of library after scry or surveil, dig); choose (cards for effect, single
card, pile, cards to discard, cards to sacrifice, cards to destroy, color, type, counter type, number, card name,
card face, state, protection type, keyword for pump, replacement effect to apply, static ability, spell ability,
entities, sector, dice to reroll or ignore); confirm (action, payment, trigger, replacement, static application,
bid); combat (declare attackers, declare blockers, assign combat damage, divide shield, exert, enlist); reveal
(hand, cards, unsupported); vote; notify of value.

### 12.5 Licensing the engine (applies decision 1)

Rob's intent is full ownership of the totality of CrankMagic, the play engine included. The repository's `LICENSE`
already does that: it vests the whole of the software in him, reserves every commercial right, and lists in §4 the
only things it cannot vest, which are the GPL adapter (§4(a)) and third-party content and data (§4(b) to (e)). The
engine therefore needs no new license; it needs the existing one applied to it cleanly and the one carve-out that
is code, §4(a), removed when the reason for it is gone. After go-live, everything in the product that is code is
Rob's, and everything that is not is third-party content kept separable by path. The executing session makes
these edits, in PR 0.1 for the first three and in the phase 8 removal PR for the last two:

1. **File headers.** Every file under `game/engine/`, `game/server/engine-runtime.mjs`, the engine tools and
   `data/engine/` schemas opens with `/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */`. A
   test (`tests/engine-headers.mjs`) fails on any engine file without it, and on any engine file carrying an SPDX
   identifier for a license other than the repository's. There is no SPDX identifier for the Source-Available
   License; the file header names it by path.
2. **`LICENSE` §2(c)** gains "its rules engine and its card definitions" to the list of parts that may not be
   incorporated elsewhere, so the enumeration matches what now exists.
3. **`docs/engine/ADR-001-own-engine.md`** records the clean-room rule (Comprehensive Rules and Scryfall oracle text
   in; nothing from Forge in; Forge run only as a behavioral oracle from a folder outside the product), the
   provenance of compiled definitions (produced through the Claude API under the Anthropic commercial terms in
   force at the time, which the ADR cites by date and which assign output rights to the customer; the session
   confirms the terms before the first compile run rather than relying on this sentence), and the provenance of
   hand-authored definitions (Rob's, or the session's under `LICENSE` §5).
4. **`LICENSE` §4(a)** is deleted at go-live, when `game/engine-adapter/` leaves the repository, and §4's preamble
   is reworded so nothing in the repository is GPL. **`THIRD-PARTY-NOTICES.md`** replaces the Forge section with a
   historical note: Forge was used as a behavioral test oracle from a folder outside the product between the dates
   given, and no Forge code or data remains.
5. **`DISCLAIMER.md` §1** keeps its Fan Content statement. The engine does not change it.

**Wizards' content, and keeping the option open (Rob, 2026-09-20).** CrankMagic, engine included, is Rob's. The
card names, oracle text and rules text the engine loads are Wizards of the Coast's, and `LICENSE` §4(b) already
records that the Fan Content Policy prohibits commercializing fan content. CrankMagic is for personal use unless
Wizards is interested; Rob hopes to do something with them and wants to be able to disentangle their content from
his IP easily if that conversation happens, provided it is not a heavy lift. It is not: the kernel, the schema,
the parser, the compiler and the pilots under `game/engine/` never need card text, and every card definition
already lives under `game/engine/cards/` and `data/engine/` with its oracle-text hash. So the separation is a
naming convention the design already has, not a feature to build. The executing session keeps card text out of
`game/engine/` other than `cards/`, and a light check in the existing `tests/engine-script.mjs` (no `oracleText`
field and no card name literal in a kernel module) holds the convention at no extra cost. Disentangling, if it
is ever wanted, is then a directory exclusion when packaging. Nothing else in the plan is gated on it.

The Comprehensive Rules are not vendored; the rules map cites section numbers. The Scryfall data carries Scryfall's
terms as recorded in the notices already.

### 12.4 The inventory script (becomes `game/tools/engine-inventory.mjs`)

Reads every non-archived deck in `data/live-state.json` and every card in `data/cards.json`, resolves each to its Forge
script through `forge-card-index.mjs`, and counts the effect primitives (`AB$`, `SP$`, `DB$`), trigger modes
(`T:Mode$`), static modes (`S:Mode$`), replacement events (`R:Event$`), keywords (`K:`) and cost atoms (`Cost$`) each
pool uses, plus the coverage curve by primitive frequency. Local-only (needs the Forge checkout); output committed
to `game/docs/engine-inventory.json`. The 2026-09-20 run is what section 2.3 reports. The working copy from this
planning session sits beside this plan in `docs/engine/` as `engine-inventory.mjs`, with its 2026-09-20 output in
`engine-inventory-2026-09-20.json`, and the two tier measurements as `engine-tiers.mjs` and `engine-vocab.mjs`;
PR 0.2 moves them to `game/tools/` rather than rewriting them. The scripts hard-code the repository and Forge paths
at the top; PR 0.2 makes them read `CRANKMAGIC_FORGE_ROOT` like the doctor does.
