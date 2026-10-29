# V8 evidence, wave 0

The journal and runtime-removal checks are two evidence methods. Neither a card's presence nor an offered ability is
an executed card. The original oracle definitions and rules are never modified by this harness.

## Commands and scope

Use Node 22. The unchanged default command remains the legacy definition/fidelity/smoke/scenario baseline:

```powershell
node --stack-size=4000 game/tools/batch/check-cards.mjs
```

**That default does not enforce the ability gate yet. G-3 default wiring remains open.** Requesting an ability ledger
fails the command when an ability has no passing-scenario execution proof:

```powershell
node --stack-size=4000 game/tools/batch/check-cards.mjs --ability-ledger <out.json> --counterfactual
```

`--cards 'Thran Dynamo|Glorious Anthem|Serra Angel'` checks only that named selection, and labels it as a selection in
both output and ledger. `--card-root <path-to-game/engine/cards>` reads another checkout's card definitions and scenarios
without copying or editing them. The engine and harness still come from the checkout running the command; record both
heads when using this option.

## What is credited

- A land-play event is a completed special action. A spell requires a correlated actual cast and successful
  non-fizzled resolution with the same stack ID and card name before its card receives clean-game exercise credit.
- Explicit ability-ID observations are recorded separately from an inferred unique printed spell. The inference is
  permitted only for a simple single-face card with exactly one printed spell ability, a matched actual cast, and a
  successful spell resolution. Copies, unmatched resolutions, multiple spell abilities, and compound layouts stay unknown.
- Rob authorized the runtime-removal supplement on October 28, 2026. It clones a valid runtime definition, removes
  one uniquely identified compiled ability or intrinsic keyword, and runs an originally passing scenario. Only that
  subject's definition is substituted. A changed scenario behavior must fail; a schema/fidelity error, generic engine
  exception, already-red baseline, or keyword-list assertion is not execution proof. Other fields and ability IDs stay intact.
- Every supplemental proof records its method, scenario, passing baseline, omitted runtime component, and failing
  behavior. Unsupported compound representations, ambiguous IDs, redundant abilities, and scenarios that still pass
  remain explicitly unobserved. An activation offer by itself is also excluded. No counterfactual spell removal is used.
- Scenario evidence never credits a card as exercised in a clean whole game. Game observations alone never close
  the scenario ability gate; `scenarioUnreached` names those still missing scenario proof. A successful-resolution
  observation must itself name a scenario: a scenario activation and an unrelated game's resolution cannot combine
  into scenario reachability. The mixed-source regression was added after the initial sweep started; that initial
  sweep contains only scenario input and remains anchored to its original `0a848bb4` process.

Probe results taking more than 30 seconds and scenario step-limit failures are not credited. The elapsed-time guard
records an over-budget probe when it returns; it does not preempt a synchronous engine call. A stuck engine can still
leave a measurement incomplete. The CLI writes partial ledger checkpoints after the original scenarios and every 250
definitions during runtime proofs, and marks the final output complete only after the sweep finishes. The baseline
cache holds counts, not thousands of saved game states.

## Measurements so far

The original saved scenarios of Dynamo, Anthem, and Serra passed but reached only 1 of 4 abilities. On W4's
`ae4d6ba6` saved source, the same selection has 5 passing scenarios and 4 of 4 behavior proofs: Dynamo produces mana,
Anthem boosts another creature, Flying prevents a ground block, and Vigilance keeps the attacker untapped. This is
selection evidence, not a whole-directory measurement.

The initial pool run used seeds 1-3, normal house pilots, a person in seat 0, replay, and leak checks. All 3 runs were
app-finished and strict-clean, with identical replays, zero AI/human refusals, and zero leaks in 273 checks. Seeds 1 and
3 stopped when the only human was eliminated; seed 2 reached a last-player-standing winner. They are not three
completed four-player matches with winners. Journal credit stops at each run's actual end.

The historical initial ledger observed 131 of 6,430 cards and 47 of 11,636 explicit successful-resolution ability IDs.
Those numbers precede the spell inference and runtime-removal supplement and are not relabeled. Final requirements
remain 200 consolidated pool games this wave and the program's 5,000-game gate, plus strict library/staging runs.

The full initial `0a848bb4` sweep completed with 11,023 passing scenarios, 6,086 of 11,636 abilities reached (1,840 by
runtime removal), and 5,550 unreached across 3,658 cards. These counts are provisional because that version prioritized
standalone names over conflicting face aliases. The corrected ownership index rejects every alias with multiple
distinct owners, including exact standalone keys, and caches the index so unknown fixtures do not rescan the directory.
New observations retain the journal's source name. There are 12 colliding names in the initial directory; none had cast,
play, resolution, or ability credit in the archived three-game pool ledger, so its historical 131-card count is unaffected
by this ownership correction.

The full historical ledger is archived as `evidence/ability-initial-0a848bb4.json.gz`, with a manifest, hashes, raw-data
secret scan, and readable provisional summary. It is retained as history, not authoritative gate evidence. A corrected
whole-directory sweep uses the new ownership code and reports its own exact harness head.

The authoritative initial sweep completed on `508afa94c70b00611e247d78adf23383d4403802`, using the same unchanged saved
cards/scenarios and original rules: 6,430 definitions, 11,023 scenarios, 0 failed; 6,079 of 11,636 abilities reached
(1,840 by runtime removal), 5,557 unreached across 3,665 cards, and 0 over-budget probes. The expected exit is 1.
This is initial debt measurement, not consolidated integration evidence. Ownership correction removed seven provisional
spell credits: Brainstorm, Careful Study, Raise Dead, Rampant Growth, Secret Rendezvous, Seething Song, and Wheel of Fortune.
Every ability remains in the denominator.

The corrected full ledger is `evidence/ability-corrected-508afa94.json.gz`; its manifest records code SHA and both raw
and compressed hashes. The readable `.summary.json` and `.backlog.json` group missing witnesses by card, theme, kind,
keyword, runtime rule, and text-template family. There are 733 families; grouping grants no execution credit.
The largest families are Flying (801), trample (215), vigilance (196), enters tapped (170), enchant (151), and haste (145).
Each future family-based writer still must produce and catch a behavioral witness separately for each card/ability.

Unreached abilities by routing theme: combat 1,954; spells 1,396; mana 912; tokens 486; graveyard 481; faces 238;
stack 75; walkers 15. By kind: keyword 2,926; activated 1,169; static 833; triggered 290; replacement 269; spell 70.
The core ledger's raw SHA-256 is `60bda8067fcb6acaf2e28b7987dbd8807182d40464a95bfc1fe6d1e6155f2532`.

Bounded independent reviews found no new rules conflict in W4's corrected noun/target binding and trample choice,
W5's printed-cost search and convoke alternatives, W1's copied preparation/emblem behavior, or W6's departure-time
spell copies and token faces. Extra live probes independently exercised copied-inset casting under another controller
and a countered original's copied spell after persisted reload. W1 subsequently identified a duplicate emblem text
rendering and is correcting it; the earlier behavior review does not close that display-data issue or any full theme.
