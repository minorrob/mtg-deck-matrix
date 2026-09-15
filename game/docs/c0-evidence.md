# C0 engine feasibility — executable checkpoint

September 15, 2026 UTC. Baseline website source: `e2bf018b96e7a6ecae702abdd963f450501ace38` (#219). Isolated branch: `codex/commander-engine-c0`. Forge: [`58bcd59062a3b44019195a3c25d6ab41a7fe2f61`](https://github.com/Card-Forge/forge/tree/58bcd59062a3b44019195a3c25d6ab41a7fe2f61), 2.0.15-SNAPSHOT, Java 17. No upstream Forge edits.

## Decision

**Continue with Forge as the rules-engine candidate. C0's release gate is not passed.** The prototype proves real four-deck play, useful event seams, a full-game RNG replay, health/loss behavior, and a recoverable opening choice. It does not yet prove the complete external decision interface, full causal telemetry, fair pilots, or recovery during resolution. Do not present this checkpoint as a playable human/API game or attach its results to measured deck recommendations.

[Run instructions](../README.md) · [Compact machine-readable evidence](../evidence/c0-proof.json) · [Accepted plan](../../docs/commander-simulator-plan-2026-09-15.md)

## Demonstrated capabilities

| Check | Result | Practical limit |
|---|---|---|
| Exact website deck snapshots | All six committed lists export as 100 including the commander; each has 99 library cards. Deck version, website fingerprint, Oracle identities, and gameplay hash are retained. | Current export is the committed public library fixture; live website/Lab/Archidekt exchange is pending. |
| Four actual decks in one game | Chulane, Krenko, Atraxa, and Shadrix load; all four pass Forge deck conformance. 319 deck-definition rows found, none missing. | Definitions found does not certify every ability or interaction. |
| Random draw behavior | Four physical libraries shuffle through the injected RNG; opening seven leaves 92 and preserves unique card instances. Filtered opening hands are disabled. | Broader tutor/reveal/random-source and cross-process fixtures still required. |
| Full game | `health-full-42`: 36 individual turns, Krenko wins, all three opponents lose through engine life checks. | Every seat used uncertified Forge-native AI. This is a proof fixture, not a performance recommendation. |
| Full replay | `health-replay-42`: all 13,408 primitive random requests consumed, all 1,950 diagnostic state hashes match, same 17,466 journal entries and final result. | Native AI is executed again. This is not a complete recorded-decision replay or a full restorable state. |
| Cast/resolution links | 97 cast events and 97 resolutions linked by recorded ability IDs. | Nested trigger causes, resource production/spend, replacements, and loop iteration accounting need more instrumentation. |
| Typed boundary | Opening-player request/response; stale state and unoffered option are rejected before the valid response. | Targets, payments, modes, trigger order, attacks, blocks, mulligans, and in-resolution choices are not yet bridged. |
| Pending-choice restart | Kill before answering; restart with the saved RNG prefix and identical provenance; reissued choice matches exactly before one accepted response. | Opening-player choice only. No mid-stack/durable engine checkpoint claim. |
| Seat visibility fixture | Four output views checked for hidden libraries and opponent hands at a no-reveal checkpoint. | Not a certification of all reveal, face-down, control-changing, or effect paths. Raw journals remain private. |
| Health and loss rules | 19 focused assertions against actual Forge behavior pass. | These do not certify every alternate win/loss card. Pooled commander damage remains an unimplemented house option. |
| AI policy contract | Five independent difficulty budgets; individual draws invalidate plans; stale/illegal answers rejected. | Search, draw-event wiring, provider, difficulty calibration, and spending controls are pending. |
| Interactive table | Central phone-style four-player counter, commander breakdown, actual card art, board focus, public-zone inspection, large hand view, timeline, and per-seat difficulty setup exercised in the browser. | Read-only replay. The preview omits full stack/attachments and token artwork; no human action mutates the engine. |

The winning seat finished at **3 life, 5 poison, and 15 combat damage from its largest commander source**. These are separate quantities. The final recorded action sequence includes Purphoros triggers and Skirk Fire Marshal damage; the journal identifies the source of each player-damage event.

## Loss-rule fixtures

The Java fixture checks life 1/0/negative, poison 9/10, 11+10 damage from different commanders, 20/21 from one commander, life gain preserving commander history, combat versus noncombat commander damage, empty library versus attempted draw, Platinum Angel exceptions, concession while protected, player removal with three seats continuing, owned permanent cleanup, and card-effect loss. Counters display engine-authoritative outcomes. Attacks do not deduct values until damage actually occurs after applicable rules.

Standard Commander uses 40 starting life, 10 poison to lose, and 21 combat damage from **one** commander. Separate partner commanders and changes of controller do not combine their identities. The optional pooled rule in the accepted plan must be implemented inside engine state-based checks, with separate result labeling and exception tests. [Official rules](https://magic.wizards.com/en/rules)

## Findings that change implementation work

### Native pilot fairness is a gate

Source inspection found native AI paths that can inspect unrevealed opponent-library information: `PlayerControllerAi.chooseCardName`'s `MostProminentInHumanDeck` path and `ClashAi.chooseSinglePlayer`'s comparison to an opponent's top card. Native pilot use therefore remains explicitly uncertified. Do not pass engine objects to the API broker or use native AI as a supposedly fair fallback without auditing these paths and testing hidden-state permutations.

The API pilot should receive only a seat-filtered observation and offered choice IDs. Difficulty changes effort, not visibility. Draw events invalidate planning; the next legal decision evaluates the whole current hand. The new policy contract proves rejection behavior, not strategic quality or API integration.

### Native timeouts can change the game

The earlier full replay (`full-replay-42`) diverged after a native five-second AI timeout injected a pass. The adapter now gives native AI a long internal limit and uses the parent watchdog to abort the entire run instead. The corrected full-game pair above matches. A watchdog abort is incomplete, never a win, pass, or rules draw.

### Token/untap stress case

Seed 220 with a longer horizon reached a large cross-deck chain: Chulane's Intruder Alarm untapped creatures as Krenko generated Goblins, enabling repeated activations and a rapidly expanding battlefield. The original run exceeded 900 permanents and hit the 180-second watchdog. This is a useful stress fixture for the planned causal graph, legal shortcut handling, and dense-board rendering. It is not yet a validated loop counter or automatic infinite-loop determination.

### Recovery is narrower than a saved game

The RNG-prefix restart demonstrates a durable pending opening choice. Forge's experimental snapshot machinery is not an existing complete disk-save protocol. Required work remains: intercept every choice, journal answers atomically, recover through nested resolutions, and verify a resumed state without repeating API calls. The current projection omits material state and cannot be used to restore an arbitrary game.

## Validation and build qualifications

- Portable JDK archive SHA-256: `e53a79c3c3d86865bd7e787903884331068e71321714ffd44f145785affc7cb0`; downloaded from the official Temurin release. Maven 3.9.11 built the pinned Forge desktop dependency jar.
- Engine jar SHA-256: `16a3e58be182ec32dd9291c29f5a4ba2fb192ab47bdd305f65fcfe42b07a5ee0`. Run manifests record jar, adapter, and pod hashes. Rebuild hashes may differ because the upstream build embeds build metadata.
- Maven reactor build passed with upstream tests and Checkstyle skipped. The explicit Java loss fixtures and Node replay checks above were run separately; this is not a full upstream Forge regression run.
- All 62 existing/new root Node suites were attempted on Windows. After correcting unchanged checkout line endings, documenting the two new suites, regenerating data-inventory readers, and fixing two Windows path comparisons in `tests/generators.mjs`, 60 suites pass. The existing `browser-geometry` and `page-budget` suites fail at a Windows absolute-module import before any browser assertions. The generator suite also reports its existing `build-live-load` check skipped because its `python3` lacks openpyxl.
- Companion UI checked independently through the browser: counter breakdown, finished-game totals/out states, per-opponent difficulty selection, hand gallery, large card inspection, and card-image repair. No browser console errors observed during those checks.
- Website production modules and both pre-existing working checkouts remain unchanged. No report has been imported as measured evidence. No key was requested and no paid AI call was made.

## Next implementation gate

1. Bridge a scripted spell/response sequence through real targets and payment, plus simultaneous trigger ordering, attack/block assignment, and a choice during resolution. Record every accepted answer.
2. Kill and recover that scenario with an unresolved stack choice. Prove identical resulting state and no duplicate application.
3. Certify the seat observation boundary using hidden-state permutations, reveals, face-down objects, and control changes. Replace or constrain native fallback paths that inspect hidden data.
4. Add source/ability/cause IDs for triggers, mana produced/spent, replacements, and repeated lines; reconcile expected totals independently.
5. Reconcile #220's final shared UI changes before website integration. It remained unavailable at the C0 baseline check; the game-specific files are isolated so its Shelf work can continue.

Only after those gates should C2 be described as a playable core. The phone-counter layout and difficulty controls are retained as UI requirements throughout the remaining work.
